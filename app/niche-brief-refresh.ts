/**
 * KEEPING A SAVED NICHE'S BRIEF CURRENT.
 *
 * A niche brief was written in exactly two places: when a member opened that
 * niche, and when they saved it. Nothing else ever wrote one. So a saved niche
 * aged from the moment it was last opened, crossed the 36-hour line, and the
 * list then said its evidence "could not be refreshed".
 *
 * Nothing had failed. Nothing had been attempted. The product was reporting a
 * failure that never happened, which is the honest-labelling rule broken in
 * the opposite direction from usual — and six of seven saved niches were
 * showing it.
 *
 * The reference images behind those niches were never the problem: measured
 * at the time this was written, 3,758 of 3,758 were inside the six-hour
 * window. The evidence was current; only the brief built from it was old.
 *
 * WHAT THIS COSTS: nothing at Etsy and nothing at any paid provider. Building
 * a brief is two D1 queries over data we already hold. That is why this can
 * run often enough to keep every saved niche inside the window.
 */
import type { NicheState } from "./niche-brief-state.ts";

export type BriefDb = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T>() => Promise<T | null>;
      run: () => Promise<unknown>;
      all: <T>() => Promise<{ results?: T[] }>;
    };
    all: <T>() => Promise<{ results?: T[] }>;
    run: () => Promise<unknown>;
  };
};

/* Well inside the 36-hour staleness line, so a single missed run cannot put a
   niche over it. The six-hour EVIDENCE rule is a different rule about a
   different thing and is not touched here. */
export const BRIEF_REFRESH_SECONDS = 6 * 3_600;

/* A niche nobody has opened in this long is still refreshed, just not at the
   same cadence — it keeps its place in the queue instead of being abandoned
   or endlessly recycled ahead of niches somebody is actually reading. */
export const INACTIVE_AFTER_SECONDS = 30 * 86_400;
export const INACTIVE_REFRESH_SECONDS = 24 * 3_600;

/* After this many consecutive failures a niche backs off rather than
   consuming a slot on every run forever. */
export const FAILING_AFTER = 3;
export const FAILING_BACKOFF_SECONDS = 6 * 3_600;

export async function ensureBriefRunTable(db: BriefDb) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS niche_brief_runs (
       niche_key TEXT PRIMARY KEY,
       last_attempt_at INTEGER NOT NULL DEFAULT 0,
       last_success_at INTEGER NOT NULL DEFAULT 0,
       consecutive_failures INTEGER NOT NULL DEFAULT 0,
       last_state TEXT NOT NULL DEFAULT '',
       last_error TEXT NOT NULL DEFAULT ''
     )`).run();
}

export type NicheRow = {
  key: string;
  terms: string[];
  /** The most recent open by ANY member holding this niche. */
  lastOpened: number;
  /** When a brief was last written for this key, 0 if never. */
  lastBriefAt: number;
  consecutiveFailures: number;
  lastAttemptAt: number;
};

/**
 * Which saved niches need a brief, most-deserving first.
 *
 * DEDUPLICATED BY NICHE KEY. A brief is stored against the niche, not against
 * a member — `niche_watch_history` has no user column — and every figure the
 * list shows is member-independent. Two members watching "dog mom" therefore
 * share one rebuild rather than buying two.
 *
 * (The one per-member figure, "new since you last looked", is deliberately not
 * stored by a scheduled rebuild: there is no member looking. It is computed
 * live from their own last-opened time when they open the niche.)
 */
export function classify(row: NicheRow, now: number): NicheState {
  const age = now - row.lastBriefAt;
  const backingOff = row.consecutiveFailures >= FAILING_AFTER
    && now - row.lastAttemptAt < FAILING_BACKOFF_SECONDS;
  if (backingOff) return "failing";

  const inactive = row.lastOpened > 0 && now - row.lastOpened > INACTIVE_AFTER_SECONDS;
  const interval = inactive ? INACTIVE_REFRESH_SECONDS : BRIEF_REFRESH_SECONDS;
  if (row.lastBriefAt > 0 && age < interval) return "fresh";
  return "due";
}

/** Most-deserving first: never-built, then oldest, then most-recently-read. */
export function order(rows: NicheRow[], now: number): NicheRow[] {
  return rows
    .filter(row => classify(row, now) === "due")
    .sort((a, b) => {
      const never = (a.lastBriefAt ? 1 : 0) - (b.lastBriefAt ? 1 : 0);
      if (never) return never;
      const age = a.lastBriefAt - b.lastBriefAt;
      if (age) return age;
      return b.lastOpened - a.lastOpened;
    });
}

export async function noteAttempt(
  db: BriefDb, key: string, now: number, state: NicheState, error = "",
) {
  const succeeded = state === "fresh" || state === "unavailable";
  await db.prepare(
    `INSERT INTO niche_brief_runs
       (niche_key, last_attempt_at, last_success_at, consecutive_failures, last_state, last_error)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(niche_key) DO UPDATE SET
       last_attempt_at = excluded.last_attempt_at,
       last_success_at = CASE WHEN ? THEN excluded.last_attempt_at
                              ELSE niche_brief_runs.last_success_at END,
       consecutive_failures = CASE WHEN ? THEN 0
                                   ELSE niche_brief_runs.consecutive_failures + 1 END,
       last_state = excluded.last_state,
       last_error = excluded.last_error`)
    .bind(key, now, succeeded ? now : 0, succeeded ? 0 : 1, state, error.slice(0, 200),
      succeeded ? 1 : 0, succeeded ? 1 : 0)
    .run();
}
