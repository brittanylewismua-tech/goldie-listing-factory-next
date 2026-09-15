import { env } from "cloudflare:workers";

/**
 * SAVED NICHES, AND THE APPEND-ONLY HISTORY BEHIND THEM.
 *
 * Two tables and a deliberate split:
 *
 *   `niche_watches`      — what each member asked to watch. Member-scoped.
 *   `niche_watch_history`— what was true on a given day. APPEND ONLY.
 *
 * History is append-only so the feature can show change over time, and so
 * qualification can be recomputed when the rules change without having
 * destroyed what the old rules saw. A failed refresh therefore cannot empty
 * anything: the last good row is still the last good row, and the reader
 * labels it stale rather than replacing it with nothing.
 *
 * NO PAID CALL EXISTS ON THIS PATH. Matching is a local query against the
 * shared corpus, so a saved niche costs a member essentially nothing and a
 * second member saving the same niche costs nothing at all.
 */
const db = () => (env as unknown as { DB: D1Database }).DB;

export async function ensureNicheWatchTables() {
  await db().batch([
    db().prepare(`CREATE TABLE IF NOT EXISTS niche_watches (
      user_id TEXT NOT NULL,
      niche_key TEXT NOT NULL,
      phrase TEXT NOT NULL,
      terms TEXT NOT NULL DEFAULT '',
      added_at INTEGER NOT NULL,
      last_opened INTEGER NOT NULL DEFAULT 0,
      paused INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, niche_key))`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS niche_watches_user ON niche_watches (user_id)`),
    /* Append only. No UPDATE statement anywhere in this module touches it. */
    db().prepare(`CREATE TABLE IF NOT EXISTS niche_watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      niche_key TEXT NOT NULL,
      observed_day TEXT NOT NULL,
      observed_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      rule_version INTEGER NOT NULL DEFAULT 1)`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS niche_watch_history_key
         ON niche_watch_history (niche_key, observed_at DESC)`),
  ]);
}

/* The niche a member typed and the niche another member typed differently are
   the same watch when their terms agree, so history is shared and the second
   member's watch is free. */
export const nicheKey = (terms: string[]) => [...terms].sort().join("+");

export const MAX_NICHE_WATCHES = Number(
  (env as unknown as { NICHE_WATCH_LIMIT?: string }).NICHE_WATCH_LIMIT ?? "") || 10;

export async function saveWatch(
  userId: string, phrase: string, terms: string[], now: number,
): Promise<{ ok: true; key: string } | { ok: false; because: string }> {
  await ensureNicheWatchTables();
  if (!terms.length)
    return { ok: false, because: "That niche needs at least one meaningful word." };
  const key = nicheKey(terms);
  const held = await db().prepare(
    `SELECT COUNT(*) AS saved FROM niche_watches WHERE user_id = ?`)
    .bind(userId).first<{ saved: number }>();
  const existing = await db().prepare(
    `SELECT 1 AS found FROM niche_watches WHERE user_id = ? AND niche_key = ?`)
    .bind(userId, key).first<{ found: number }>();
  if (!existing && Number(held?.saved ?? 0) >= MAX_NICHE_WATCHES)
    return { ok: false,
      because: `You can watch ${MAX_NICHE_WATCHES} niches during the beta. `
        + `Remove one to add another.` };
  await db().prepare(
    `INSERT INTO niche_watches (user_id, niche_key, phrase, terms, added_at)
     VALUES (?,?,?,?,?)
     ON CONFLICT(user_id, niche_key) DO UPDATE SET phrase = excluded.phrase`)
    .bind(userId, key, phrase, terms.join("|"), now).run();
  return { ok: true, key };
}

export async function removeWatch(userId: string, key: string) {
  await ensureNicheWatchTables();
  /* The member's watch goes; the shared history stays, so re-adding it later
     does not start from nothing and other watchers are unaffected. */
  await db().prepare(`DELETE FROM niche_watches WHERE user_id = ? AND niche_key = ?`)
    .bind(userId, key).run();
}

export async function watchesFor(userId: string) {
  await ensureNicheWatchTables();
  const rows = await db().prepare(
    `SELECT niche_key AS key, phrase, terms, added_at AS addedAt,
            last_opened AS lastOpened
       FROM niche_watches WHERE user_id = ? AND paused = 0 ORDER BY added_at`)
    .bind(userId)
    .all<{ key: string; phrase: string; terms: string; addedAt: number; lastOpened: number }>();
  return (rows.results ?? []).map(row => ({
    key: row.key, phrase: row.phrase,
    terms: String(row.terms ?? "").split("|").filter(Boolean),
    addedAt: Number(row.addedAt), lastOpened: Number(row.lastOpened),
  }));
}

export async function markOpened(userId: string, key: string, now: number) {
  await db().prepare(
    `UPDATE niche_watches SET last_opened = ? WHERE user_id = ? AND niche_key = ?`)
    .bind(now, userId, key).run();
}

export async function appendHistory(
  key: string, payload: unknown, now: number, ruleVersion = 1,
) {
  await ensureNicheWatchTables();
  await db().prepare(
    `INSERT INTO niche_watch_history (niche_key, observed_day, observed_at, payload_json, rule_version)
     VALUES (?,?,?,?,?)`)
    .bind(key, new Date(now * 1000).toISOString().slice(0, 10), now,
      JSON.stringify(payload), ruleVersion).run();
}

/** The most recent good reading, whatever happened since. */
export async function lastGood(key: string) {
  await ensureNicheWatchTables();
  const row = await db().prepare(
    `SELECT payload_json AS payload, observed_at AS observedAt
       FROM niche_watch_history WHERE niche_key = ?
      ORDER BY observed_at DESC LIMIT 1`)
    .bind(key).first<{ payload: string; observedAt: number }>();
  if (!row) return null;
  try {
    return { payload: JSON.parse(row.payload) as unknown, observedAt: Number(row.observedAt) };
  } catch { return null; }
}

/** How the niche has moved, for the watch detail page. */
export async function trend(key: string, days = 14) {
  await ensureNicheWatchTables();
  const rows = await db().prepare(
    `SELECT observed_day AS day, MAX(observed_at) AS observedAt, payload_json AS payload
       FROM niche_watch_history WHERE niche_key = ?
      GROUP BY observed_day ORDER BY observed_day DESC LIMIT ?`)
    .bind(key, days)
    .all<{ day: string; observedAt: number; payload: string }>();
  return (rows.results ?? []).map(row => {
    let moving = 0, repeated = 0, shops = 0;
    try {
      const parsed = JSON.parse(row.payload) as
        { moving?: number; repeated?: number; shops?: number };
      moving = Number(parsed.moving ?? 0);
      repeated = Number(parsed.repeated ?? 0);
      shops = Number(parsed.shops ?? 0);
    } catch { /* a row we cannot read contributes nothing, and breaks nothing */ }
    return { day: row.day, moving, repeated, shops };
  }).reverse();
}
