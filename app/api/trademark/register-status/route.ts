import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";
import { env } from "cloudflare:workers";
import { ensureRegisterTables, lookup, registerSize } from "@/app/trademark-register";
import { blockedExplanation } from "@/app/uspto-backoff";

/**
 * HOW FAR THE REGISTER HAS LOADED.
 *
 * The ingest runs on the clock with nobody watching, which is exactly the
 * shape of thing that quietly stops working. This is the window into it:
 * how many marks are held, and what the last few files did.
 */
export const GET = withErrorLog("trademark-register-status", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  await ensureRegisterTables(db);
  const recent = await db
    .prepare(
      `SELECT name, state, records, kept, note, finished
         FROM tm_ingest_files
        ORDER BY finished IS NULL, finished DESC
        LIMIT 8`,
    )
    .all();
  const waiting = await db
    .prepare(`SELECT name, priority, retry_after, note FROM tm_ingest_files
               WHERE state IN ('waiting','partial')
                 AND (retry_after IS NULL OR retry_after <= ?)
               ORDER BY priority, name DESC LIMIT 3`)
    .bind(new Date().toISOString())
    .all<{ name: string; priority: number }>();

  /*
    A QUEUE THAT IS NOT MOVING MUST SAY WHY.

    For two days this endpoint answered "88 waiting" while every firing was
    being refused by USPTO with a 429. Every word of it was true, and a person
    reading it had no way to tell the difference between a queue working
    through a backlog and a queue that had stopped entirely.
  */
  const blockedRows = await db
    .prepare(`SELECT name, note, retry_after FROM tm_ingest_files
               WHERE retry_after IS NOT NULL AND retry_after > ?
               ORDER BY retry_after LIMIT 5`)
    .bind(new Date().toISOString())
    .all<{ name: string; note: string; retry_after: string }>();
  const blocked = (blockedRows.results ?? []).map(row => ({
    name: row.name,
    retryAfter: row.retry_after,
    because: blockedExplanation(row.note, row.retry_after) || row.note,
  }));

  /* A handful of real marks, so the lookup can be exercised against rows that
     actually exist rather than a phrase somebody hoped would be in there. */
  const sample = new URL(request.url).searchParams.get("sample")
    ? (await db.prepare(`SELECT mark, owner, classes, status_code FROM tm_marks WHERE searchable = 1 LIMIT 8`).all()).results
    : undefined;

  return NextResponse.json({
    ...(await registerSize(db)),
    /* Owner diagnostic: does a real lookup actually succeed? A clean result
       and an unreadable register produced the same answer for long enough
       that this is worth being able to see directly. */
    /*
      The LIKE pattern was built from this column, and SQLite refuses a
      pattern past its length limit — so the longest stored mark is what
      decided when every lookup began failing.
    */
    longestMark: await db.prepare(
      `SELECT serial, LENGTH(normalized) AS length, updated
         FROM tm_marks ORDER BY LENGTH(normalized) DESC LIMIT 1`)
      .first<{ serial: string; length: number; updated: string }>()
      .catch(() => null),
    /*
      Owner diagnostic: is a specific serial in the corpus yet? The
      member-facing answer deliberately drops serials — they are internal
      detail — so there is otherwise no way to confirm that a named
      registration has actually landed during a rebuild.
    */
    serials: await (async () => {
      const asked = (new URL(request.url).searchParams.get("serials") ?? "")
        .split(",").map(one => one.trim()).filter(Boolean).slice(0, 10);
      if (!asked.length) return null;
      const found: Record<string, unknown> = {};
      for (const serial of asked) {
        const row = await db.prepare(
          `SELECT serial, mark, owner, classes, status_code AS status
             FROM tm_marks WHERE serial = ?`)
          .bind(serial).first<Record<string, unknown>>();
        found[serial] = row ?? false;
      }
      return found;
    })(),
    lookupProbe: await lookup(db, "dream spun")
      .then(hits => ({ ok: true, hits: hits.length }))
      .catch(error => ({ ok: false,
        error: error instanceof Error ? error.message : String(error) })),
    sample,
    recent: recent.results ?? [],
    nextUp: waiting.results ?? [],
    blocked,
    /* The single sentence worth reading first. */
    queue: blocked.length && !(waiting.results ?? []).length
      ? `Stalled: ${blocked[0].because}`
      : "Advancing",
  });
});

/**
 * REQUEUE THE HISTORICAL FILES SO THEY ARE READ AGAIN.
 *
 * Every record in those files was already parsed once — and then thrown away
 * if its class was not one of the nine print classes. That is why HAUS LABS
 * (class 003) is absent from a register that has read 115 files. Widening the
 * filter changes what FUTURE reads keep; it cannot recover what past reads
 * discarded. Only re-reading can.
 *
 * Owner only, and deliberately not wired to any schedule: it is a large piece
 * of work that should happen when somebody decides it should, not because a
 * clock came round.
 *
 * Costs no money — the bulk files are free and already budgeted for. It costs
 * time: the files are taken one per tick behind the daily files, so a full
 * pass is measured in days, and the register stays usable throughout because
 * every write is an upsert rather than a delete-and-rebuild.
 */
export const POST = withErrorLog("trademark-register-requeue", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const url = new URL(request.url);
  if (url.searchParams.get("requeue") !== "historical")
    return NextResponse.json({ error: "Nothing was run." }, { status: 400 });

  const db = (env as unknown as { DB: D1Database }).DB;
  await ensureRegisterTables(db);

  /*
    Only files that finished cleanly. A skipped file was parked for a reason —
    USPTO refusing it, or a corrupt archive — and requeueing those would undo
    the terminal answer the backfile has for them.
  */
  const before = await db.prepare(
    `SELECT COUNT(*) AS n FROM tm_ingest_files WHERE state = 'done'`)
    .first<{ n: number }>();
  await db.prepare(
    `UPDATE tm_ingest_files
        SET state = 'waiting', done_records = 0, kept = 0, note = '',
            retry_after = NULL, strikes = 0, repeats = 0,
            /* Cleared with the rest: a start time left over from the previous
               pass makes the stall check measure from a run that is over. */
            started = NULL, finished = NULL
      WHERE state = 'done'`).run();

  return NextResponse.json({
    requeued: Number(before?.n ?? 0),
    note: "Historical files will be read again behind the daily files. "
      + "Marks already stored stay searchable while it runs.",
  });
});
