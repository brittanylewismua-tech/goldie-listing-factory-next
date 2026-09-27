/** Local USPTO register fallback. Official lifecycle codes and active classes
 * are interpreted in trademark-record.ts; current phrase queries also use
 * the public USPTO search in trademark-live.ts.
 */
import { blocks, singleEntryDeflateStream } from "@/app/uspto-bulk";
import { normalize, squeeze, readRecord, worthKeeping, meaningfulMarkMatch, isLiveStatus, isRegisteredStatus, INACTIVE_STATUS_CODES, type RegisterHit } from "@/app/trademark-record";
import { TRADEMARK_ARCHIVE_DAY, trademarkFileDay } from "@/app/trademark-import-coverage";

export { normalize, squeeze, readRecord, worthKeeping, PRINTED_CLASSES } from "@/app/trademark-record";
export type { RegisterHit } from "@/app/trademark-record";

export async function ensureRegisterTables(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS tm_marks (
      serial TEXT PRIMARY KEY,
      normalized TEXT NOT NULL,
      mark TEXT NOT NULL,
      owner TEXT NOT NULL DEFAULT '',
      registration TEXT NOT NULL DEFAULT '',
      status_code INTEGER NOT NULL DEFAULT 0,
      classes TEXT NOT NULL DEFAULT '',
      updated TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS tm_marks_normalized ON tm_marks (normalized)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS tm_ingest_files (
      name TEXT PRIMARY KEY,
      product TEXT NOT NULL,
      url TEXT NOT NULL,
      covers TEXT NOT NULL DEFAULT '',
      bytes INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'waiting',
      priority INTEGER NOT NULL DEFAULT 5,
      records INTEGER NOT NULL DEFAULT 0,
      done_records INTEGER NOT NULL DEFAULT 0,
      kept INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      finished TEXT
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS tm_ingest_state ON tm_ingest_files (state, priority)`),
  ]);

  /*
    CREATE TABLE IF NOT EXISTS IS A NO-OP ON A TABLE THAT ALREADY EXISTS.

    This codebase has lost three deploys to that fact: a column added to the
    CREATE statement simply never appears on the live table, and the failure
    shows up later as "no such column" in something unrelated. So every column
    added after the first release is also stated as an ALTER, and the only
    error tolerated is the one that means it is already there.
  */
  for (const column of ["done_records INTEGER NOT NULL DEFAULT 0", "started TEXT",
    /* D1574: when the other side is rate limiting, when to ask again and how
       many times it has refused in a row. */
    "retry_after TEXT", "strikes INTEGER NOT NULL DEFAULT 0",
    /* D1644: how many times this file has failed the SAME way in a row. The
       permanent-failure list is a list of error strings somebody thought of,
       and a failure nobody listed still has to stop being retried. */
    "repeats INTEGER NOT NULL DEFAULT 0"]) {
    try {
      await db.prepare(`ALTER TABLE tm_ingest_files ADD COLUMN ${column}`).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/duplicate column/i.test(message)) throw error;
    }
  }

  /* The same rule for tm_marks: the squeezed form is a column added after the
     first release, so the CREATE above will never produce it on a live table. */
  try {
    await db.prepare(`ALTER TABLE tm_marks ADD COLUMN squeezed TEXT NOT NULL DEFAULT ''`).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/duplicate column/i.test(message)) throw error;
  }

  /*
    INDEXED HERE, NOT IN THE BATCH ABOVE.

    It was in that batch first, and on a live table the column did not exist
    yet — so the index statement failed, and because the batch is atomic it
    took every other CREATE with it. The whole route answered 500. An index on
    a column can only be created after the column is.
  */
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS tm_marks_squeezed ON tm_marks (squeezed)`).run();

  for (const column of ["source_day TEXT NOT NULL DEFAULT ''", "searchable INTEGER NOT NULL DEFAULT 1"]) {
    try {
      await db.prepare(`ALTER TABLE tm_marks ADD COLUMN ${column}`).run();
    } catch (error) {
      if (!/duplicate column/i.test(error instanceof Error ? error.message : "")) throw error;
    }
  }
  // Previously, importing the archive after a daily file could restore old
  // wording or a cancelled mark. Replay the existing daily files once so their
  // source dates and removals protect them from all subsequent older imports.
  await db.prepare(`CREATE TABLE IF NOT EXISTS tm_ingest_repairs (id TEXT PRIMARY KEY)`).run();
  await db.batch([
    db.prepare(`UPDATE tm_ingest_files SET state = 'waiting', done_records = 0,
      records = 0, kept = 0, finished = NULL, retry_after = NULL, strikes = 0, repeats = 0
      WHERE product = 'TRTDXFAP' AND state = 'done' AND name LIKE '%.zip'
        AND NOT EXISTS (SELECT 1 FROM tm_ingest_repairs WHERE id = 'source-day-v1')`),
    db.prepare(`INSERT OR IGNORE INTO tm_ingest_repairs (id) VALUES ('source-day-v1')`),
  ]);

  // Replay source files once: the former <800 filter discarded renewed marks.
  // Keep newer source dates, existing records, and rate-limit cooldowns intact.
  await db.batch([
    db.prepare(`UPDATE tm_ingest_files SET state = 'waiting', done_records = 0,
      records = 0, kept = 0, finished = NULL, started = NULL
      WHERE state IN ('done','partial') AND name LIKE '%.zip'
        AND NOT EXISTS (SELECT 1 FROM tm_ingest_repairs WHERE id = 'uspto-status-v2')`),
    db.prepare(`INSERT OR IGNORE INTO tm_ingest_repairs (id) VALUES ('uspto-status-v2')`),
  ]);

  /*
    Backfill for rows written before the column existed. Derived in SQL from
    `normalized`, which is exactly what squeeze() does to it, so the two can
    not disagree. Bounded per call: it is a no-op once drained, and a slow
    drain is better than one statement that times out and never completes.
  */
  await db.prepare(
    `UPDATE tm_marks SET squeezed = REPLACE(normalized, ' ', '')
      WHERE squeezed = '' AND normalized <> '' AND serial IN (
        SELECT serial FROM tm_marks WHERE squeezed = '' AND normalized <> '' LIMIT 50000)`).run()
    .catch(() => {});
}

/** A resumed import must not spend another USPTO file-download request.
 * Public archive downloads have a per-file annual request limit. Store the
 * whole compressed file atomically before processing any resumable slice.
 */
export async function trademarkArchiveStream(file:{name:string;url:string;product:string},apiKey:string,bucket?:R2Bucket):Promise<ReadableStream<Uint8Array>> {
  const cacheKey=`trademark-archives/${file.product}/${file.name}`;
  if(bucket){const saved=await bucket.get(cacheKey);if(saved)return saved.body;}
  const response=await fetch(file.url,{headers:{"X-API-KEY":apiKey,"user-agent":"GoldieSuite/1.0 (+https://thegoldiesuite.com)"}});
  if(!response.ok||!response.body){
    const reason=response.status===429?(await response.text()).slice(0,1000):'';
    if(/31536000\s+sec|annual/i.test(reason))throw Error(`USPTO annual download limit reached for ${file.name}. A quota reset is required; automatic retries cannot recover this file.`);
    throw Error(`USPTO answered ${response.status} for ${file.name}`);
  }
  if(!bucket)return response.body;
  await bucket.put(cacheKey,response.body,{httpMetadata:{contentType:'application/zip'}});
  const saved=await bucket.get(cacheKey);
  if(!saved)throw Error('Trademark archive was not stored completely');
  return saved.body;
}

const WRITE_BATCH = 100;

/**
 * Read one bulk file into the register.
 *
 * Streamed end to end, so the file's size decides how long it takes and never
 * how much memory it needs. Writes go in batches because a million single
 * statements would spend the whole run waiting on round trips.
 */
export async function ingestFile(
  db: D1Database,
  file: { name: string; url: string; product: string; covers?: string },
  apiKey: string,
  options: { deadline?: number; skip?: number; archiveBucket?:R2Bucket } = {},
): Promise<{ records: number; kept: number; complete: boolean }> {
  const deadline = options.deadline ?? Date.now() + 240_000;
  const sourceDay = trademarkFileDay(file);
  /* A file too big to finish inside one firing is resumed by number of
     records, not by byte offset: a deflate stream cannot be re-entered part
     way, but skipping records already written costs only the inflating, and
     that is what makes a hundred-and-thirty-megabyte file finish eventually
     instead of restarting forever. */
  const skip = options.skip ?? 0;
  const archive = await trademarkArchiveStream(file,apiKey,options.archiveBucket);
  const xml = await singleEntryDeflateStream(archive);
  const now = new Date().toISOString();
  let records = 0;
  let kept = 0;
  let pending: D1PreparedStatement[] = [];
  let complete = true;

  const flush = async () => {
    if (!pending.length) return;
    await db.batch(pending);
    pending = [];
  };

  const insert = db.prepare(
    `INSERT INTO tm_marks (serial, normalized, squeezed, mark, owner, registration, status_code, classes, updated, source_day, searchable)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(serial) DO UPDATE SET
       normalized = excluded.normalized, squeezed = excluded.squeezed,
       mark = excluded.mark, owner = excluded.owner,
       registration = excluded.registration, status_code = excluded.status_code,
       classes = excluded.classes, updated = excluded.updated,
       source_day = excluded.source_day, searchable = excluded.searchable
     WHERE excluded.source_day >= tm_marks.source_day`,
  );
  const drop = db.prepare(`DELETE FROM tm_marks WHERE serial = ? AND source_day <= ?`);

  for await (const block of blocks(xml, "case-file")) {
    records += 1;
    if (records <= skip) continue;
    const record = readRecord(block);
    if (!record.serial) continue;
    if (worthKeeping(record)) {
      kept += 1;
      pending.push(
        insert.bind(
          record.serial,
          normalize(record.mark),
          squeeze(record.mark),
          record.mark,
          record.owner,
          record.registration,
          record.statusCode,
          record.classes.join(","),
          now,
          sourceDay,
          1,
        ),
      );
    } else if (sourceDay > TRADEMARK_ARCHIVE_DAY) {
      // Keep only a small, non-searchable removal record. Without it, a later
      // import of an older file could resurrect a cancelled/design-only mark.
      pending.push(insert.bind(record.serial, "", "", "", "", "", record.statusCode,
        "", now, sourceDay, 0));
    } else {
      // The archive predates every daily update; its millions of old dead
      // records need no tombstones and cannot delete newer versions.
      pending.push(drop.bind(record.serial, sourceDay));
    }
    if (pending.length >= WRITE_BATCH) await flush();
    /* Stop cleanly rather than being killed mid-file: the file stays unfinished
       and the next tick starts it again, which is safe because every write is
       an upsert. */
    if (records % 500 === 0 && Date.now() > deadline) {
      complete = false;
      break;
    }
  }
  await flush();
  return { records, kept, complete };
}

/**
 * What the register knows about a phrase.
 *
 * Exact match on the normalized phrase, and containment the other way — a
 * mark wholly inside the phrase is the case that gets shops removed, because
 * "Bluey birthday shirt" is not a different mark from "Bluey".
 */
export async function lookup(db: D1Database, phrase: string): Promise<RegisterHit[]> {
  const normalized = normalize(phrase);
  if (normalized.length < 2) return [];
  const words=normalized.split(' '),terms=new Set<string>();
  for(let start=0;start<words.length;start++)for(let end=start+1;end<=words.length;end++)terms.add(words.slice(start,end).join(' '));
  const squeezed=squeeze(phrase);
  const candidates=await db.prepare(`SELECT mark,owner,serial,registration,classes,status_code
    FROM tm_marks WHERE searchable=1
      AND status_code > 0 AND (status_code < 900 OR status_code = 973)
      AND status_code NOT IN (SELECT value FROM json_each(?3))
      AND (normalized IN (SELECT value FROM json_each(?1)) OR squeezed = ?2)
    ORDER BY LENGTH(normalized) DESC,serial LIMIT 200`)
    .bind(JSON.stringify([...terms]),squeezed,JSON.stringify(INACTIVE_STATUS_CODES))
    .all<{mark:string;owner:string;serial:string;registration:string;classes:string;status_code:number}>();

  const padded = ` ${normalized} `;
  return (candidates.results ?? [])
    /* Either the mark sits inside the phrase on word boundaries, or the two
       are the same mark once their spacing is disregarded. */
    .filter(row => isLiveStatus(row.status_code))
    .filter(row => meaningfulMarkMatch(row.mark, phrase))
    .filter(row => padded.includes(` ${normalize(row.mark)} `)
      || squeeze(row.mark) === squeezed)
    .map(row => ({
      mark: row.mark,
      owner: row.owner,
      serial: row.serial,
      registration: row.registration,
      classes: row.classes ? row.classes.split(",") : [],
      registered: isRegisteredStatus(row.status_code, row.registration),
    }))
    /* The closest thing to the phrase first, then registrations over pending. */
    .sort((a, b) =>
      normalize(b.mark).length - normalize(a.mark).length ||
      Number(b.registered) - Number(a.registered));
}

export async function registerSize(db: D1Database): Promise<{ marks: number; files: { state: string; count: number }[] }> {
  const marks = await db.prepare(`SELECT COUNT(*) AS n FROM tm_marks WHERE searchable = 1`).first<{ n: number }>();
  const files = await db
    .prepare(`SELECT state, COUNT(*) AS n FROM tm_ingest_files WHERE name LIKE '%.zip' GROUP BY state`)
    .all<{ state: string; n: number }>();
  return {
    marks: Number(marks?.n ?? 0),
    files: (files.results ?? []).map(row => ({ state: row.state, count: Number(row.n) })),
  };
}
