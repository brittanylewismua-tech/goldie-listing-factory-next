/**
 * WHAT GOLDIE WATCHES IS NOT FIXED FOREVER.
 *
 * Until now a saved niche could only find listings already in the corpus, so a
 * member watching something Goldie had never looked at got an empty page and
 * no path out of it. Saving a niche now EXPANDS what is monitored.
 *
 * THE LINE THIS MUST NOT CROSS. Etsy search says what to start WATCHING. It
 * never says what is MOVING. A search result is a candidate; it becomes
 * evidence only when the sensor and the direct poller observe it move, and it
 * is not shown to a member before that. Search rank, favourites, review count
 * and how good the picture looks decide nothing.
 *
 * SHARED, NOT PER MEMBER. Twenty members watching "dog mom" share one
 * candidate pool. Their watches point at it; they do not each create one.
 */
export type CandidateState =
  | "discovered"          /* found by search, nothing done yet */
  | "awaiting-baseline"   /* queued for its first reading */
  | "monitoring"          /* baselined, being polled, no movement yet */
  | "momentum"            /* moved once */
  | "repeated-momentum"   /* moved in distinct intervals */
  | "inactive"            /* listing is no longer active */
  | "unavailable"         /* Etsy will not answer for it */
  | "expired"             /* dropped from the pool for lack of evidence */
  | "historical";         /* kept as evidence, no longer actively polled */

export const ACTIVE_STATES: CandidateState[] = [
  "awaiting-baseline", "monitoring", "momentum", "repeated-momentum",
];

/** Only these may appear to a member as evidence. */
export const EVIDENCE_STATES: CandidateState[] = ["momentum", "repeated-momentum"];

export type Candidate = {
  nicheKey: string;
  listingId: number;
  shopId: number;
  discoveryQuery: string;
  discoveredAt: number;
  searchPage: number;
  listingState: string;
  state: CandidateState;
  baselinedAt: number | null;
  lastPolledAt: number | null;
  priority: number;
  lastQualifyingAt: number | null;
  lastAvailabilityCheck: number | null;
  removedReason: string;
};

/**
 * CORPUS GROWTH HAS A LIFECYCLE OR IT HAS NO LIMIT.
 *
 * Every number here is configurable, and every one exists because the poller's
 * cost is linear in the size of the corpus: `listings/batch` answers 100 ids
 * per call, so N monitored listings cost ceil(N/100) calls per sweep and
 * 144 sweeps a day at ten minutes.
 */
export const GROWTH = {
  maxCandidatesPerNiche: 200,
  maxNewCandidatesPerDay: 2_000,
  /* The ceiling that matters. At 144 sweeps/day this is the corpus size whose
     polling fits inside the 80,000-call operating budget with room for
     everything else. See `pollerCostFor`. */
  maxActiveMonitored: 40_000,
  /* A candidate that has been watched this long without ever moving is
     demoted: it is not interesting, and it is occupying a slot. */
  demoteAfterDaysWithoutEvidence: 21,
  /* Rediscovery brings a demoted candidate back rather than starting over. */
  reactivateOnRediscovery: true,
  searchPagesPerNiche: 3,
  refreshDiscoveryEveryHours: 24,
} as const;

/**
 * Priority decides who gets a slot when the corpus is full.
 *
 * Deliberately simple and explainable: evidence beats interest, and interest
 * beats novelty. Nothing here is a score a member ever sees.
 */
export function priorityFor(
  { watchers, hasPriorEvidence, repeated }:
  { watchers: number; hasPriorEvidence: boolean; repeated: boolean },
): number {
  let priority = 0;
  /* A listing that has already proved it moves is the most valuable thing in
     the pool — dropping it would lose evidence we cannot re-collect. */
  if (repeated) priority += 100;
  else if (hasPriorEvidence) priority += 50;
  /* A niche several members watch is worth more than one only one watches. */
  priority += Math.min(40, watchers * 10);
  return priority;
}

/** What polling a corpus of this size costs, per day. */
export function pollerCostFor(
  listings: number, { batchSize = 100, sweepsPerDay = 144 } = {},
) {
  const callsPerSweep = Math.ceil(listings / batchSize);
  return { callsPerSweep, callsPerDay: callsPerSweep * sweepsPerDay };
}

/**
 * The largest corpus that fits a daily call budget, leaving room for
 * everything else that needs Etsy.
 */
export function maxCorpusFor(
  dailyBudget: number, { batchSize = 100, sweepsPerDay = 144, reserveForOther = 0.25 } = {},
) {
  const usable = Math.floor(dailyBudget * (1 - reserveForOther));
  return Math.floor((usable / sweepsPerDay) * batchSize);
}

/**
 * Is this candidate still worth a slot?
 *
 * Removal is never silent: every path returns the reason, and the reason is
 * stored on the row.
 */
export function shouldRemove(
  candidate: Candidate, now: number, growth = GROWTH,
): { remove: true; reason: string; to: CandidateState } | { remove: false } {
  if (candidate.listingState === "removed" || candidate.listingState === "unavailable")
    return { remove: true, reason: "the listing is gone from Etsy", to: "unavailable" };
  if (candidate.listingState && candidate.listingState !== "active"
    && candidate.listingState !== "sold_out")
    return { remove: true, reason: "the listing is no longer active", to: "inactive" };

  /* Evidence is never demoted for being old: a listing that moved is the
     reason the pool exists. */
  if (candidate.lastQualifyingAt) return { remove: false };

  const watchedFor = candidate.baselinedAt ? now - candidate.baselinedAt : 0;
  if (watchedFor > growth.demoteAfterDaysWithoutEvidence * 86_400)
    return { remove: true,
      reason: `watched for ${growth.demoteAfterDaysWithoutEvidence} days with no movement`,
      to: "expired" };
  return { remove: false };
}

/**
 * A member dropping a watch must not take a candidate with it.
 *
 * The candidate stays while ANYTHING still needs it, and the caller is told
 * which thing that is — so "why is this still being polled" has an answer.
 */
export function stillNeeded(
  { otherWatchers, inScannerCohort, hasEvidence }:
  { otherWatchers: number; inScannerCohort: boolean; hasEvidence: boolean },
): { needed: boolean; because: string } {
  if (otherWatchers > 0)
    return { needed: true, because: `${otherWatchers} other watch${otherWatchers === 1 ? "" : "es"} use it` };
  if (inScannerCohort)
    return { needed: true, because: "it is in an active Design Scanner cohort" };
  if (hasEvidence)
    return { needed: true, because: "it carries movement evidence that cannot be re-collected" };
  return { needed: false, because: "nothing else references it" };
}

/** What a member is told while a new niche has candidates but no evidence. */
export const GATHERING =
  "Goldie has started watching this niche. Listings appear here once they "
  + "actually move — not because a search returned them.";
