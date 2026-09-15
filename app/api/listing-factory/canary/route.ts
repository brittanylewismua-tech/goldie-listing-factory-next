import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { LISTING_FLOW_FLAG } from "@/app/listing-call-plan";
import { canaryFor } from "@/app/listing-flow-canary";

/**
 * TURNING THE CANARY ON AND OFF WITHOUT A DEPLOY.
 *
 * Rollback has to be faster than a build, because the moment it is needed is
 * the moment a build is the last thing anybody wants to wait for. Enabling
 * inserts one row for the CALLER only; disabling deletes it. There is no way
 * to name another member here, so this cannot switch anyone else's shop onto
 * an unproven publishing path.
 */
export const GET = withErrorLog("listing-factory-canary", async (request: Request) => {
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
