type ProductDetails = {
  id: string;
  images?: Array<{src?: string}>;
  print_areas?: Array<{placeholders?: Array<{images?: unknown[]}>}>;
};

export const CREATED_DETAILS_TIMEOUT_MS = 2000;

/** Optional metadata is not another creation step. A missing preview must not
 * restart a write or invoke the long API retry ladder after a successful POST. */
export async function completeCreatedProduct<T extends ProductDetails>(
  created: T,
  shopId: number,
  token: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = CREATED_DETAILS_TIMEOUT_MS,
): Promise<T> {
  const hasImages = created.images?.some(image => Boolean(image.src));
  const hasPlacement = created.print_areas?.some(area => area.placeholders?.some(p => p.images?.length));
  if (hasImages && hasPlacement) return created;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve(created); }, timeoutMs);
  });
  const lookup = (async () => {
    try {
      const response = await fetcher(`https://api.printify.com/v1/shops/${shopId}/products/${encodeURIComponent(created.id)}.json`, {
        method: "GET", signal: controller.signal,
        headers: {Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory"},
      });
      if (!response.ok) { await response.body?.cancel(); return created; }
      const loaded = await response.json() as T;
      if (loaded?.id !== created.id) return created;
      return {
        ...created,
        ...loaded,
        images: loaded.images?.some(image => image.src) ? loaded.images : created.images,
        print_areas: loaded.print_areas?.some(area => area.placeholders?.some(p => p.images?.length)) ? loaded.print_areas : created.print_areas,
      };
    } catch { return created; }
  })();
  try { return await Promise.race([lookup, timeout]); }
  finally { clearTimeout(timer); }
}
