import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";
import { env } from "cloudflare:workers";
import { ensureRegisterTables, registerSize } from "@/app/trademark-register";

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
    .prepare(`SELECT name, priority FROM tm_ingest_files WHERE state IN ('waiting','partial') ORDER BY priority, name DESC LIMIT 3`)
    .all();

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
  });
});
