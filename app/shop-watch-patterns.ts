/**
 * WHAT THE REVIEWS ACTUALLY SHOW.
 *
 * A feed saying "three reviews appeared" is not intelligence; the member can
 * see that on Etsy. What they cannot see quickly is that one listing has
 * drawn most of the recent reviews, or that four different buyers used the
 * same word about the print quality.
 *
 * Everything here is deterministic string and arithmetic work. No model is
 * called, and none is needed: counting, grouping and matching a phrase list
 * is exactly what this kind of evidence supports.
 *
 * THE HARD RULE, RESTATED IN CODE BELOW: a review is evidence that somebody
 * reviewed. It is not a sale, it is not dated when the sale happened, and a
 * count of reviews is never presented as a count of sales.
 */
export type Review = {
  transactionId: number;
  listingId: number | null;
  rating: number | null;
  review: string;
  /* When the REVIEW was written. Etsy allows this up to a hundred days after
     estimated delivery, so it says nothing about when the order was placed. */
  createdAt: number;
};

/* How many reviews must agree before a pattern is worth showing. Below this
   it is an anecdote, and presenting an anecdote as a pattern is the failure
   mode this whole feature has to avoid. */
export const MIN_SUPPORT = 3;
export const RATING_MIN_SUPPORT = 8;
export const RECENT_DAYS = 30;

export type EvidenceClass =
  | "confirmed-shop-total"
  | "confirmed-review-activity"
  | "confirmed-listing-identity"
  | "deterministic-text-pattern"
  | "current-listing-state"
  | "unresolved";

export type Pattern = {
  section: "attention" | "love" | "dislike" | "changed";
  headline: string;
  listingId: number | null;
  evidenceClass: EvidenceClass;
  /* Every number a member sees can be traced back to these. */
  supportingReviewIds: number[];
  sampleSize: number;
  windowFrom: number;
  windowTo: number;
};

const within = (reviews: Review[], now: number, days = RECENT_DAYS) =>
  reviews.filter(review => review.createdAt >= now - days * 86_400);

/**
 * Listings drawing a concentrated share of recent review activity.
 *
 * "Concentrated" means more than its even share, not merely present — with
 * twelve listings reviewed, three reviews each is not a signal about any of
 * them.
 */
export function gettingAttention(reviews: Review[], now: number): Pattern[] {
  const recent = within(reviews, now).filter(review => review.listingId);
  if (recent.length < MIN_SUPPORT) return [];
  const byListing = new Map<number, Review[]>();
  for (const review of recent) {
    const held = byListing.get(review.listingId!) ?? [];
    held.push(review);
    byListing.set(review.listingId!, held);
  }
  const evenShare = recent.length / Math.max(1, byListing.size);

  return [...byListing.entries()]
    .filter(([, group]) => group.length >= MIN_SUPPORT && group.length > evenShare * 1.5)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([listingId, group]) => ({
      section: "attention" as const,
      /* Says reviews, because reviews is what was counted. */
      headline: `${group.length} of the last ${recent.length} reviews in this shop are for this listing`,
      listingId,
      evidenceClass: "confirmed-review-activity" as const,
      supportingReviewIds: group.map(review => review.transactionId),
      sampleSize: group.length,
      windowFrom: now - RECENT_DAYS * 86_400,
      windowTo: now,
    }));
}

/* Phrases buyers actually repeat. Matched as whole words, because a
   substring match once turned the colour "Light Pink" into 1,066 enamel
   pins. */
const PRAISE = [
  "true to size", "soft", "great quality", "fast shipping", "exactly as pictured",
  "well made", "gift", "loved it", "perfect", "vibrant", "comfortable", "thick",
];
const COMPLAINT = [
  "too small", "too big", "runs small", "runs large", "thin", "faded",
  "cracked", "peeling", "late", "damaged", "wrong size", "wrong item", "scratchy",
];

const RECIPIENTS = ["daughter", "son", "wife", "husband", "mom", "mother", "dad",
  "father", "sister", "brother", "friend", "teacher", "grandma", "granddaughter"];
const OCCASIONS = ["birthday", "christmas", "anniversary", "wedding", "graduation",
  "mother's day", "father's day", "baby shower", "halloween", "valentine"];

const mentions = (text: string, phrase: string) => {
  const words = ` ${text.toLocaleLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim()} `;
  return words.includes(` ${phrase} `);
};

function phrasePatterns(
  reviews: Review[], phrases: string[], now: number,
  section: Pattern["section"], shape: (phrase: string, count: number) => string,
  ratingFilter: (rating: number | null) => boolean,
): Pattern[] {
  const recent = within(reviews, now).filter(review => ratingFilter(review.rating));
  return phrases
    .map(phrase => ({
      phrase,
      hits: recent.filter(review => mentions(review.review, phrase)),
    }))
    .filter(entry => entry.hits.length >= MIN_SUPPORT)
    .sort((a, b) => b.hits.length - a.hits.length)
    .slice(0, 6)
    .map(entry => ({
      section,
      headline: shape(entry.phrase, entry.hits.length),
      /* A phrase pattern belongs to the shop unless every mention is about
         one listing; attributing it to a listing on a majority would put a
         complaint on a product some of those buyers never bought. */
      listingId: new Set(entry.hits.map(hit => hit.listingId)).size === 1
        ? entry.hits[0].listingId : null,
      evidenceClass: "deterministic-text-pattern" as const,
      supportingReviewIds: entry.hits.map(hit => hit.transactionId),
      sampleSize: entry.hits.length,
      windowFrom: now - RECENT_DAYS * 86_400,
      windowTo: now,
    }));
}

export const whatBuyersLove = (reviews: Review[], now: number) =>
  [
    ...phrasePatterns(reviews, PRAISE, now, "love",
      (phrase, count) => `${count} recent reviews mention "${phrase}"`,
      rating => rating === null || rating >= 4),
    ...phrasePatterns(reviews, RECIPIENTS, now, "love",
      (phrase, count) => `${count} recent reviews mention buying this for a ${phrase}`,
      rating => rating === null || rating >= 4),
    ...phrasePatterns(reviews, OCCASIONS, now, "love",
      (phrase, count) => `${count} recent reviews mention ${phrase}`,
      rating => rating === null || rating >= 4),
  ].slice(0, 8);

export const whatBuyersDislike = (reviews: Review[], now: number) =>
  phrasePatterns(reviews, COMPLAINT, now, "dislike",
    (phrase, count) => `${count} recent reviews mention "${phrase}"`,
    rating => rating === null || rating <= 3);

export type ShopTotals = {
  /* Present only when Etsy exposed the exact value. An absent field stays
     absent; an estimate would be indistinguishable from a fact on the page. */
  saleCount?: number;
  favorites?: number;
  reviewCount?: number;
  averageRating?: number;
};

/**
 * Shop-level movement between two observations.
 *
 * Only fields Etsy gave us both times can move. A field missing from either
 * side produces nothing at all, rather than a zero that reads as "no change".
 */
export function whatChanged(
  previous: ShopTotals, current: ShopTotals, now: number, reviewSampleSize: number,
): Pattern[] {
  const patterns: Pattern[] = [];
  const both = (key: keyof ShopTotals) =>
    typeof previous[key] === "number" && typeof current[key] === "number";

  if (both("saleCount") && current.saleCount !== previous.saleCount)
    patterns.push({
      section: "changed",
      headline: `Shop sales total moved from ${previous.saleCount} to ${current.saleCount}`,
      listingId: null, evidenceClass: "confirmed-shop-total",
      supportingReviewIds: [], sampleSize: 1, windowFrom: now - 86_400, windowTo: now,
    });

  if (both("favorites") && current.favorites !== previous.favorites)
    patterns.push({
      section: "changed",
      headline: `Shop favorites moved from ${previous.favorites} to ${current.favorites}`,
      listingId: null, evidenceClass: "confirmed-shop-total",
      supportingReviewIds: [], sampleSize: 1, windowFrom: now - 86_400, windowTo: now,
    });

  if (both("reviewCount") && current.reviewCount !== previous.reviewCount)
    patterns.push({
      section: "changed",
      headline: `${(current.reviewCount ?? 0) - (previous.reviewCount ?? 0)} new reviews since yesterday`,
      listingId: null, evidenceClass: "confirmed-review-activity",
      supportingReviewIds: [], sampleSize: 1, windowFrom: now - 86_400, windowTo: now,
    });

  /* A rating moves on small samples for reasons that are not about quality,
     so it needs more support than anything else here. */
  if (both("averageRating") && current.averageRating !== previous.averageRating
      && reviewSampleSize >= RATING_MIN_SUPPORT)
    patterns.push({
      section: "changed",
      headline: `Average rating moved from ${previous.averageRating} to ${current.averageRating}`,
      listingId: null, evidenceClass: "confirmed-shop-total",
      supportingReviewIds: [], sampleSize: reviewSampleSize,
      windowFrom: now - 86_400, windowTo: now,
    });

  return patterns;
}

/** Evidence older than this is labelled, never shown as current. */
export const FRESH_SECONDS = 6 * 3_600;
export const freshness = (refreshedAt: number, now: number) =>
  now - refreshedAt <= FRESH_SECONDS
    ? { fresh: true as const, label: "" }
    : { fresh: false as const,
        label: `Last checked ${Math.floor((now - refreshedAt) / 3_600)} hours ago` };

export function buildBrief(
  { reviews, previous, current, refreshedAt, now }:
  { reviews: Review[]; previous: ShopTotals; current: ShopTotals;
    refreshedAt: number; now: number },
) {
  const recent = within(reviews, now);
  return {
    attention: gettingAttention(reviews, now),
    love: whatBuyersLove(reviews, now),
    dislike: whatBuyersDislike(reviews, now),
    changed: whatChanged(previous, current, now, recent.length),
    freshness: freshness(refreshedAt, now),
    /*
      NEVER A SALES FIGURE. This is how many reviews were read, and it is
      labelled as such wherever it is shown.
    */
    reviewsConsidered: recent.length,
  };
}
