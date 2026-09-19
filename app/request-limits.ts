/**
 * HOW OFTEN ONE CALLER MAY DO A THING.
 *
 * The AI surfaces were already bounded, because each call costs money and the
 * spend guard had to exist. Everything else was not: sign-in links, OAuth
 * starts, provider reads and writes, financial ingestion, niche discovery,
 * owner tools, uploads, deletions. None of those bill per call, so nothing
 * forced a limit — but "does not cost us money" is not the same as "cannot be
 * abused", and several of them spend somebody ELSE'S budget: Etsy's and
 * Printify's rate allowances, and the member's own mailbox.
 *
 * Counters are per (surface, identity, hour) rows in D1. This is deliberately
 * not a token bucket in memory: workers are not one process, and a limit that
 * only holds within one isolate is not a limit.
 */
import { scrubSecrets } from "./log-scrubbing.ts";

export type LimitDb = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T>() => Promise<T | null>;
      run: () => Promise<unknown>;
    };
  };
};

/*
  The table creates itself on first use, which is how the other operational
  tables in this product are made. A counter that depended on a migration
  having been applied would fail open on any environment that had not run it —
  silently, which is the failure mode this whole module exists to avoid.
*/
let ensured: Promise<void> | null = null;
export function ensureRequestLimits(db: LimitDb): Promise<void> {
  ensured ??= (async () => {
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS request_limits (
         surface TEXT NOT NULL, identity TEXT NOT NULL, window_key TEXT NOT NULL,
         count INTEGER NOT NULL DEFAULT 0,
         /* The member, when there is one, so their counters go when they do.
            NULL for anonymous callers, who have no account to delete. */
         user_id TEXT,
         updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (surface, identity, window_key))`).bind().run();
  })().catch(error => { ensured = null; throw error; });
  return ensured;
}

/** Test seam: forget that the table was created. */
export function resetRequestLimitSetup() { ensured = null; }

export const windowKey = (date = new Date()) => date.toISOString().slice(0, 13);

/**
 * Who is asking.
 *
 * A signed-in member is their own account, so a shared office address cannot
 * make two members throttle each other. Anonymous callers fall back to a
 * truncated hash of the address, which is enough to separate callers for an
 * hour without keeping a record of who visited.
 */
export async function callerIdentity(
  request: Request, userId?: string | null,
): Promise<string> {
  if (userId) return `u:${userId}`;
  const address = request.headers.get("cf-connecting-ip") ?? "";
  if (!address) return "anon";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
  return "a:" + [...new Uint8Array(digest)].slice(0, 8)
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export type LimitOutcome = { allowed: boolean; count: number; limit: number; retryAfterSeconds: number };

const secondsLeftInHour = (now = new Date()) =>
  3600 - (now.getUTCMinutes() * 60 + now.getUTCSeconds());

/**
 * Count this attempt and say whether it may proceed.
 *
 * The increment happens BEFORE the answer, so a caller who is refused still
 * counts — otherwise hammering a refused endpoint would be free, and the
 * refusal itself becomes the amplifier.
 */
export async function consume(
  db: LimitDb, surface: string, identity: string, limit: number, now = new Date(),
): Promise<LimitOutcome> {
  const key = windowKey(now);
  const retryAfterSeconds = secondsLeftInHour(now);
  try {
    await ensureRequestLimits(db);
    await db.prepare(
      `INSERT INTO request_limits (surface, identity, window_key, count, user_id, updated_at)
         VALUES (?, ?, ?, 1, ?, datetime('now'))
       ON CONFLICT(surface, identity, window_key)
         DO UPDATE SET count = count + 1, updated_at = datetime('now')`)
      .bind(surface, identity, key,
        identity.startsWith("u:") ? identity.slice(2) : null).run();
    const row = await db.prepare(
      `SELECT count AS n FROM request_limits
        WHERE surface = ? AND identity = ? AND window_key = ?`)
      .bind(surface, identity, key).first<{ n: number }>();
    const count = Number(row?.n ?? 0);
    return { allowed: count <= limit, count, limit, retryAfterSeconds };
  } catch (error) {
    /*
      FAIL OPEN, LOUDLY.

      A counter that cannot write must not become an outage for every member.
      But a limiter that silently stops limiting is worse than none, because
      nobody finds out — so the failure is reported.
    */
    console.error("request_limit_unavailable", scrubSecrets(String(error)));
    return { allowed: true, count: 0, limit, retryAfterSeconds };
  }
}

/** The refusal, with the header a well-behaved client needs. */
export function tooManyRequests(message: string, outcome: LimitOutcome): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(Math.max(1, outcome.retryAfterSeconds)),
    },
  });
}

/**
 * Per-hour ceilings, by surface.
 *
 * Each is set well above what the product's own screens can produce and well
 * below what a script can. Where a call spends someone else's allowance
 * (a provider's rate budget, a member's mailbox) the number is tighter.
 */
export const LIMITS = {
  "auth/sign-in": 10,        // emailed links land in a real person's mailbox
  "auth/oauth-start": 20,
  "auth/oauth-callback": 40, // a legitimate retry loop needs headroom
  "provider/etsy-read": 300,
  "provider/etsy-write": 60,
  "provider/printify-read": 300,
  "provider/printify-write": 60,
  "finance/ingest": 30,
  "finance/reconcile": 30,
  "niche/discover": 60,
  "watch/create": 30,
  "owner/tools": 200,
  "upload/attempt": 120,
  "account/delete": 5,
  "report/browser": 60,
  /* The catch-all. No screen in the product comes close; a script does. */
  "read/general": 600,
} as const;

export type Surface = keyof typeof LIMITS;

/** Remove counters nobody will read again. */
export async function pruneRequestLimits(db: LimitDb, now = new Date()) {
  const cutoff = new Date(now.getTime() - 2 * 3600_000).toISOString().slice(0, 13);
  await db.prepare(`DELETE FROM request_limits WHERE window_key < ?`).bind(cutoff).run();
}
