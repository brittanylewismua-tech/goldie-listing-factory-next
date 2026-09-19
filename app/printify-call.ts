/**
 * ONE DOOR FOR EVERY PRINTIFY REQUEST, AND A LEDGER BEHIND IT.
 *
 * Etsy calls have been metered since the beginning: `recordEtsyCall` writes an
 * hourly bucket for every response, with a feature label, so the day's spend
 * can be read back and attributed. Printify had nothing. Requests went out
 * through bare `fetch` in about thirty modules — no counter, no label, no
 * status, no record that a call happened at all. Asked how many Printify calls
 * an acceptance sweep made, the only possible answer was a hand count, and
 * nothing in the product could reproduce it.
 *
 * WHAT IS RECORDED, AND WHAT IS DELIBERATELY NOT.
 *
 * Recorded: the feature that made the call, the HTTP method, the endpoint
 * CATEGORY (never the URL), the response status, which attempt it was, when,
 * and — for member-initiated traffic — whose it was.
 *
 * Never recorded: the token, any request or response body, artwork URLs,
 * addresses, buyer details, product titles, or the specific ids in the path. A
 * category is enough to answer "what kind of work is this shop doing"; the
 * rest is the seller's business and has no reason to sit in a telemetry table.
 *
 * NOTHING HERE IS BACKFILLED. Calls made before this shipped were not
 * measured, and the reporting says so rather than implying a zero. A counter
 * that invents its own history is worse than no counter.
 */

/* Traffic is separated by what the member was doing, not by which file the
   call lives in: the same product read means something different when it is
   the Listing Factory building a draft, the finance ingest reconciling an
   order, and the cleanup path confirming a deletion. */
export type PrintifyFeature =
  | "listing-factory"   // the member's draft workflow: create, update, verify, publish
  | "connections"       // connecting, pairing and proving a shop
  | "finance"           // orders, costs and reconciliation
  | "cleanup"           // sweeps and guarded removal of internal test products
  | "qa";               // diagnostics, probes and support tools

export type PrintifyCategory =
  "shops" | "products" | "orders" | "uploads" | "catalog" | "publishing" | "other";

/** The category is derived from the path and nothing else is kept from it. */
export function printifyCategory(url: string): PrintifyCategory {
  let path = url;
  try { path = new URL(url).pathname; } catch { /* already a path */ }
  path = path.replace(/^\/v1/, "");
  if (/\/(publishing_succeeded|publishing_failed|publish)\b/.test(path)) return "publishing";
  if (path.startsWith("/uploads")) return "uploads";
  if (path.startsWith("/catalog")) return "catalog";
  if (/\/orders(\.json|\/|$|\?)/.test(path)) return "orders";
  if (/\/products(\.json|\/|$|\?)/.test(path)) return "products";
  if (/^\/shops(\.json|\/|$|\?)/.test(path)) return "shops";
  return "other";
}

type Meter = {
  feature: PrintifyFeature;
  /* Present for member-initiated traffic; absent for scheduled work that
     belongs to no one member. */
  userId?: string;
  /* Retries are counted separately so a flapping endpoint is visible as
     retries rather than as volume. */
  attempt?: number;
  /* Tests and the modules that already take an injected fetcher pass it
     through, so metering does not force a real network call. */
  fetcher?: typeof fetch;
};

let ensured: Promise<void> | null = null;
/*
  The binding is reached lazily rather than through a top-level
  `import { env } from "cloudflare:workers"`. Thirty modules now import this
  one, and a static import would drag the Workers runtime into every unit test
  that loads any of them — which is how a metering change breaks tests that
  have nothing to do with metering.
*/
async function database(): Promise<D1Database | undefined> {
  try {
    const runtime = await import("cloudflare:workers") as { env?: { DB?: D1Database } };
    return runtime.env?.DB;
  } catch { return undefined; }
}

export async function ensurePrintifyMeter() {
  const db = await database();
  if (!db) return;
  ensured ??= (async () => {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS printify_api_calls (
        id TEXT PRIMARY KEY, at INTEGER NOT NULL, feature TEXT NOT NULL,
        method TEXT NOT NULL, category TEXT NOT NULL, status INTEGER NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 1, user_id TEXT NOT NULL DEFAULT '')`),
      db.prepare(`CREATE INDEX IF NOT EXISTS printify_api_calls_at
        ON printify_api_calls (at DESC)`),
      /* The moment measurement began. Everything before it is unmeasured, and
         the reporting route says so in those words. */
      db.prepare(`CREATE TABLE IF NOT EXISTS printify_meter_start (
        id INTEGER PRIMARY KEY CHECK (id = 1), started_at INTEGER NOT NULL)`),
    ]);
    await db.prepare(
      `INSERT INTO printify_meter_start (id, started_at) VALUES (1, ?)
       ON CONFLICT(id) DO NOTHING`)
      .bind(Math.floor(Date.now() / 1000)).run();
  })().catch(() => { ensured = null; });
  await ensured;
}

export async function recordPrintifyCall(entry: {
  feature: PrintifyFeature; method: string; category: PrintifyCategory;
  status: number; attempt: number; userId?: string;
}) {
  const db = await database();
  if (!db) return;
  try {
    await ensurePrintifyMeter();
    await db.prepare(
      `INSERT INTO printify_api_calls
         (id, at, feature, method, category, status, attempt, user_id)
       VALUES (?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), Math.floor(Date.now() / 1000), entry.feature,
        entry.method, entry.category, entry.status, entry.attempt,
        entry.userId ?? "").run();
  } catch { /* A meter that fails must never fail the member's request. */ }
}

/**
 * Make a Printify request and record that it happened.
 *
 * The response is returned untouched — status, headers and body are the
 * caller's to read exactly as they were with `fetch`, so behaviour, limits,
 * timeouts and error handling are unchanged by metering.
 */
export async function printifyCall(
  url: string, init: RequestInit | undefined, meter: Meter,
): Promise<Response> {
  const method = String(init?.method ?? "GET").toUpperCase();
  const category = printifyCategory(url);
  const call = meter.fetcher ?? fetch;
  try {
    const response = await call(url, init);
    await recordPrintifyCall({ feature: meter.feature, method, category,
      status: response.status, attempt: meter.attempt ?? 1, userId: meter.userId });
    return response;
  } catch (error) {
    /* A call that never got a status still consumed an attempt and still
       happened. Status 0 is how the ledger says "no response". */
    await recordPrintifyCall({ feature: meter.feature, method, category,
      status: 0, attempt: meter.attempt ?? 1, userId: meter.userId });
    throw error;
  }
}

/**
 * A metered stand-in for `fetch`, for the modules that take an injected
 * fetcher so they can be tested without a network. Their default used to be
 * bare `fetch`, which is exactly how their calls escaped counting.
 */
export const meteredPrintifyFetch = (meter: Meter): typeof fetch =>
  ((input: string | URL | Request, init?: RequestInit) =>
    printifyCall(String(input), init, meter)) as typeof fetch;
