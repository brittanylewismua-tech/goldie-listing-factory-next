/**
 * A SAVED NICHE, WATCHED OVER TIME.
 *
 * A search answers once. A watch keeps answering: the member names the niche
 * once, and every day the evidence that has accumulated is re-matched against
 * it, so returning tomorrow shows what moved rather than the same page again.
 *
 * WHAT IT IS NOT. It is not a view of the member's own shop — that is Shop Map
 * and none of its logic belongs here. It is not a recommendation engine
 * either: this shows what the evidence says and stops. The seller decides.
 *
 * Matching is corpus-first, the method proven for Design Scanner: begin with
 * listings that carry verified movement, and ask whether THEY describe
 * themselves in the member's terms. Etsy search results are never substituted
 * when the verified corpus is thin — a thin niche says it is thin.
 */

/** What a listing's evidence currently amounts to. Every label is defined here. */
export type EvidenceState =
  | "no-evidence"        /* nothing observed for this niche at all */
  | "gathering"          /* the niche is watched, movement not yet confirmed */
  | "momentum"           /* sale-linked movement in ONE polling interval */
  | "repeated-momentum"  /* sale-linked movement in MULTIPLE DISTINCT intervals */
  | "stale"              /* qualified once, nothing confirmed inside the window */
  | "no-longer-qualifies"; /* listing gone, inactive, or evidence invalidated */

export const STALE_AFTER_SECONDS = 7 * 86_400;

export type ListingEvidence = {
  listingId: number;
  shopId: number;
  /* The number of DISTINCT polling intervals that produced sale-linked
     movement. This is the only thing that can grant repeated momentum, and
     it is a count of intervals, never of units. */
  intervals: number;
  lastConfirmedAt: number;
  firstConfirmedAt: number;
  present: boolean;
  linkedReviews: number;
};

export const LABELS: Record<EvidenceState, string> = {
  "no-evidence": "No evidence yet",
  gathering: "Gathering evidence",
  momentum: "Momentum detected",
  "repeated-momentum": "Repeated momentum",
  stale: "Evidence is stale",
  "no-longer-qualifies": "No longer qualifying",
};

/**
 * The state of one listing.
 *
 * Order matters: a listing that has gone is reported as gone even if its last
 * evidence was strong, and staleness outranks the strength of old evidence,
 * because "this was moving last week" and "this is moving" are different
 * claims and only one of them is worth a member's attention.
 */
export function stateOf(evidence: ListingEvidence, now: number): EvidenceState {
  if (!evidence.present) return "no-longer-qualifies";
  if (!evidence.intervals) return "gathering";
  if (now - evidence.lastConfirmedAt > STALE_AFTER_SECONDS) return "stale";
  /* MULTIPLE DISTINCT INTERVALS. Two sales inside one interval is one
     observation of one moment, not a repeat, and calling it one would make
     the strongest label in the product the easiest to earn. */
  return evidence.intervals >= 2 ? "repeated-momentum" : "momentum";
}

export type NicheSummary = {
  meaningfulMomentum: boolean;
  moving: number;
  repeated: number;
  newSinceLastBrief: number;
  shops: number;
  windowSeconds: number;
  earliest: number;
  latest: number;
  withReviews: number;
};

export function summarize(
  listings: ListingEvidence[], now: number,
  { since = 0, minimumListings = 12, minimumShops = 8 }:
  { since?: number; minimumListings?: number; minimumShops?: number } = {},
): NicheSummary {
  const live = listings.filter(row => {
    const state = stateOf(row, now);
    return state === "momentum" || state === "repeated-momentum";
  });
  const shops = new Set(live.map(row => row.shopId));
  let earliest = Infinity;
  let latest = 0;
  for (const row of live) {
    earliest = Math.min(earliest, row.firstConfirmedAt);
    latest = Math.max(latest, row.lastConfirmedAt);
  }
  return {
    /* "Meaningful" is the same bar the scanner compares against, so a niche
       cannot look substantial here and refuse to support a comparison. */
    meaningfulMomentum: live.length >= minimumListings && shops.size >= minimumShops,
    moving: live.length,
    repeated: live.filter(row => row.intervals >= 2).length,
    /* New since the member last looked, not new since the listing existed. */
    newSinceLastBrief: since ? live.filter(row => row.firstConfirmedAt > since).length : 0,
    shops: shops.size,
    windowSeconds: live.length ? Math.max(0, latest - earliest) : 0,
    earliest: live.length ? earliest : 0,
    latest,
    withReviews: live.filter(row => row.linkedReviews > 0).length,
  };
}

/**
 * Up to three visual patterns shared across the listings that are moving.
 *
 * Built from the content-free reference analysis, so a pattern can describe
 * how designs are built and can never name a slogan, a subject, an
 * illustration or a shop. They are stated as observations. They are not
 * instructions, and nothing here suggests the member should copy them.
 */
const PATTERN_COPY: Record<string, (value: string) => string> = {
  composition: value => `Most moving listings use ${value} composition.`,
  typography: value => `${value[0].toUpperCase()}${value.slice(1)} type is the most common choice.`,
  colorStrategy: value => `${value[0].toUpperCase()}${value.slice(1)} designs are common here.`,
  contrast: value => `${value[0].toUpperCase()}${value.slice(1)}-contrast designs dominate.`,
  density: value => `Most are ${value} rather than busy.`,
  mechanism: value => `Most lead with ${/^[aeiou]/i.test(value) ? "an" : "a"} ${value}.`,
  thumbnailReadability: value => value === "readable"
    ? "Most stay readable at thumbnail size." : "",
};

/* A pattern is only a pattern when most of the cohort shares it. */
export const PATTERN_SHARE = 0.55;

export function patterns(
  analyses: Array<Record<string, unknown>>, { share = PATTERN_SHARE } = {},
): string[] {
  if (analyses.length < 4) return [];
  const found: Array<{ line: string; strength: number }> = [];
  for (const [field, phrase] of Object.entries(PATTERN_COPY)) {
    const counts = new Map<string, number>();
    for (const row of analyses) {
      const value = row[field];
      if (typeof value !== "string" || !value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best) continue;
    const strength = best[1] / analyses.length;
    if (strength < share) continue;
    const line = phrase(best[0]);
    if (line) found.push({ line, strength });
  }
  return found.sort((a, b) => b.strength - a.strength).slice(0, 3).map(row => row.line);
}

/** Anything that would turn an observation into an instruction. */
export const FORBIDDEN_PATTERN_LANGUAGE = [
  "you should", "try using", "copy", "match this", "add a", "switch to",
  "recommend", "consider using", "your design",
];
