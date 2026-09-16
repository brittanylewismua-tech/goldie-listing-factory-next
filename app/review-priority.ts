/**
 * WHICH SHOPS ARE WORTH FETCHING REVIEWS FOR.
 *
 * Reviews are SUPPORTING evidence. They never qualify a listing, a review
 * timestamp is never a sale timestamp, and a review count is never a sales
 * count. What they add is the buyer's words behind movement Goldie already
 * confirmed by other means — so the only shops worth spending a call on are
 * shops that already matter.
 *
 * The order below is the product's answer to "whose reviews first", and it is
 * deliberately about MEMBER ATTENTION rather than shop size: a shop nobody is
 * watching and whose listings nothing has confirmed is last, however big it is.
 */
export type PriorityClass =
  | "saved-niche"        /* a shop inside a niche a member saved */
  | "repeated-movement"  /* a shop with listings that moved more than once */
  | "scanner-cohort"     /* a shop inside a live Design Scanner cohort */
  | "shop-watch"         /* a shop a member explicitly follows */
  | "other-momentum";    /* everything else that has moved at all */

export const PRIORITY_ORDER: PriorityClass[] = [
  "saved-niche", "repeated-movement", "scanner-cohort", "shop-watch", "other-momentum",
];

export const rank = (priority: PriorityClass) => PRIORITY_ORDER.indexOf(priority);

export type ShopCandidate = {
  shopId: number;
  priority: PriorityClass;
  /* Already in the shared collection: admitting it again costs nothing and
     its high-water mark means the fetch is incremental. */
  alreadyCollected: boolean;
  highWater: number;
};

/**
 * Order the queue and cut it to the budget.
 *
 * SHARED COLLECTION IS THE POINT. Twenty members watching one shop produce one
 * candidate, because the shop is the unit, not the watch. A shop already
 * collected stays in the queue — its fetch is incremental and cheap — but it
 * sorts behind an equally-ranked shop nobody has read yet, so a first pass
 * spreads rather than re-reading.
 */
export function planFetch(
  candidates: ShopCandidate[], { maxShops, callsPerShop = 2, budget = Infinity }:
  { maxShops: number; callsPerShop?: number; budget?: number },
): { fetch: ShopCandidate[]; estimatedCalls: number; deferred: number } {
  const byShop = new Map<number, ShopCandidate>();
  for (const candidate of candidates) {
    const held = byShop.get(candidate.shopId);
    /* One row per shop, keeping the strongest reason it qualified. */
    if (!held || rank(candidate.priority) < rank(held.priority))
      byShop.set(candidate.shopId, candidate);
  }

  const ordered = [...byShop.values()].sort((a, b) => {
    const byPriority = rank(a.priority) - rank(b.priority);
    if (byPriority) return byPriority;
    /* Never-read shops before already-collected ones at the same priority. */
    const byNovelty = (a.alreadyCollected ? 1 : 0) - (b.alreadyCollected ? 1 : 0);
    if (byNovelty) return byNovelty;
    /* Then the one whose evidence is oldest. */
    return a.highWater - b.highWater;
  });

  const affordable = Math.min(maxShops, Math.floor(budget / callsPerShop));
  const fetch = ordered.slice(0, Math.max(0, affordable));
  return {
    fetch,
    estimatedCalls: fetch.length * callsPerShop,
    deferred: ordered.length - fetch.length,
  };
}

/* An initial read is bounded; everything after it is incremental. */
export const BOOTSTRAP_PAGES = 2;
export const INCREMENTAL_PAGES = 1;

export const pagesFor = (candidate: ShopCandidate) =>
  candidate.highWater > 0 ? INCREMENTAL_PAGES : BOOTSTRAP_PAGES;
