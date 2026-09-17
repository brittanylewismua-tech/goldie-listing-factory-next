import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { filesFromProduct, productFilesUrl } from "@/app/uspto-bulk";
import { ensureRegisterTables, ingestFile, registerSize } from "@/app/trademark-register";
import { isRateLimit, retryAfter } from "@/app/uspto-backoff";

/**
 * ONE BULK FILE PER FIRING.
 *
 * The register arrives as ninety-odd historical files plus one a day forever.
 * Nothing here tries to do it in one go: each cron firing takes the next file
 * and stops on a deadline well short of the worker's limit. Every write is an
 * upsert keyed on the serial number, so a file interrupted halfway is simply
 * started again — the only cost is repeated work, never a wrong row.
 *
 * TODAY BEFORE 1953. The daily files are read first, because a mark filed
 * last week is the one a seller cannot look up anywhere else. The backfile
 * fills in behind it over the following days.
 *
 * Same authentication as the sweep: a request the worker built for itself
 * carries no cf-connecting-ip, and no caller on the internet can strip one.
 */
const key = () => (env as unknown as { USPTO_API_KEY?: string }).USPTO_API_KEY?.trim() || "";

/* Enough recent days to cover a gap of a fortnight without a special path. */
const DAILY_DAYS = 21;
/* How many identical failures before a file is parked regardless of what its
   error says. Three is enough to rule out a bad minute and small enough that
   one bad file cannot cost the queue a day. */
const REPEATED_FAILURE_LIMIT = 3;
const DEADLINE_MS = 120_000;

const isoDay = (offsetDays: number) =>
  new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);

async function seed(db: D1Database): Promise<number> {
  const apiKey = key();
  const wanted: Array<{ product: string; from: string; to: string; priority: number }> = [
    /* Yesterday and the fortnight behind it: the current edge of the register. */
    { product: "TRTDXFAP", from: isoDay(DAILY_DAYS), to: isoDay(0), priority: 1 },
    /* Everything the office has ever registered, filled in behind. */
    { product: "TRTYRAP", from: "2025-01-01", to: "2025-12-31", priority: 5 },
  ];

  let added = 0;
  for (const want of wanted) {
    const response = await fetch(productFilesUrl(want.product, want.from, want.to), {
      headers: { "X-API-KEY": apiKey, "user-agent": "Goldie/1.0 (+https://thegoldiesuite.com)" },
    });
    if (!response.ok) continue;
    const files = filesFromProduct(await response.json());
    for (const file of files) {
      const result = await db
        .prepare(
          `INSERT INTO tm_ingest_files (name, product, url, covers, bytes, priority)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(name) DO NOTHING`,
        )
        .bind(file.name, want.product, file.url, file.to, file.bytes, want.priority)
        .run();
      added += result.meta?.changes ?? 0;
    }
  }
  return added;
}

/*
  DECLARED BEFORE THE HANDLER THAT CALLS IT, NOT AFTER.

  D1646 moved the body into a function below the GET export and relied on
  hoisting. The bundler rewrites it as a const arrow, which does not hoist, so
  every firing threw "Cannot access 'c' before initialization" before reaching
  the file read — and the ingest froze at 32 files for as long as that build
  was live. The detailed error added in the same commit is the only reason it
  was visible at all rather than another silent stall.
*/
async function runTick(db: D1Database, request: Request) {
  void request;
  await ensureRegisterTables(db);

  /* Re-seeding is cheap and idempotent, and it is what picks up yesterday's
     file without anyone remembering to. */
  const added = await seed(db);

  /*
    RECLAIM WHAT DIED MID-FILE.

    A firing that is killed — a deploy, a limit, a bad minute at Cloudflare —
    leaves its file marked running, and nothing would ever pick it up again.
    The queue would look busy and quietly stop. Anything running for longer
    than a firing could possibly last goes back in the queue, keeping the
    records it had already written.
  */
  await db
    .prepare(
      `UPDATE tm_ingest_files
          SET state = CASE WHEN done_records > 0 THEN 'partial' ELSE 'waiting' END,
              note = 'Reclaimed after an interrupted run'
        WHERE state = 'running'
          AND (started IS NULL OR started < ?)`,
    )
    .bind(new Date(Date.now() - 15 * 60_000).toISOString())
    .run();

  /*
    Park every documentation file at once rather than one per firing. The seed
    filters them out now, but rows queued before that fix are still in the
    table, and spending a firing each to discover they are Word documents is
    the slowest possible way to find out.
  */
  await db
    .prepare(
      `UPDATE tm_ingest_files SET state = 'skipped', note = 'Not a data file'
        WHERE state IN ('waiting', 'partial') AND name NOT LIKE '%.zip'`)
    .run();

  /*
    DAILY FIRST, BUT NOT DAILY FOREVER.

    Strict priority order meant a daily file always beat the historical
    backfile — and a new daily file arrives every day. Measured over four days:
    the daily files completed one per day and the last historical chunk
    finished on 2026-09-14, leaving 88 waiting with no path to ever running.
    The register was progressing and the initial queue was starved, which is
    why "marks are increasing" and "the backfile is stuck" were both true.

    A file already in progress is always resumed. Otherwise today's daily work
    goes first, and once there is none pending, the backfile advances. So the
    register stays current AND the initial queue finishes.
  */
  const resuming = await db
    .prepare(
      `SELECT name, product, url, done_records, strikes, repeats, note FROM tm_ingest_files
        WHERE state = 'partial' ORDER BY priority ASC, name DESC LIMIT 1`)
    .first<{ name: string; product: string; url: string; done_records: number;
      strikes: number; repeats: number; note: string }>();

  /*
    RESUMING A PARTIAL FILE WAS NOT ENOUGH.

    The first attempt at this only moved partial files to the front, then still
    ordered waiting files by priority — so a daily file (priority 1) continued
    to beat every historical chunk (priority 5), and a new daily file arrives
    every day. Measured after that change: 26 files done, 88 still waiting, and
    NO historical file completed between 2026-09-14 and 2026-09-16 while the
    daily files kept completing. The diagnosis was right and the fix was not.

    So the backfile now gets a guaranteed turn. Today's daily work still goes
    first — the register must stay current — but once the newest daily file is
    done, the tick spends itself on history instead of idling against a queue
    it will never reach.
  */
  const dailyWaiting = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM tm_ingest_files
        WHERE state = 'waiting' AND priority <= 2
          AND (retry_after IS NULL OR retry_after <= ?)`)
    .bind(new Date().toISOString())
    .first<{ n: number }>();

  const preferHistorical = Number(dailyWaiting?.n ?? 0) === 0;

  const next = resuming ?? await db
    .prepare(
      preferHistorical
        /* A file under backoff is not available. Skipping it lets the rest of
           the queue advance instead of the whole backfile stopping behind one
           refusal. */
        ? `SELECT name, product, url, done_records, strikes, repeats, note FROM tm_ingest_files
            WHERE state = 'waiting' AND (retry_after IS NULL OR retry_after <= ?)
            ORDER BY priority DESC, name DESC
            LIMIT 1`
        : `SELECT name, product, url, done_records, strikes, repeats, note FROM tm_ingest_files
            WHERE state = 'waiting' AND (retry_after IS NULL OR retry_after <= ?)
            ORDER BY priority ASC, name DESC
            LIMIT 1`,
    )
    .bind(new Date().toISOString())
    .first<{ name: string; product: string; url: string; done_records: number;
      strikes: number; repeats: number; note: string }>();

  if (!next) return NextResponse.json({ added, idle: true, ...(await registerSize(db)) });

  await db
    .prepare(`UPDATE tm_ingest_files SET state = 'running', started = ? WHERE name = ?`)
    .bind(new Date().toISOString(), next.name)
    .run();

  try {
    const result = await ingestFile(db, next, key(), {
      deadline: Date.now() + DEADLINE_MS,
      skip: Number(next.done_records ?? 0),
    });
    await db
      .prepare(
        `UPDATE tm_ingest_files
            SET state = ?, records = ?, kept = kept + ?, done_records = ?, note = '', finished = ?,
                retry_after = NULL, strikes = 0
          WHERE name = ?`,
      )
      .bind(
        result.complete ? "done" : "partial",
        result.records,
        result.kept,
        result.complete ? 0 : result.records,
        new Date().toISOString(),
        next.name,
      )
      .run();
    return NextResponse.json({ added, file: next.name, ...result, ...(await registerSize(db)) });
  } catch (error) {
    const note = error instanceof Error ? error.message : "failed";
    /*
      A RETRY IS FOR A BAD MINUTE, NOT A BAD FILE.

      A file that cannot be read will fail identically forever, and because
      the queue is ordered the same way every time, it blocks everything
      behind it — measured: nine hours of nothing while a .doc was retried.
      A permanent failure is parked as skipped and stays visible; only
      transient failures go back in the queue.
    */
    const permanent = /Not a zip|not deflate|Truncated zip/i.test(note);
    /*
      AND A FAILURE NOBODY LISTED IS STILL A FAILURE.

      The list above is a list of error strings somebody thought of, and this
      is the second error to walk past it. "Trailing bytes after end of
      compressed data" matched nothing, so every one of the 88 historical
      files was classified transient, went back in the queue in the same
      order, and was retried forever — the exact failure the comment below
      already describes, reached through a message the pattern did not know.

      A file that has failed the same way repeatedly is parked whatever it
      says. The note stays visible, so a wrongly parked file is findable
      rather than lost.
    */
    const sameAgain = (next.note ?? "").slice(0, 300) === note.slice(0, 300);
    const repeats = sameAgain ? Number(next.repeats ?? 0) + 1 : 1;
    const exhausted = !limited && repeats >= REPEATED_FAILURE_LIMIT;
    /*
      AND A RATE LIMIT IS NEITHER.

      429 is the other side asking for time. Putting the file straight back in
      the queue turned that request into twenty-minute hammering for two days.
      It goes back in the queue with a time attached, escalating while the
      refusals continue.
    */
    const limited = isRateLimit(note);
    const strikes = limited ? Number(next.strikes ?? 0) + 1 : 0;
    await db
      .prepare(
        `UPDATE tm_ingest_files
            SET state = ?, note = ?, retry_after = ?, strikes = ?, repeats = ?
          WHERE name = ?`)
      .bind(permanent || exhausted ? "skipped" : "waiting", note.slice(0, 300),
        limited ? retryAfter(strikes) : null, strikes, repeats, next.name)
      .run();
    return NextResponse.json({ added, file: next.name, error: note, repeats,
      parked: permanent || exhausted,
      ...(limited ? { rateLimited: true, strikes, retryAfter: retryAfter(strikes) } : {}) },
      { status: 500 });
  }
}

export const GET = withErrorLog("trademark-ingest-tick", async (request: Request) => {
  /* The clock reaches this with no cf-connecting-ip, which is proof of origin
     nobody outside can forge. An owner may also run a file by hand, which is
     what makes a stuck ingest debuggable instead of a mystery. */
  if (request.headers.get("cf-connecting-ip") !== null) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!key()) return NextResponse.json({ skipped: "No USPTO key." });

  const db = (env as unknown as { DB: D1Database }).DB;

  /*
    THE WHOLE HANDLER REPORTS ITS OWN FAILURES, NOT JUST THE INGEST.

    Only the file read was wrapped, so anything that went wrong before it —
    a migration, the seed, the queue query — escaped to the generic wrapper
    and reached the owner as "Something went wrong." That is precisely the
    mystery the detailed error below exists to prevent, and it cost a
    debugging round on the first run after the queue was unblocked.
  */
  try {
    return await runTick(db, request);
  } catch (error) {
    /*
      THE STACK, TO THE OWNER, FOR THIS ONE CLASS OF FAILURE.

      "Cannot access 'c' before initialization" is a minified temporal dead
      zone error: a module read a const during initialisation before it was
      assigned. The message names a letter. Without the stack there is nothing
      to work from but guesses about which module, and I have already spent
      two rounds guessing — one of them wrongly blaming source order in this
      file, which a clean run on the next build disproved.

      Owner-only route, and the stack is the product's own code.
    */
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: message, where: "before the file read",
        stack: error instanceof Error
          ? (error.stack ?? "").split("\n").slice(0, 12) : undefined },
      { status: 500 });
  }
});

