/**
 * A COHORT FOR THE NICHE THE MEMBER TYPED, NOT A CLASSIFIED MARKETPLACE.
 *
 * Goldie has not classified Etsy into customer niches and must never imply it
 * has. What it can honestly do is take the phrase the member gives and ask
 * which listings THAT ALREADY CARRY VERIFIED MOMENTUM describe themselves in
 * those terms, using the listing's own title and tags. The claim that supports
 * is narrow and true:
 *
 *   "Listings with verified momentum whose own title and tags match this niche."
 *
 * Searching Etsy for the phrase and intersecting the results was tried first
 * and measured at zero across seven niches: Etsy matches hundreds of thousands
 * of listings per phrase, a search reads a few hundred, and the corpus is under
 * a thousand, so the overlap is arithmetically about a tenth of a listing. The
 * corpus is the side we hold, so the corpus is the side we read.
 *
 * Etsy's product taxonomy is deliberately not used for this. Taxonomy says
 * t-shirt; it does not say who the shirt is for, and treating the two as the
 * same thing is the error Shop Map was rebuilt to remove.
 *
 * Every listing carries the reason it entered, so a cohort can always be
 * explained after the fact.
 */
export type Entry = "search-match" | "saved-niche-discovery";

export type Candidate = {
  listingId: number;
  shopId: number;
  title: string;
  tags: string[];
};

export type Member = {
  listingId: number; shopId: number; entry: Entry; matchedTerms: string[];
};

export type Rejection = { listingId: number; because: string };

/**
 * The phrase as a set of comparable terms.
 *
 * Lowercased, punctuation dropped, plurals folded, and stop words removed so
 * "Dog Mom Gifts" and "dog moms" agree. Deliberately crude: this decides what
 * a member asked for, not what a word means.
 */
const STOP = new Set(["the", "a", "an", "and", "or", "for", "of", "to", "in",
  "with", "gift", "gifts", "shirt", "tshirt", "t", "tee", "mug", "sticker"]);

const singular = (word: string) =>
  word.endsWith("ies") && word.length > 4 ? `${word.slice(0, -3)}y`
  : word.endsWith("sses") || word.endsWith("shes") || word.endsWith("ches") ? word.slice(0, -2)
  : word.endsWith("s") && !word.endsWith("ss") && word.length > 3 ? word.slice(0, -1)
  : word;

export function normalizeNiche(phrase: string): { query: string; terms: string[] } {
  const words = phrase.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const terms = words.map(singular).filter(word => word.length > 1 && !STOP.has(word));
  return { query: words.join(" ").trim(), terms };
}

const wordsOf = (text: string) =>
  new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(Boolean).map(singular));

/**
 * Does this search result actually have anything to do with what was asked?
 *
 * Etsy's relevance ranking is generous, and a cohort padded with whatever came
 * back on page three would make every comparison meaningless. A listing is kept
 * only when its own title or tags carry the member's terms. Nothing here reads
 * the listing's artwork or invents a subject for it.
 */
export function relates(
  candidate: Candidate, terms: string[],
): { ok: true; matched: string[] } | { ok: false; because: string } {
  if (!terms.length) return { ok: false, because: "the niche phrase carried no usable terms" };
  const haystack = wordsOf(`${candidate.title} ${candidate.tags.join(" ")}`);
  const matched = terms.filter(term => haystack.has(term));
  /* A multi-word niche has to match more than one of its words, or "dog mom"
     keeps every listing that says "dog". */
  const required = terms.length >= 2 ? 2 : 1;
  if (matched.length < required)
    return { ok: false, because: matched.length
      ? `only "${matched.join(", ")}" of the niche terms appears in its title or tags`
      : "none of the niche terms appears in its title or tags" };
  return { ok: true, matched };
}

/**
 * Intersect search results with listings that have verified momentum.
 *
 * `qualified` is the momentum corpus. A listing that Etsy returned but that we
 * have no evidence about is not in the cohort, and a listing we have evidence
 * about that Etsy did not return for this phrase is not in it either. The
 * cohort is the overlap, and nothing else.
 */
export function intersect(
  candidates: Candidate[], qualified: Set<number>, terms: string[],
  { savedDiscovery = new Set<number>() }: { savedDiscovery?: Set<number> } = {},
): { members: Member[]; rejected: Rejection[]; searched: number; withMomentum: number } {
  const members: Member[] = [];
  const rejected: Rejection[] = [];
  let withMomentum = 0;
  const seen = new Set<number>();
  for (const candidate of candidates) {
    if (seen.has(candidate.listingId)) continue;
    seen.add(candidate.listingId);
    if (!qualified.has(candidate.listingId)) continue;
    withMomentum += 1;
    const verdict = relates(candidate, terms);
    if (!verdict.ok) {
      rejected.push({ listingId: candidate.listingId, because: verdict.because });
      continue;
    }
    members.push({
      listingId: candidate.listingId, shopId: candidate.shopId,
      /* Provenance: found again by this query, or already discovered by a
         Market Watch niche that the member saved. */
      entry: savedDiscovery.has(candidate.listingId) ? "saved-niche-discovery" : "search-match",
      matchedTerms: verdict.matched,
    });
  }
  return { members, rejected, searched: seen.size, withMomentum };
}

/** What may be said about a cohort built this way. Never more than this. */
export const COHORT_CLAIM =
  "Listings with verified momentum whose own title and tags match this niche.";
