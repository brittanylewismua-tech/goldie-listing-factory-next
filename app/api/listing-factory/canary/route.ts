import { crossSiteWrite, CROSS_SITE_REFUSAL } from "@/app/same-site-only";
import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { LISTING_FLOW_FLAG } from "@/app/listing-call-plan";
import { canaryFor } from "@/app/listing-flow-canary";

/*
  D1716 · THIS WAS A GET, AND IT DOES WORK.

  A GET is meant to be safe to repeat and safe to follow: a bookmark, a
  crawler, a browser prefetch, a copied link, a click. This one writes, so
  it is a POST now. The GET below refuses without doing anything, so an old
  link fails loudly rather than quietly running the job again.
*/
export async function GET() {
  return NextResponse.json(
    { error: "This does work, so it is a POST now. Nothing was run." },
    { status: 405, headers: { Allow: "POST" } });
}

/**
 * TURNING THE CANARY ON AND OFF WITHOUT A DEPLOY.
 *
 * Rollback has to be faster than a build, because the moment it is needed is
 * the moment a build is the last thing anybody wants to wait for. Enabling
 * inserts one row for the CALLER only; disabling deletes it. There is no way
 * to name another member here, so this cannot switch anyone else's shop onto
 * an unproven publishing path.
 */
export const POST = withErrorLog("listing-factory-canary", async (request: Request) => {
  if (crossSiteWrite(request)) return NextResponse.json(CROSS_SITE_REFUSAL, { status: 403 });
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parameters = new URL(request.url).searchParams;
  const action = parameters.get("action") ?? "status";
  /* stop holds an unmapped blueprint; legacy sends it down the existing
     path. Both are safe; neither guesses a category. */
  const unmapped = parameters.get("unmapped") === "stop" ? "stop" : "legacy";
  const db = (env as unknown as { DB: D1Database }).DB;

  await db.prepare(`CREATE TABLE IF NOT EXISTS feature_canary (
    flag TEXT NOT NULL,
    user_id TEXT NOT NULL,
    unmapped_behaviour TEXT NOT NULL DEFAULT 'legacy',
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (flag, user_id))`).run();

  if (action === "enable")
    await db.prepare(
      `INSERT INTO feature_canary (flag, user_id, unmapped_behaviour) VALUES (?,?,?)
       ON CONFLICT(flag, user_id) DO UPDATE SET unmapped_behaviour = excluded.unmapped_behaviour`)
      .bind(LISTING_FLOW_FLAG, user.userId, unmapped).run();

  if (action === "disable")
    await db.prepare(`DELETE FROM feature_canary WHERE flag = ? AND user_id = ?`)
      .bind(LISTING_FLOW_FLAG, user.userId).run();

  const enrolled = await db.prepare(
    `SELECT COUNT(*) AS n FROM feature_canary WHERE flag = ?`)
    .bind(LISTING_FLOW_FLAG).first<{ n: number }>();

  return NextResponse.json({
    flag: LISTING_FLOW_FLAG,
    action,
    you: await canaryFor(user.userId),
    accountsEnrolled: enrolled?.n ?? 0,
    globallyOn: false,
    rollback: "Call this with action=disable. No deploy, effective on the next request.",
  });
});
