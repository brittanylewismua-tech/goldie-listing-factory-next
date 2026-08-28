import { env } from "cloudflare:workers";

/* D661 · What was here before did not work.
 *
 * D655 and D656 cached Etsy's global taxonomy and Printify's blueprint
 * catalogue in `caches.default`, and D657 added instrumentation to prove the
 * benefit. It proved the opposite: six consecutive identical product loads all
 * reported catalogFetches=4 and cache "miss". Nothing was ever read back, so
 * every one of those "caches" was a comment describing an intention.
 *
 * D1 is used instead, because D1 demonstrably works in this deployment - the
 * whole app is built on it. It is genuinely durable and genuinely shared: one
 * copy per database, not one per data centre and not one per isolate, so
 * "fetched once" is now a claim that can be made honestly.
 *
 * What lives here is platform data only: Etsy's taxonomy is the same category
 * tree for every Etsy seller alive, and a Printify blueprint is the same for
 * every Goldie user. A token is needed to fetch it, but nothing that comes back
 * is scoped to the caller - which is exactly what makes one shared copy correct.
 * Anything belonging to a seller must not be stored through this function; the
 * key has no room for a user and the tests hold it that way.
 */

type Db = { prepare(query: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null>; run(): Promise<unknown> } } };
function db(): Db | undefined { return (env as unknown as { DB?: Db }).DB }

/* Concurrent callers inside one isolate share one request. The cache is what
   stops the SECOND batch paying; this is what stops ten designs in the FIRST
   batch each starting their own download of the same taxonomy. Removed as soon
   as it settles, so a failure is never remembered. */
const inFlight = new Map<string, Promise<unknown>>();

export async function cachedJson<T>(namespace: string, path: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const key = `${namespace}:${path.startsWith("/") ? path : `/${path}`}`;
  const store = db();
  const now = Math.floor(Date.now() / 1000);
  if (store) {
    try {
      const hit = await store.prepare("SELECT payload FROM platform_cache WHERE cache_key=? AND expires_at>?").bind(key, now).first<{ payload: string }>();
      if (hit?.payload) return JSON.parse(hit.payload) as T;
    } catch { /* A cache that cannot be read is a cache miss, never an error. */ }
  }
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const work = (async () => {
    /* Only a value that loaded cleanly is stored. printify() and etsyFetch()
       both throw on any non-2xx, so 401, 403, 429 and 5xx reject here and never
       reach the write - remembering a rate limit for a day would be far worse
       than the repeat fetch this avoids. */
    const value = await load();
    if (store) {
      try {
        await store.prepare("INSERT INTO platform_cache (cache_key, payload, expires_at, stored_at) VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, expires_at=excluded.expires_at, stored_at=excluded.stored_at")
          .bind(key, JSON.stringify(value), now + ttlSeconds, now).run();
      } catch { /* Failing to store must not fail the request that loaded it. */ }
    }
    return value;
  })();
  inFlight.set(key, work);
  try { return await work } finally { inFlight.delete(key) }
}

/* Etsy publishes taxonomy changes rarely and announces them. A day is well
   inside the window in which a stale tree could matter, and a seller who hits a
   brand-new category gets it tomorrow rather than waiting on a multi-megabyte
   download today. */
export const TAXONOMY_TTL_SECONDS = 86400;

/* D661 · The pairing verdict, keyed by the STABLE ids and never by the names.
   D641 exists because a rename broke a name-based check; a remembered verdict
   keyed on a name would reintroduce that the first time a seller renames a
   shop. Reconnecting Etsy elsewhere changes etsy_shop_id, so the row simply
   stops matching - a stale yes cannot outlive the pairing it was about.

   Only a PROVEN match is stored. A mismatch never is: the seller is in the
   middle of fixing it and has to be re-checked the moment they try again. */
export const PAIRING_PROOF_TTL_SECONDS = 30 * 86400;

export async function provenPairing(userId: string, printifyShopId: number, etsyShopId: number): Promise<boolean> {
  const store = db();
  if (!store || !userId || !printifyShopId || !etsyShopId) return false;
  try {
    const cutoff = Math.floor(Date.now() / 1000) - PAIRING_PROOF_TTL_SECONDS;
    const row = await store.prepare("SELECT proved_at FROM shop_pairing_proofs WHERE user_id=? AND printify_shop_id=? AND etsy_shop_id=? AND proved_at>?").bind(userId, printifyShopId, etsyShopId, cutoff).first<{ proved_at: number }>();
    return Boolean(row);
  } catch { return false }
}

export async function rememberPairing(userId: string, printifyShopId: number, etsyShopId: number, listingId = 0): Promise<void> {
  const store = db();
  if (!store || !userId || !printifyShopId || !etsyShopId) return;
  try {
    await store.prepare("INSERT INTO shop_pairing_proofs (user_id, printify_shop_id, etsy_shop_id, listing_id, proved_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, printify_shop_id, etsy_shop_id) DO UPDATE SET listing_id=excluded.listing_id, proved_at=excluded.proved_at")
      .bind(userId, printifyShopId, etsyShopId, Math.max(0, Math.floor(listingId) || 0), Math.floor(Date.now() / 1000)).run();
  } catch { /* An unrecorded proof costs one re-check, nothing more. */ }
}

/* D661 · Called when either connection changes, so a proof cannot outlive the
   connection it was about. */
export async function forgetPairings(userId: string): Promise<void> {
  const store = db();
  if (!store || !userId) return;
  try { await store.prepare("DELETE FROM shop_pairing_proofs WHERE user_id=?").bind(userId).run() } catch { /* best effort */ }
}
