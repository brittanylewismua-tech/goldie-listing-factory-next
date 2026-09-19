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
  D1727 · A CEILING ONE ATTACKER CAN EXHAUST IS A MUTE BUTTON.

  D1724 bounded the two open report endpoints at 500 per AREA per hour. That
  stops the disk filling, and it creates a worse problem than it solves: one
  script posting 500 reports in a minute uses up the hour for EVERYBODY, and
  every genuine violation after that is dropped silently. An attacker who
  wants to hide what they are doing would aim for exactly that.

  So the ceiling is keyed per source as well as per area. A single noisy
  reporter spends only its own allowance, and the area ceiling remains as a
  second, much higher stop so a distributed flood still cannot fill the
  table. Two numbers, two different jobs: one bounds an individual, the other
  bounds the total.

  Failure stays open in both directions. A counter that cannot be read does
  not silence a report, because failing closed would let one broken query
  hide everything the product is trying to say — which is the same mute
  button by another route.
*/
export const REPORTS_PER_SOURCE_PER_HOUR = 60;
export const REPORTS_PER_AREA_PER_HOUR = 5_000;

export type CountableDb = {
  prepare: (sql: string) => {
    bind: (...v: unknown[]) => { first: <T>() => Promise<T | null> };
  };
};

/**
 * Identify the reporter without storing anything identifying.
 *
 * A hash of the address and a coarse client hint, truncated hard. It is
 * enough to tell two reporters apart for an hour and not enough to be a
 * record of who visited — which matters because this is written to a table
 * an operator reads.
 */
export async function reporterKey(request: Request): Promise<string> {
  const raw = [
    request.headers.get("cf-connecting-ip") ?? "",
    request.headers.get("user-agent")?.slice(0, 60) ?? "",
  ].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].slice(0, 6)
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * True when this reporter, or this area as a whole, has had its hour.
 *
 * The area is matched as a PREFIX, because /api/client-errors records
 * `browser/<kind>` rather than a fixed string — a ceiling on the literal
 * area would have counted a value that is never written and never fired.
 */
export async function reportCeilingReached(
  db: CountableDb, areaPrefix: string, source?: string,
  perSource = REPORTS_PER_SOURCE_PER_HOUR,
  perArea = REPORTS_PER_AREA_PER_HOUR,
): Promise<boolean> {
  if (source) {
    /*
      Counted from `context`, not `error_code`: /api/client-errors already
      uses error_code for the browser's own digest, and overloading a column
      that means something else is how a counter ends up counting the wrong
      thing.
    */
    const mine = await db.prepare(
      `SELECT COUNT(*) AS n FROM error_log
        WHERE area LIKE ? AND context LIKE ?
          AND created_at >= datetime('now', '-1 hour')`)
      .bind(`${areaPrefix}%`, `%"src":"${source}"%`).first<{ n: number }>()
      .catch(() => null);
    if (mine && Number(mine.n ?? 0) >= perSource) return true;
  }
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM error_log
      WHERE area LIKE ? AND created_at >= datetime('now', '-1 hour')`)
    .bind(`${areaPrefix}%`).first<{ n: number }>()
    .catch(() => null);
  /* A counter that will not read is not a reason to drop a real report. */
  if (!row) return false;
  return Number(row.n ?? 0) >= perArea;
}
