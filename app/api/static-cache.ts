/* D656 · Some of what Goldie fetches is not the seller's data at all.
 *
 * Etsy's seller taxonomy is the same category tree for every Etsy seller on
 * earth, and Printify's catalogue for a blueprint is the same for every Goldie
 * user. Both were being fetched fresh on every request that touched them - the
 * taxonomy once per design, several megabytes each time, then flattened over
 * again in the worker before a single design could be prepared.
 *
 * A token is required to call these endpoints, but nothing that comes back is
 * scoped to the caller, which is precisely why one copy can serve everyone.
 * The key is the namespace and the path and nothing else; if a value were ever
 * seller-specific it would not belong here.
 *
 * D657 · What this cache is, precisely, so nobody has to guess:
 *
 *   `caches.default` on Cloudflare Workers is the edge HTTP cache. It survives
 *   isolate restarts and cold starts, so this is NOT process memory - but it is
 *   scoped to the data centre serving the request and entries are evictable at
 *   any time. So: "fetched once per data centre until it expires or is
 *   evicted", never "fetched once globally". A seller routed to a colo that has
 *   not seen this path before pays the full fetch, exactly as before.
 *
 *   Where `caches` is undefined the helper degrades to a plain call.
 */

/* D657 · Within one isolate, several designs prepare at once, and before this
   every one of them missed the cache together and started its own download of
   the same taxonomy - the cache only helped the SECOND batch. Concurrent
   callers now share one in-flight request.

   Keyed the same way as the cache itself. The entry is removed as soon as the
   work settles, so a failure is never remembered and the next caller retries
   rather than inheriting a rejected promise. */
const inFlight = new Map<string, Promise<unknown>>();

export async function cachedJson<T>(namespace: string, path: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const url = `https://goldie-${namespace}.internal${path.startsWith("/") ? path : `/${path}`}`;
  const key = new Request(url, { method: "GET" });
  if (cache) {
    const hit = await cache.match(key).catch(() => undefined);
    if (hit) return hit.json() as Promise<T>;
  }
  const pending = inFlight.get(url);
  if (pending) return pending as Promise<T>;
  const work = (async () => {
    /* Only a value that loaded successfully is stored. printify() and
       etsyFetch() both throw on any non-2xx, so a 401, 403, 429 or 5xx rejects
       here and never reaches cache.put - caching an auth failure or a rate
       limit for a day would be far worse than the repeat fetch this avoids. */
    const value = await load();
    if (cache) {
      await cache.put(key, new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttlSeconds}` } })).catch(() => undefined);
    }
    return value;
  })();
  inFlight.set(url, work);
  try { return await work; } finally { inFlight.delete(url); }
}

/* Etsy publishes taxonomy changes rarely and announces them; a day is well
   inside the window in which a stale tree could matter, and a seller who hits a
   brand-new category simply gets it tomorrow rather than waiting on a
   multi-megabyte download today. */
export const TAXONOMY_TTL_SECONDS = 86400;
