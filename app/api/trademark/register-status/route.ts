import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";
import { env } from "cloudflare:workers";
import { ensureRegisterTables, registerSize } from "@/app/trademark-register";
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
    ? (await db.prepare(`SELECT mark, owner, classes, status_code FROM tm_marks LIMIT 8`).all()).results
    : undefined;

  return NextResponse.json({
    ...(await registerSize(db)),
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
