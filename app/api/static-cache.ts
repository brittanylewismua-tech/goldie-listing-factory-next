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
 * The key is the path and nothing else; if a value were ever seller-specific it
 * would not belong here.
 */
export async function cachedJson<T>(namespace: string, path: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(`https://goldie-${namespace}.internal${path.startsWith("/") ? path : `/${path}`}`, { method: "GET" });
  if (cache) {
    const hit = await cache.match(key).catch(() => undefined);
    if (hit) return hit.json() as Promise<T>;
  }
  const value = await load();
  if (cache) {
    await cache.put(key, new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttlSeconds}` } })).catch(() => undefined);
  }
  return value;
}

/* Etsy publishes taxonomy changes rarely and announces them; a day is well
   inside the window in which a stale tree could matter, and a seller who hits a
   brand-new category simply gets it tomorrow rather than waiting on a
   multi-megabyte download today. */
export const TAXONOMY_TTL_SECONDS = 86400;
