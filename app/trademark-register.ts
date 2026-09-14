/**
 * OUR COPY OF THE FEDERAL REGISTER, NARROWED TO WHAT GETS PRINTED.
 *
 * USPTO offers no keyword search for trademarks, only bulk XML (measured:
 * every trademark search path answers "Missing Authentication Token", while
 * the patent one answers 200). So the register has to live here.
 *
 * IT IS NARROWED ON PURPOSE. Twelve million records, most of them for things
 * nobody puts on a t-shirt, would make every answer worse: a seller typing
 * "cozy season" does not need to hear about an industrial lubricant. We keep
 * live marks in the classes a print-on-demand seller actually sells into, and
 * nothing else. That is a few hundred thousand rows rather than millions, and
 * it is the set where a hit means something.
 *
 * WHAT COUNTS AS LIVE. USPTO's status codes run 600s for pending, 700s for
 * registered, 800s for dead — abandoned, cancelled, expired. A cancellation
 * date is the same news said another way. Anything dead is dropped on the way
 * in, because a dead mark is not a reason to change a design.
 */
import { blocks, singleEntryDeflateStream } from "@/app/uspto-bulk";
import { normalize, readRecord, worthKeeping, type RegisterHit } from "@/app/trademark-record";

export { normalize, readRecord, worthKeeping, PRINTED_CLASSES } from "@/app/trademark-record";
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
  for (const column of ["done_records INTEGER NOT NULL DEFAULT 0", "started TEXT"]) {
    try {
      await db.prepare(`ALTER TABLE tm_ingest_files ADD COLUMN ${column}`).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/duplicate column/i.test(message)) throw error;
    }
  }
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
  file: { name: string; url: string; product: string },
  apiKey: string,
  options: { deadline?: number; skip?: number } = {},
): Promise<{ records: number; kept: number; complete: boolean }> {
  const deadline = options.deadline ?? Date.now() + 240_000;
  /* A file too big to finish inside one firing is resumed by number of
     records, not by byte offset: a deflate stream cannot be re-entered part
     way, but skipping records already written costs only the inflating, and
     that is what makes a hundred-and-thirty-megabyte file finish eventually
     instead of restarting forever. */
  const skip = options.skip ?? 0;
  const response = await fetch(file.url, {
    headers: { "X-API-KEY": apiKey, "user-agent": "Goldie/1.0 (+https://thegoldiesuite.com)" },
  });
  if (!response.ok || !response.body)
    throw new Error(`USPTO answered ${response.status} for ${file.name}`);

  const xml = await singleEntryDeflateStream(response.body);
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
    `INSERT INTO tm_marks (serial, normalized, mark, owner, registration, status_code, classes, updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(serial) DO UPDATE SET
       normalized = excluded.normalized, mark = excluded.mark, owner = excluded.owner,
       registration = excluded.registration, status_code = excluded.status_code,
       classes = excluded.classes, updated = excluded.updated`,
  );
  const drop = db.prepare(`DELETE FROM tm_marks WHERE serial = ?`);

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
          record.mark,
          record.owner,
          record.registration,
          record.statusCode,
          record.classes.join(","),
          now,
        ),
      );
    } else if (!record.live) {
      /* A mark that has died since we last saw it must stop being a warning. */
      pending.push(drop.bind(record.serial));
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
  const words = normalized.split(" ");
  /* Candidates are every mark short enough to sit inside the phrase and
     sharing its first word — the index makes that cheap, and the containment
     test then runs over a handful of rows rather than the whole table. */
  const candidates = await db
    .prepare(
      `SELECT mark, owner, serial, registration, classes, status_code
         FROM tm_marks
        WHERE normalized = ?1
           OR normalized LIKE ?2
           OR ?1 LIKE normalized || ' %'
        LIMIT 200`,
    )
    .bind(normalized, `${words[0]} %`)
    .all<{
      mark: string; owner: string; serial: string;
      registration: string; classes: string; status_code: number;
    }>();

  const padded = ` ${normalized} `;
  return (candidates.results ?? [])
    .filter(row => padded.includes(` ${normalize(row.mark)} `))
    .map(row => ({
      mark: row.mark,
      owner: row.owner,
      serial: row.serial,
      registration: row.registration,
      classes: row.classes ? row.classes.split(",") : [],
      registered: row.status_code >= 700 && row.status_code < 800,
    }))
    /* The closest thing to the phrase first, then registrations over pending. */
    .sort((a, b) =>
      normalize(b.mark).length - normalize(a.mark).length ||
      Number(b.registered) - Number(a.registered));
}

export async function registerSize(db: D1Database): Promise<{ marks: number; files: { state: string; count: number }[] }> {
  const marks = await db.prepare(`SELECT COUNT(*) AS n FROM tm_marks`).first<{ n: number }>();
  const files = await db
    .prepare(`SELECT state, COUNT(*) AS n FROM tm_ingest_files GROUP BY state`)
    .all<{ state: string; n: number }>();
  return {
    marks: Number(marks?.n ?? 0),
    files: (files.results ?? []).map(row => ({ state: row.state, count: Number(row.n) })),
  };
}
