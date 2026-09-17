import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { deleteAccount, DELETION_AUDIT_TABLE, CONFIRMATION_PHRASE }
  from "@/app/account-deletion";

/**
 * THE ONE ROUTE THAT CANNOT BE TAKEN BACK.
 *
 * The lifecycle itself lives in `account-deletion.ts` with its storage passed
 * in, so it can be exercised against a seeded store and a disposable identity
 * — the only honest way to test something with no second attempt. This route
 * supplies the real storage and the guards.
 *
 * THE OWNER IS REFUSED. Not because the owner should never be able to leave,
 * but because this is the account every piece of verification runs through
 * while the product is being finished, and an accidental call would end that
 * with no way back. It is a beta safety catch and says so.
 */
export async function ensureDeletionAudit(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS ${DELETION_AUDIT_TABLE} (
    user_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at TEXT,
    steps_json TEXT,
    PRIMARY KEY (user_id, started_at))`).run();
}

export const POST = withErrorLog("account-delete", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  if (isOwner(user))
    return NextResponse.json({
      error: "This account cannot be deleted from here while the product is in "
        + "private beta. It is the account every check runs through.",
    }, { status: 409 });

  const body = await request.json().catch(() => ({})) as { phrase?: string };
  const db = (env as unknown as { DB: D1Database }).DB;
  await ensureDeletionAudit(db);

  const now = Math.floor(Date.now() / 1000);
  const authenticatedAt = Number(
    (user as unknown as { authenticatedAt?: number }).authenticatedAt ?? 0);

  const outcome = await deleteAccount({
    userId: user.userId,
    phrase: String(body.phrase ?? ""),
    authenticatedAt,
    now,
    runner: {
      async run(sql, userId) {
        const result = await db.prepare(sql).bind(userId).run();
        return result.meta.changes ?? 0;
      },
      async begin(userId, at) {
        await db.prepare(
          `INSERT INTO ${DELETION_AUDIT_TABLE} (user_id, started_at) VALUES (?, ?)
           ON CONFLICT(user_id, started_at) DO NOTHING`)
          .bind(userId, at).run();
      },
      async finish(userId, at, steps) {
        await db.prepare(
          `UPDATE ${DELETION_AUDIT_TABLE}
              SET finished_at = ?, steps_json = ?
            WHERE user_id = ? AND finished_at IS NULL`)
          .bind(new Date(at * 1000).toISOString(), JSON.stringify(steps), userId).run();
      },
      async existing(userId) {
        const row = await db.prepare(
          `SELECT finished_at AS finishedAt FROM ${DELETION_AUDIT_TABLE}
            WHERE user_id = ? AND finished_at IS NOT NULL
            ORDER BY started_at DESC LIMIT 1`)
          .bind(userId).first<{ finishedAt: string }>();
        return row ? { finishedAt: row.finishedAt } : null;
      },
    },
  });

  if (!outcome.ok)
    return NextResponse.json({ error: outcome.because, phrase: CONFIRMATION_PHRASE },
      { status: 400 });

  return NextResponse.json({
    deleted: true,
    alreadyDone: outcome.alreadyDone,
    finishedAt: outcome.finishedAt,
    /* Evidence, not reassurance. */
    removed: outcome.steps.filter(step => step.changed > 0),
    say: outcome.alreadyDone
      ? "This account's data was already removed. Nothing further was changed."
      : "Your data has been removed and your connections switched off.",
  });
});
