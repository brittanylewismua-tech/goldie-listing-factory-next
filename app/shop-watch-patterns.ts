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
  /* WHY THE NUMBER MATTERS, NOT JUST WHAT IT IS.

     The attention cards shipped reading "9 of the last 496 reviews in this
     shop are for this listing", which is a true sentence a member can do
     nothing with: 9 out of 496 sounds small, and whether it is large depends
     entirely on how many listings those 496 reviews were spread across — a
     denominator the card never showed. The selection rule knew (it only
     admits listings above one and a half times an even share) and then threw
     the reasoning away before printing.

     A raw count is the evidence under the insight. This is the insight. */
  because: string;
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
      headline: `This listing is drawing ${(group.length / evenShare).toFixed(1)}× `
        + `its share of this shop's recent reviews`,
      /*
        D1674 · THE CARD KEEPS WHAT IS ITS OWN. THE CAVEAT IS SAID ONCE.

        This sentence carried the shop-wide baseline and the reviews-are-not-
        sales warning on EVERY card. Measured on the live page: three cards in
        a row repeating the same forty words verbatim, on a section whose only
        job is to be read. The numbers that differ per listing stay here; what
        is true of the whole shop moved up to the section, where it is read
        once and still read before any of these.
      */
      because: `${group.length} of the last ${recent.length} reviews in this shop are for `
        + `this one listing, against an average of ${evenShare.toFixed(1)} for a `
        + `reviewed listing here.`,
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
  explain: (phrase: string, count: number, sample: number, listings: number) => string,
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
      because: explain(entry.phrase, entry.hits.length, recent.length,
        new Set(entry.hits.map(hit => hit.listingId)).size),
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
      phrase => `Buyers here keep saying the same thing: "${phrase}"`,
      rating => rating === null || rating >= 4,
      (phrase, count, sample, listings) =>
        `${count} of ${sample} recent positive reviews use the words "${phrase}", across `
        + `${listings} listing${listings === 1 ? "" : "s"}. A phrase that repeats across `
        + `different buyers is what this shop is getting right in their words.`),
    ...phrasePatterns(reviews, RECIPIENTS, now, "love",
      phrase => `This shop is being bought as a gift for a ${phrase}`,
      rating => rating === null || rating >= 4,
      (phrase, count, sample, listings) =>
        `${count} of ${sample} recent positive reviews mention a ${phrase}, across `
        + `${listings} listing${listings === 1 ? "" : "s"}. That is who the buyer is `
        + `shopping for, said by the buyer rather than inferred from the listing.`),
    ...phrasePatterns(reviews, OCCASIONS, now, "love",
      phrase => `${phrase[0].toLocaleUpperCase()}${phrase.slice(1)} is showing up in what buyers write`,
      rating => rating === null || rating >= 4,
      (phrase, count, sample, listings) =>
        `${count} of ${sample} recent positive reviews mention ${phrase}, across `
        + `${listings} listing${listings === 1 ? "" : "s"}. Reviews can be written long `
        + `after delivery, so this says the occasion mattered to buyers, not when they bought.`),
  ].slice(0, 8);

export const whatBuyersDislike = (reviews: Review[], now: number) =>
  phrasePatterns(reviews, COMPLAINT, now, "dislike",
    phrase => `Buyers keep raising the same problem: "${phrase}"`,
    rating => rating === null || rating <= 3,
    (phrase, count, sample, listings) =>
      `${count} of ${sample} recent reviews rated three stars or lower use the words `
      + `"${phrase}", across ${listings} listing${listings === 1 ? "" : "s"}. A complaint `
      + `several different buyers make is a pattern in the product, not one bad day.`);

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

  if (both("saleCount") && current.saleCount !== previous.saleCount) {
    const moved = (current.saleCount ?? 0) - (previous.saleCount ?? 0);
    patterns.push({
      section: "changed",
      headline: moved > 0
        ? `This shop sold ${moved} more item${moved === 1 ? "" : "s"} since yesterday`
        : `This shop's sales total fell by ${Math.abs(moved)} since yesterday`,
      because: `Etsy's own shop sales counter moved from ${previous.saleCount} to `
        + `${current.saleCount} between two observations a day apart. This is the one `
        + `number here that is actually sales rather than reviews.`,
      listingId: null, evidenceClass: "confirmed-shop-total",
      supportingReviewIds: [], sampleSize: 1, windowFrom: now - 86_400, windowTo: now,
    });
  }

  if (both("favorites") && current.favorites !== previous.favorites) {
    const moved = (current.favorites ?? 0) - (previous.favorites ?? 0);
    /* One or two favourites a day is background noise in any shop of size. A
       card for it is a count with no interpretation, which is the thing this
       section is not for. */
    const share = moved / Math.max(1, previous.favorites ?? 1);
    if (Math.abs(moved) >= 5 || share >= 0.02)
      patterns.push({
        section: "changed",
        headline: moved > 0
          ? `${moved} people favourited this shop since yesterday`
          : `This shop lost ${Math.abs(moved)} favourites since yesterday`,
        because: `Favourites moved from ${previous.favorites} to ${current.favorites} in a `
          + `day — ${(Math.abs(share) * 100).toFixed(1)}% of where it started. Favourites `
          + `are interest, not purchases.`,
        listingId: null, evidenceClass: "confirmed-shop-total",
        supportingReviewIds: [], sampleSize: 1, windowFrom: now - 86_400, windowTo: now,
      });
  }

  /*
    "3 NEW REVIEWS SINCE YESTERDAY" WAS NOT AN INSIGHT.

    It states that reviews were added. That is a fact the member can read off
    the shop page, it carries no interpretation, and it is the exact shape of
    card this section exists to avoid — a count with a time window attached.
    What reviews mean is already said properly elsewhere: which listing is
    drawing a disproportionate share, and which words buyers repeat.

    Removed rather than reworded. There is no sentence that makes a bare
    arrival count worth a member's attention.
  */

  /* A rating moves on small samples for reasons that are not about quality,
     so it needs more support than anything else here. */
  if (both("averageRating") && current.averageRating !== previous.averageRating
      && reviewSampleSize >= RATING_MIN_SUPPORT)
    patterns.push({
      section: "changed",
      headline: (current.averageRating ?? 0) > (previous.averageRating ?? 0)
        ? `This shop's rating is climbing`
        : `This shop's rating is slipping`,
      because: `The average moved from ${previous.averageRating} to ${current.averageRating} `
        + `across ${reviewSampleSize} reviews. A rating built on a small sample moves for `
        + `reasons that are not about quality, which is why this needs at least `
        + `${RATING_MIN_SUPPORT} reviews before it is shown at all.`,
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
