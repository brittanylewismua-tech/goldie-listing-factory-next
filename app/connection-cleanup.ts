/*
  Every function takes its database. It used to reach for the Cloudflare
  runtime itself, which meant the decision protecting a member's credential
  could only be checked by reading it — the same trap the log scrubber was
  in. An explicit parameter is also honest: this module does not own a
  connection, it operates on one.
*/
export type Db = {
  prepare: (sql: string) => {
    bind: (...v: unknown[]) => { run: () => Promise<unknown>;
      first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results?: T[] }> };
    run: () => Promise<unknown>;
  };
};

/**
 * A PAGE LOAD MUST NOT RETIRE A CREDENTIAL.
 *
 * The Printify connection check answered "are you connected?" on every page
 * load, and when Printify replied 401 or 403 it deleted the stored token then
 * and there. Two things were wrong with that.
 *
 * A GET was mutating a connection record, so any prefetch, crawl or repeated
 * load was a write. And a 401 is not proof that a credential is dead — it is
 * what a provider returns during an outage, a partial deploy, a clock skew,
 * or a bad minute. One of those would have destroyed a working token, and the
 * member would have had to reconnect for no reason.
 *
 * So a rejection is now only ever RECORDED. A rejection is a report, not a
 * verdict. The worker decides, later, and only after the provider has said
 * the same thing twice with real time in between — an outage that lasts
 * across that gap and answers identically both times is no longer a bad
 * minute.
 *
 * Nothing about the provider's response body is kept. The reason is one of a
 * closed set of our own words, because a provider's error text is exactly the
 * kind of thing that turns out to contain a token.
 */
export type RejectionReason = "unauthorized" | "forbidden" | "unreadable-token";

/** The provider must say it twice, at least this far apart, before we act. */
export const CONFIRM_AFTER_SECONDS = 30 * 60;
export const CONFIRMATIONS_REQUIRED = 2;


export async function ensureCleanupQueue(db: Db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS connection_cleanup_queue (
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    reason TEXT NOT NULL,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    sightings INTEGER NOT NULL DEFAULT 1,
    retired_at INTEGER,
    PRIMARY KEY (user_id, provider))`).run();
}

/**
 * Record that a provider refused this member's credential.
 *
 * Idempotent by construction: one row per member and provider. Repeating it
 * within the window advances nothing, so a page that loads forty times in a
 * minute cannot manufacture a confirmation.
 */
export async function noteRejection(
  userId: string, provider: string, reason: RejectionReason,
  db: Db, nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<void> {
  await ensureCleanupQueue(db);
  const now = nowSeconds;
  await db.prepare(
    `INSERT INTO connection_cleanup_queue
       (user_id, provider, reason, first_seen_at, last_seen_at, sightings)
     VALUES (?,?,?,?,?,1)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       reason = excluded.reason,
       retired_at = NULL,
       last_seen_at = CASE
         WHEN excluded.last_seen_at - connection_cleanup_queue.last_seen_at >= ?
           THEN excluded.last_seen_at
         ELSE connection_cleanup_queue.last_seen_at END,
       sightings = CASE
         WHEN excluded.last_seen_at - connection_cleanup_queue.last_seen_at >= ?
           THEN connection_cleanup_queue.sightings + 1
         ELSE connection_cleanup_queue.sightings END`)
    .bind(userId, provider, reason, now, now,
      CONFIRM_AFTER_SECONDS, CONFIRM_AFTER_SECONDS)
    .run()
    .catch(() => undefined);
}

/** A credential that works again clears its own report. */
export async function clearRejection(userId: string, provider: string,
  db: Db) {
  await ensureCleanupQueue(db);
  await db.prepare(
    `DELETE FROM connection_cleanup_queue WHERE user_id = ? AND provider = ?`)
    .bind(userId, provider).run().catch(() => undefined);
}

export type Confirmed = { userId: string; provider: string; reason: string;
  sightings: number; firstSeenAt: number };

/**
 * The reports that have been confirmed: seen at least twice, with the
 * required gap between the first and last sighting.
 */
export async function confirmedRejections(db: Db, limit = 25): Promise<Confirmed[]> {
  await ensureCleanupQueue(db);
  const rows = await db.prepare(
    `SELECT user_id AS userId, provider, reason, sightings,
            first_seen_at AS firstSeenAt
       FROM connection_cleanup_queue
      WHERE retired_at IS NULL
        AND sightings >= ?
        AND last_seen_at - first_seen_at >= ?
      ORDER BY first_seen_at ASC LIMIT ?`)
    .bind(CONFIRMATIONS_REQUIRED, CONFIRM_AFTER_SECONDS, limit)
    .all<Confirmed>().catch(() => ({ results: [] as Confirmed[] }));
  return (rows.results ?? []) as Confirmed[];
}

/**
 * Mark one report handled. Safe to call twice: the row is keyed by member and
 * provider, and a second call simply rewrites the same timestamp.
 */
export async function markRetired(userId: string, provider: string,
  db: Db) {
  await db.prepare(
    `UPDATE connection_cleanup_queue SET retired_at = ?
      WHERE user_id = ? AND provider = ?`)
    .bind(Math.floor(Date.now() / 1_000), userId, provider).run()
    .catch(() => undefined);
}
