/**
 * WHAT THE SALES ARE SAYING.
 *
 * The board answers "what sold". This answers "so what" — which is the part
 * a seller is actually paying for, and the part that used to require Brittany
 * to sit down and read the market by hand once a month.
 *
 * EVERYTHING HERE IS WEIGHTED BY UNITS SOLD, NEVER BY LISTING COUNT. That is
 * the whole discipline. Counting listings measures what other sellers guessed
 * would work — decisions made before a single buyer weighed in — and following
 * it lands you exactly where the herd already is. Counting units measures what
 * people paid for. A phrase on four hundred new listings that nobody bought is
 * not a trend; it is four hundred people about to be disappointed.
 *
 * Listing counts appear once, as a denominator: thirty units across two
 * listings and thirty across nine hundred are opposite situations, and supply
 * is the only way to tell them apart.
 *
 * NO NUMBER IN HERE IS EVER PRODUCED BY A MODEL. The arithmetic is done in
 * this file, tested, and handed to the writer as finished facts. The model's
 * only job is turning a table into sentences.
 */

export type SoldListing = {
  listingId: number;
  title: string;
  product: string;
  price: number | null;
  sold: number;
};

/**
 * WORDS THAT APPEAR IN EVERY TITLE AND MEAN NOTHING.
 *
 * Etsy titles are keyword-stuffed by design, so the frequent words are almost
 * all product nouns and shop-speak. Left in, every "trend" comes back as
 * "shirt for women" and the feature is worthless.
 *
 * Style words are deliberately KEPT — retro, distressed, groovy, minimalist,
 * coquette. Those are the design direction, which is the thing being asked
 * for.
 */
const NOISE = new Set([
  // the product itself
  "shirt", "shirts", "tshirt", "tshirts", "t", "tee", "tees", "sweatshirt", "sweatshirts",
  "hoodie", "hoodies", "crewneck", "sweater", "tank", "top", "tops", "mug", "mugs", "cup",
  "tumbler", "tote", "bag", "bags", "sticker", "stickers", "decal", "blanket", "blankets",
  "throw", "pillow", "pillows", "case", "cases", "hat", "cap", "poster", "print", "prints",
  "onesie", "bodysuit", "apparel", "clothing", "merch",
  // shop-speak
  "gift", "gifts", "gifting", "custom", "customized", "customised", "personalized",
  "personalised", "unisex", "womens", "women", "mens", "men", "kids", "toddler", "youth",
  "adult", "ladies", "girls", "boys", "size", "sizes", "plus", "oversized", "comfort",
  "colors", "colours", "color", "colour", "quality", "soft", "cozy", "cotton", "premium",
  "handmade", "made", "usa", "shipping", "fast", "free", "sale", "new", "best", "seller",
  "trendy", "cute", "perfect", "great", "beautiful", "unique", "favorite", "favourite",
  // grammar
  "for", "the", "and", "with", "your", "you", "her", "him", "his", "she", "he", "they",
  "a", "an", "of", "to", "in", "on", "at", "by", "or", "my", "me", "it", "is", "are",
  "this", "that", "from", "up", "out", "all", "any", "no", "not", "one", "two", "day",
  "gifts", "idea", "ideas", "design", "designs", "graphic", "printed", "print",
]);

const words = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/**
 * Phrases of two to four words, credited with the units the listing sold.
 *
 * A phrase is only counted once per listing however often it repeats in the
 * title — Etsy titles say the same thing three ways, and counting each would
 * let one keyword-stuffed listing invent a trend on its own.
 */
export function phraseSales(listings: SoldListing[]) {
  const units = new Map<string, number>();
  const shops = new Map<string, Set<number>>();

  for (const listing of listings) {
    const sold = Math.max(0, Number(listing.sold) || 0);
    if (!sold) continue;
    const parts = words(listing.title);
    const seen = new Set<string>();

    for (let size = 2; size <= 4; size++) {
      for (let at = 0; at + size <= parts.length; at++) {
        const gram = parts.slice(at, at + size);
        /* A phrase that is only filler is not a phrase. */
        if (gram.every(word => NOISE.has(word))) continue;
        /* Nor is one that starts or ends on filler — "in my mama" not "my mama era for". */
        if (NOISE.has(gram[0]) || NOISE.has(gram[gram.length - 1])) continue;
        const phrase = gram.join(" ");
        if (seen.has(phrase)) continue;
        seen.add(phrase);
        units.set(phrase, (units.get(phrase) ?? 0) + sold);
        const listingIds = shops.get(phrase) ?? new Set<number>();
        listingIds.add(listing.listingId);
        shops.set(phrase, listingIds);
      }
    }
  }
  return { units, listings: shops };
}

export type Rising = {
  phrase: string;
  sold: number;
  soldBefore: number;
  /** How many separate listings sold under this phrase — the crowding check. */
  listings: number;
};

/**
 * PHRASES SELLING MORE THAN THEY WERE.
 *
 * `minListings` is the guard against one shop's good week looking like a
 * movement. A phrase carried by a single listing is that listing's story, not
 * the market's, however many units it moved.
 */
export function rising(
  now: SoldListing[],
  before: SoldListing[],
  { limit = 12, minSold = 3, minListings = 2 } = {},
): Rising[] {
  const current = phraseSales(now);
  const prior = phraseSales(before);

  const out: Rising[] = [];
  for (const [phrase, sold] of current.units) {
    const listings = current.listings.get(phrase)?.size ?? 0;
    if (sold < minSold || listings < minListings) continue;
    const soldBefore = prior.units.get(phrase) ?? 0;
    if (sold <= soldBefore) continue;
    out.push({ phrase, sold, soldBefore, listings });
  }

  /*
    Ranked by how much it GREW, not by how big it is. The biggest phrases are
    always the evergreen ones — a seller already knows people buy mama shirts.
    What they cannot see is which phrase moved this week.
  */
  return out
    .sort((a, b) => (b.sold - b.soldBefore) - (a.sold - a.soldBefore))
    .slice(0, limit);
}

export type ShelfMove = { product: string; sold: number; soldBefore: number; share: number };

/** Which product shelves gained, by units and by share of the whole board. */
export function shelfShift(now: SoldListing[], before: SoldListing[]): ShelfMove[] {
  const total = (rows: SoldListing[]) => rows.reduce((sum, r) => sum + (Number(r.sold) || 0), 0);
  const per = (rows: SoldListing[]) => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.product, (map.get(row.product) ?? 0) + (Number(row.sold) || 0));
    return map;
  };
  const nowPer = per(now), beforePer = per(before), nowTotal = Math.max(1, total(now));

  return [...nowPer.entries()]
    .map(([product, sold]) => ({
      product,
      sold,
      soldBefore: beforePer.get(product) ?? 0,
      share: Math.round((sold / nowTotal) * 100),
    }))
    .sort((a, b) => (b.sold - b.soldBefore) - (a.sold - a.soldBefore));
}

export type Band = { product: string; low: number; high: number; sold: number };

/**
 * WHERE THE MONEY IS SITTING, PER SHELF.
 *
 * The median selling price is more useful than the average: one $200 blanket
 * drags a mean somewhere nobody is actually shopping. Reported as the middle
 * half of sales — the range most buyers paid inside — because a seller setting
 * a price wants a bracket, not a point.
 */
export function priceBands(listings: SoldListing[]): Band[] {
  const byProduct = new Map<string, { price: number; sold: number }[]>();
  for (const listing of listings) {
    if (listing.price == null || !(Number(listing.sold) > 0)) continue;
    const rows = byProduct.get(listing.product) ?? [];
    rows.push({ price: Number(listing.price), sold: Number(listing.sold) });
    byProduct.set(listing.product, rows);
  }

  const bands: Band[] = [];
  for (const [product, rows] of byProduct) {
    /* Weighted by units, so the band describes what buyers paid rather than
       what sellers listed. */
    const spread: number[] = [];
    for (const row of rows) for (let i = 0; i < row.sold; i++) spread.push(row.price);
    if (spread.length < 4) continue;
    spread.sort((a, b) => a - b);
    const at = (q: number) => spread[Math.min(spread.length - 1, Math.floor(spread.length * q))];
    bands.push({
      product,
      low: Math.round(at(0.25) * 100) / 100,
      high: Math.round(at(0.75) * 100) / 100,
      sold: spread.length,
    });
  }
  return bands.sort((a, b) => b.sold - a.sold);
}

export type Reading = {
  rising: Rising[];
  shelves: ShelfMove[];
  bands: Band[];
  totalSold: number;
  /** True when there is not enough behind this to say anything honest. */
  thin: boolean;
};

/**
 * Everything the writer is allowed to talk about, and nothing it may invent.
 *
 * Named `readPatterns` rather than `read`: an export called `read` collides
 * with a local in half the files in this app, which makes it impossible to
 * tell a missing import from an ordinary variable.
 */
export function readPatterns(now: SoldListing[], before: SoldListing[]): Reading {
  const totalSold = now.reduce((sum, r) => sum + (Number(r.sold) || 0), 0);
  return {
    rising: rising(now, before),
    shelves: shelfShift(now, before),
    bands: priceBands(now),
    totalSold,
    /*
      A read needs something to read. Below this the phrases are noise and the
      honest output is to say so rather than to dress three sales up as a
      movement.
    */
    thin: totalSold < 50 || now.length < 20,
  };
}
