/**
 * WHAT A LOG IS ALLOWED TO REMEMBER.
 *
 * Pulled out of error-log.ts so it can be tested by running it. That file
 * imports the Cloudflare runtime, which means a pure string function was
 * only reachable through a module that cannot load outside a worker — so
 * the one piece of security code most worth exercising directly was the
 * piece hardest to exercise at all.
 */

/* Tokens and keys must never be written into a log we then email around. */
const SECRETS = /\b(Bearer\s+[\w.\-]+|sk-[\w-]{8,}|key-[\w-]{8,}|gld-admin-[\w-]+|eyJ[\w.-]{20,})/gi;

/*
  D1714 · AND THE ONES THAT LIVE IN A QUERY STRING.

  The pattern above catches a credential that looks like a credential. It does
  not catch one that is simply the value of a parameter — and three of ours
  are exactly that:

    signature=   the HMAC on a staged-artwork URL, replayable for 30 minutes
    code=        an Etsy OAuth authorization code
    state=       the row that IS the credential for an OAuth flow

  Nothing writes them today. withErrorLog records `pathname` only, so the
  automatic path already drops every query string, and the single caller that
  passes `context` passes three ids. So this is not a leak; it is the
  difference between "no caller has done it yet" and "a caller cannot".

  The key is kept and the value redacted, because knowing a signature was
  present is diagnostic and knowing what it was is a loaded gun.
*/
const QUERY_SECRETS =
  /\b(signature|code|state|code_verifier|token|access_token|refresh_token|secret|api_key|apikey)=([^&\s"'\]}]+)/gi;
export function scrubSecrets(value: string) {
  return value
    .replace(SECRETS, "[redacted]")
    .replace(QUERY_SECRETS, (_whole, key: string) => `${key}=[redacted]`);
}



/*
  D1724 · A LOG ANYONE CAN WRITE TO IS A DISK ANYONE CAN FILL.

  Two endpoints take a report from an unauthenticated browser and write it to
  error_log: /api/client-errors, and /api/csp-report, which I added an hour
  before noticing this. Neither had a ceiling. A script posting in a loop
  could not read anything or change a member's data, but it could bury every
  real failure under noise and grow the table without limit — and the error
  log is where a member's broken publish is supposed to be visible.

  The bound is per area per hour, counted before the write. It is deliberately
  generous: this is a ceiling on abuse, not a quota on genuinely noisy days,
  and a real incident that trips it has already told us what we needed to
  know by tripping it.
*/
export const REPORTS_PER_HOUR = 500;

export type CountableDb = {
  prepare: (sql: string) => {
    bind: (...v: unknown[]) => { first: <T>() => Promise<T | null> };
  };
};

/**
 * True when this area has already had its hour's worth.
 *
 * Matched as a PREFIX, because one of the two callers does not write a fixed
 * area: /api/client-errors records `browser/<kind>`, so a ceiling counting
 * the literal string "client-error" would have counted a value that is never
 * written and never fired. Found by a test asserting the area reaches the
 * query, which is the only reason it was not shipped that way.
 */
export async function reportCeilingReached(
  db: CountableDb, areaPrefix: string, perHour = REPORTS_PER_HOUR,
): Promise<boolean> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM error_log
      WHERE area LIKE ? AND created_at >= datetime('now', '-1 hour')`)
    .bind(`${areaPrefix}%`).first<{ n: number }>()
    .catch(() => null);
  /* A counter that will not read is not a reason to drop a real report. */
  if (!row) return false;
  return Number(row.n ?? 0) >= perHour;
}
