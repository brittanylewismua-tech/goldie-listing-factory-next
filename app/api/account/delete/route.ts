import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { deleteAccount, DELETION_AUDIT_TABLE, CONFIRMATION_PHRASE }
  from "@/app/account-deletion";
import { DELETION_PLAN, OBJECT_PREFIXES, KEPT_BY_LAW } from "@/app/deletion-plan";

/* The member's sentence for a step, never the table or the storage prefix. */
const sayFor = (table: string) =>
  DELETION_PLAN.find(entry => entry.table === table)?.say
  ?? OBJECT_PREFIXES.find(entry => `${entry.prefix}<member>` === table)?.say
  ?? "Some stored information.";

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
      /* Not a phase, a standing protection: this is the account every check
         and every deploy verification runs through. */
      error: "This account cannot be deleted from here. It is the account every "
        + "check on the platform runs through.",
    }, { status: 409 });

  const body = await request.json().catch(() => ({})) as { phrase?: string };
  const db = (env as unknown as { DB: D1Database }).DB;
  const bucket = (env as unknown as { ARTWORK?: R2Bucket }).ARTWORK;
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
      /*
        Stored files, by member-scoped prefix. R2 lists a page at a time, so
        this pages until the prefix is empty rather than removing the first
        thousand and reporting success.
      */
      async removeObjects(prefix, userId) {
        if (!bucket) throw new Error("no object store was available");
        const scoped = `${prefix}${userId}/`;
        let removed = 0;
        let cursor: string | undefined;
        do {
          const page = await bucket.list({ prefix: scoped, limit: 1_000, cursor });
          const keys = page.objects.map(object => object.key);
          /* Belt and braces: R2 already filtered by prefix, and a delete that
             reached another member's artwork is unrecoverable, so the keys are
             checked again here before anything is removed. */
          const safe = keys.filter(key => key.startsWith(scoped));
          if (safe.length !== keys.length)
            throw new Error("object listing returned keys outside the member's prefix");
          if (safe.length) await bucket.delete(safe);
          removed += safe.length;
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
        return removed;
      },
      /*
        The last finished run AND what it could not do. The steps are read
        back out of the audit rather than recomputed, so a resume acts on
        what actually happened rather than on an assumption about it.
      */
      async existing(userId) {
        const row = await db.prepare(
          `SELECT finished_at AS finishedAt, steps_json AS steps
             FROM ${DELETION_AUDIT_TABLE}
            WHERE user_id = ? AND finished_at IS NOT NULL
            ORDER BY started_at DESC LIMIT 1`)
          .bind(userId).first<{ finishedAt: string; steps: string | null }>();
        if (!row) return null;
        let incompleteTables: string[] = [];
        try {
          const steps = JSON.parse(row.steps ?? "[]") as
            Array<{ table: string; failed?: string }>;
          incompleteTables = steps.filter(step => step.failed).map(step => step.table);
        } catch { /* An unreadable audit is treated as nothing outstanding:
                     it must not trigger an unbounded resume. */ }
        return { finishedAt: row.finishedAt, incompleteTables };
      },
    },
  });

  if (!outcome.ok)
    return NextResponse.json({ error: outcome.because, phrase: CONFIRMATION_PHRASE },
      { status: 400 });

  return NextResponse.json({
    /*
      `deleted` says the request ran; `complete` says whether it finished.
      An interface must never turn the first into a success message.
    */
    deleted: true,
    complete: outcome.complete,
    resumed: outcome.resumed,
    alreadyDone: outcome.alreadyDone,
    finishedAt: outcome.finishedAt,
    /*
      EVIDENCE, NOT REASSURANCE — AND NOT TABLE NAMES.

      A first version returned the raw table for each step, so the member's
      confirmation read "27 from scan_history, 1 from etsy_connections". The
      plan already carries a sentence for every step written for a person;
      that is what belongs here.
    */
    removed: outcome.steps.filter(step => step.changed > 0 && !step.failed).map(step => ({
      changed: step.changed,
      say: sayFor(step.table),
    })),
    /*
      AND WHAT COULD NOT BE DONE, IN THE SAME BREATH.

      With forty-odd steps a partial failure is a real possibility, and a
      member who is told "your data has been removed" when some of it was not
      has been misled about the one thing they cannot check for themselves.
    */
    incomplete: outcome.incomplete.map(step => ({ say: sayFor(step.table) })),
    kept: KEPT_BY_LAW.map(entry => entry.say),
    say: outcome.alreadyDone
      ? "This account's data was already removed. Nothing further was changed."
      : outcome.incomplete.length
        ? "Most of your data has been removed and your connections switched off. "
          + "Some of it could not be removed and is listed below — it has been "
          + "recorded, and asking again will finish it."
        : "Your data has been removed and your connections switched off.",
  });
});
