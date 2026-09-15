/**
 * WHAT THE REFERENCE CORPUS ACTUALLY CONTAINS, BEFORE ANYTHING IS BUILT ON IT.
 *
 * The Design Scanner's whole claim is that it compares a design against
 * listings with VERIFIED momentum. That claim is worth exactly as much as the
 * corpus behind it, so the corpus gets measured before a minimum cohort size
 * is chosen — not after, when the number would be picked to make the feature
 * look ready.
 *
 * Pure so it can be tested; the route supplies the rows.
 */
export type Row = {
  listingId: number;
  shopId: number;
  taxonomyId: number | null;
  units: number;
  reason: string;
  observedAt: number;
  intervals: number;
  reviewsRecently: number;
  imageHash: string;
};

export type Measurement = {
  listings: number;
  shops: number;
  withUsableImage: number;
  repeatedMovement: number;
  movementPlusReview: number;
  soldOut: number;
  newestEvidenceDays: number | null;
  oldestEvidenceDays: number | null;
  withinFreshWindow: number;
  byTaxonomy: Array<{ taxonomyId: number | null; listings: number; shops: number }>;
  byShop: Array<{ shopId: number; listings: number; share: number }>;
  topShopShare: number;
  dominated: boolean;
  /* Stated plainly rather than implied by a zero somewhere in the numbers. */
  notes: string[];
};

const days = (seconds: number) => seconds / 86_400;

export function measure(
  rows: Row[], now: number, { freshDays = 60, cap = 0.25 }: { freshDays?: number; cap?: number } = {},
): Measurement {
  const notes: string[] = [];
  const shops = new Map<number, number>();
  const taxonomies = new Map<number | null, { listings: number; shops: Set<number> }>();
  let withUsableImage = 0, repeated = 0, plusReview = 0, soldOut = 0, fresh = 0;
  let newest: number | null = null, oldest: number | null = null;

  for (const row of rows) {
    shops.set(row.shopId, (shops.get(row.shopId) ?? 0) + 1);
    const key = row.taxonomyId;
    const bucket = taxonomies.get(key) ?? { listings: 0, shops: new Set<number>() };
    bucket.listings += 1; bucket.shops.add(row.shopId); taxonomies.set(key, bucket);

    if (row.imageHash) withUsableImage += 1;
    if (row.intervals >= 2) repeated += 1;
    if (row.reviewsRecently > 0 && row.intervals >= 1) plusReview += 1;
    if (row.reason === "sold_out" || row.reason === "renewed_after_sold_out") soldOut += 1;

    const age = days(now - row.observedAt);
    if (age <= freshDays) fresh += 1;
    newest = newest === null ? age : Math.min(newest, age);
    oldest = oldest === null ? age : Math.max(oldest, age);
  }

  const byShop = [...shops.entries()]
    .map(([shopId, listings]) => ({ shopId, listings, share: listings / Math.max(1, rows.length) }))
    .sort((a, b) => b.listings - a.listings);
  const topShopShare = byShop[0]?.share ?? 0;

  /*
    The image hash is a hash of Etsy's image ID, not of any image we hold. It
    proves a listing HAS a primary image; it does not give us one to analyse.
    Saying "usable" without this note would be the difference between a corpus
    that can back a visual comparison and one that cannot.
  */
  notes.push("`withUsableImage` counts listings observed to have a primary image. "
    + "The corpus stores a hash of the image identifier, not an image or a URL, "
    + "so none of these images can currently be analysed without fetching them.");
  if (rows.length && !rows.some(row => row.taxonomyId !== null))
    notes.push("No taxonomy is recorded on any qualifying row, so these cannot be grouped "
      + "by subject at all.");
  else
    notes.push("Grouping is by Etsy taxonomy, which is a product category. It is NOT a "
      + "customer niche, and must not be presented to a member as one.");
  if (topShopShare > cap)
    notes.push(`One shop accounts for ${Math.round(topShopShare * 100)}% of qualifying `
      + `listings. Any cohort drawn from this corpus must be capped.`);

  return {
    listings: rows.length, shops: shops.size, withUsableImage,
    repeatedMovement: repeated, movementPlusReview: plusReview, soldOut,
    newestEvidenceDays: newest === null ? null : Math.round(newest * 10) / 10,
    oldestEvidenceDays: oldest === null ? null : Math.round(oldest * 10) / 10,
    withinFreshWindow: fresh,
    byTaxonomy: [...taxonomies.entries()]
      .map(([taxonomyId, bucket]) => ({ taxonomyId, listings: bucket.listings, shops: bucket.shops.size }))
      .sort((a, b) => b.listings - a.listings),
    byShop, topShopShare, dominated: topShopShare > cap, notes,
  };
}

/**
 * Whether the corpus can support the feature at all.
 *
 * Deliberately separate from `measure`, because the honest answer to "is this
 * ready" is sometimes no, and that answer should not be reachable by reading
 * a number optimistically.
 */
export function readiness(m: Measurement, { minimum = 12 }: { minimum?: number } = {}) {
  const blocking: string[] = [];
  if (m.withinFreshWindow < minimum)
    blocking.push(`Only ${m.withinFreshWindow} listings carry movement inside the freshness `
      + `window; ${minimum} is the smallest cohort worth comparing against.`);
  if (m.dominated)
    blocking.push("One shop dominates the corpus, so a cohort would describe that shop "
      + "rather than the niche.");
  return { ready: blocking.length === 0, blocking };
}
