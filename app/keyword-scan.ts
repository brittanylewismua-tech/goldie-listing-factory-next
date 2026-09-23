/* ============================================================================
 * SCAN THE KEYWORD, THEN RANK IT HERE.
 *
 * What this replaces: one page of 24 listings, ordered by whichever of Etsy's
 * four sorts you picked, with the page footer honestly reporting "24 of 209".
 * Ranking 24 listings Etsy already chose is not a ranking. It is Etsy's answer
 * with a different label on it, and the member is right to ask why they would
 * not just use Etsy.
 *
 * Etsy's search will not sort by favorites or by views - `sort_on` accepts
 * created, updated, price and score, and nothing else. Neither will etsy.com,
 * for anybody, which is the only reason a page like this has a right to exist.
 * The way to get that sort is to hold the listings and rank them here.
 *
 * WHAT IT COSTS, BECAUSE THAT IS THE WHOLE ARGUMENT.
 *
 * The search endpoint returns 100 listings per call, not 24 - the 24 was ours.
 * And the ranking fields ride along on the search response: num_favorers,
 * views, price, and both creation timestamps. Only photographs need the second
 * call, because search responses do not embed images.
 *
 * So a keyword with 209 listings - a real long-tail phrase, the kind anyone
 * doing this work actually searches - costs three calls to scan COMPLETELY,
 * plus one to fetch the photos of the page being shown. Four calls buys a
 * ranking of the entire market for that phrase, by favorites, which no seller
 * can get anywhere else.
 *
 * A keyword with 245,912 listings cannot be covered and never will be. That is
 * not a bug to fix, it is arithmetic, so the page says which case it is in
 * rather than quietly implying the first while doing the second.
 * ==========================================================================*/

/** Etsy's own maximum for this endpoint. The 24 it replaces was ours. */
export const SCAN_PAGE = 100;
/** Ten pages. Past this the scan stops paying for itself: the listings are no
 *  longer relevant enough for their favorites to mean anything about the
 *  phrase, and the call budget is shared with every other member. */
export const SCAN_CAP = 1000;

export type KeywordOrder = 'favorites' | 'views' | 'momentum' | 'newest' | 'relevance' | 'price' | 'price-desc';

export const ORDERS: KeywordOrder[] = ['favorites','views','momentum','newest','relevance','price','price-desc'];

/** Etsy is always asked for relevance. The ordering the member chose is applied
 *  here, over everything scanned - which is the point of scanning. */
export function scanParams(phrase: string, offset: number, query = '') {
  return new URLSearchParams({
    keywords: [phrase.trim(), query.trim()].filter(Boolean).join(' '),
    limit: String(SCAN_PAGE), offset: String(offset),
    sort_on: 'score', sort_order: 'desc',
  });
}

/** How many more pages to ask for, given what the first page said the total is. */
export function pagesToScan(total: number | null, cap = SCAN_CAP) {
  if (total === null) return 1;
  return Math.max(1, Math.ceil(Math.min(total, cap) / SCAN_PAGE));
}

export type Rankable = {
  listingId: number; favorites: number | null; views: number | null;
  priceCents: number | null; createdAt: number | null; listedAt: number | null;
  ageDays: number | null;
};

/*
  FAVORITES PER DAY ON SALE, WHICH IS THE ONE WORTH HAVING.

  2,088 favorites collected over five years and 300 collected in three weeks
  are not the same finding, and raw favorites cannot tell them apart - it
  rewards listings for being old. Dividing by the listing's age is the closest
  honest reading of "what is moving now" that this data supports.

  A listing younger than a week is excluded from this ordering rather than
  divided by a number near zero, which would put every brand-new listing with
  two favorites at the top of the page.
*/
export function momentum(row: Rankable) {
  if (row.favorites === null || row.ageDays === null || row.ageDays < 7) return null;
  return row.favorites / row.ageDays;
}

/** Missing measurements sort last in every order, never as zero. */
function by<T>(value: (row: T) => number | null, direction: 1 | -1 = -1) {
  return (a: T, b: T) => {
    const left = value(a), right = value(b);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left === right ? 0 : (left < right ? -1 : 1) * direction;
  };
}

export function rankScan<T extends Rankable>(rows: T[], order: KeywordOrder): T[] {
  const ranked = [...rows];
  if (order === 'relevance') return ranked;
  if (order === 'favorites') return ranked.sort(by(row => row.favorites));
  if (order === 'views') return ranked.sort(by(row => row.views));
  if (order === 'momentum') return ranked.sort(by(row => momentum(row)));
  if (order === 'newest') return ranked.sort(by(row => row.listedAt ?? row.createdAt));
  return ranked.sort(by(row => row.priceCents, order === 'price' ? 1 : -1));
}

/**
 * What the member is told they are looking at. This sentence is the difference
 * between a tool and a trick, so it is computed rather than written by hand.
 */
export function coverage(scanned: number, total: number | null) {
  if (total === null) return `Ranked ${scanned.toLocaleString()} listings.`;
  if (scanned >= total)
    return `Ranked every one of the ${total.toLocaleString()} listings Etsy has for this keyword.`;
  return `Ranked the ${scanned.toLocaleString()} most relevant of ${total.toLocaleString()}.`
    + ` A narrower keyword can be covered completely.`;
}
