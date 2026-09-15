/**
 * LISTINGS THAT HAVE ACTUALLY MOVED.
 *
 * The temptation is to compare a member's design against whatever looks
 * popular. Favourites are free to give and cost nothing to fake; a listing
 * with a thousand of them may never have sold. A shop's sales moving proves
 * the shop sold something, not which listing did. And a single review proves
 * somebody bought once, at some point, possibly months ago.
 *
 * So a listing enters the cohort only through evidence that ties movement to
 * THAT listing, and the exact reason is kept so any comparison can be
 * defended later. Nothing here is called a bestseller: Goldie cannot see
 * Etsy's sales ranks, and the honest phrase is "showing verified momentum".
 */
export type Qualification =
  | "corroborated-interval-movement"
  | "attributed-units"
  | "sold-out-corroborated"
  | "movement-plus-review";

export type Candidate = {
  listingId: number;
  shopId: number;
  /* Intervals in which this listing's quantity fell while the shop's own
     sales moved the same way. */
  corroboratedIntervals: number;
  attributedUnits: number;
  attributionCapViolated: boolean;
  soldOutCorroborated: boolean;
  reviewsLinkedRecently: number;
  lastMovementAt: number;
  hasPrimaryImage: boolean;
};

export const EVIDENCE_FRESH_DAYS = 60;
/* One shop must not decide what a whole niche looks like. */
export const SHOP_SHARE_CAP = 0.25;
export const MIN_COHORT = 12;

export type Qualified = {
  listingId: number;
  shopId: number;
  reason: Qualification;
  evidenceAt: number;
  repeated: boolean;
};

export type Rejection = { listingId: number; because: string };

/**
 * Decide one listing, and say why.
 *
 * The attribution cap matters: a bulk edit or a restock can look exactly like
 * twenty sales, and a listing whose attribution was capped is a listing whose
 * movement we already doubted.
 */
export function qualify(
  candidate: Candidate, now: number,
): { ok: true; reason: Qualification; repeated: boolean } | { ok: false; because: string } {
  if (!candidate.hasPrimaryImage) return { ok: false, because: "no usable primary image" };
  if (candidate.attributionCapViolated)
    return { ok: false, because: "movement exceeded the attribution cap" };

  const age = now - candidate.lastMovementAt;
  if (!candidate.lastMovementAt)
    return { ok: false, because: "no movement evidence" };
  if (age > EVIDENCE_FRESH_DAYS * 86_400)
    return { ok: false, because: `evidence is ${Math.floor(age / 86_400)} days old` };

  if (candidate.corroboratedIntervals >= 2)
    return { ok: true, reason: "corroborated-interval-movement", repeated: true };
  if (candidate.attributedUnits >= 2)
    return { ok: true, reason: "attributed-units", repeated: candidate.attributedUnits >= 4 };
  if (candidate.soldOutCorroborated)
    return { ok: true, reason: "sold-out-corroborated", repeated: false };
  /*
    A review on its own proves nothing about now, so it only qualifies a
    listing that ALREADY has a movement signal to support.
  */
  if (candidate.reviewsLinkedRecently > 0 && candidate.corroboratedIntervals >= 1)
    return { ok: true, reason: "movement-plus-review", repeated: false };

  return { ok: false, because: "no listing-level movement evidence" };
}

/**
 * Build the cohort, and stop any one shop from dominating it.
 *
 * A niche whose references are three quarters one seller is a description of
 * that seller, not of the niche.
 */
export function buildCohort(
  candidates: Candidate[], now: number,
  { cap = SHOP_SHARE_CAP, minimum = MIN_COHORT }: { cap?: number; minimum?: number } = {},
): {
  cohort: Qualified[]; rejected: Rejection[];
  shops: number; dominatedBy: number | null; enough: boolean;
  cappedOut: number;
} {
  const passed: Qualified[] = [];
  const rejected: Rejection[] = [];
  for (const candidate of candidates) {
    const verdict = qualify(candidate, now);
    if (!verdict.ok) { rejected.push({ listingId: candidate.listingId, because: verdict.because }); continue; }
    passed.push({ listingId: candidate.listingId, shopId: candidate.shopId,
      reason: verdict.reason, evidenceAt: candidate.lastMovementAt, repeated: verdict.repeated });
  }

  /* Strongest evidence first, so a cap trims the weakest rather than the newest. */
  const rank = (row: Qualified) =>
    (row.repeated ? 2 : 0) + (row.reason === "corroborated-interval-movement" ? 1 : 0);
  passed.sort((a, b) => rank(b) - rank(a) || b.evidenceAt - a.evidenceAt);

  /*
    The cap has to hold against the cohort that actually results, not against
    the candidate pool. Allowing a quarter of 40 candidates and then ending up
    with 20 listings hands one shop half the evidence. The allowance and the
    cohort size depend on each other, so take the largest allowance that is
    still within the cap once its own cohort is counted.
  */
  const perShopTotals = new Map<number, number>();
  for (const row of passed) perShopTotals.set(row.shopId, (perShopTotals.get(row.shopId) ?? 0) + 1);
  const sizeAt = (allowance: number) =>
    [...perShopTotals.values()].reduce((total, held) => total + Math.min(held, allowance), 0);

  let allowedPerShop = 1;
  for (let allowance = 1; allowance <= passed.length; allowance += 1) {
    if (allowance > sizeAt(allowance) * cap) break;
    allowedPerShop = allowance;
  }

  const perShop = new Map<number, number>();
  const cohort: Qualified[] = [];
  let cappedOut = 0;
  for (const row of passed) {
    const held = perShop.get(row.shopId) ?? 0;
    if (held >= allowedPerShop) { cappedOut += 1; continue; }
    perShop.set(row.shopId, held + 1);
    cohort.push(row);
  }

  const shops = perShop.size;
  const biggest = [...perShop.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    cohort, rejected, shops,
    dominatedBy: biggest && cohort.length && biggest[1] / cohort.length > cap ? biggest[0] : null,
    enough: cohort.length >= minimum,
    cappedOut,
  };
}

/** What a member is told about the evidence behind their result. */
export const evidenceLine = (cohort: Qualified[], shops: number) =>
  `Compared with ${cohort.length} listing${cohort.length === 1 ? "" : "s"} showing `
  + `verified momentum across ${shops} shop${shops === 1 ? "" : "s"} in the last `
  + `${EVIDENCE_FRESH_DAYS} days.`;

export const NOT_ENOUGH_EVIDENCE =
  "There isn't enough verified evidence in this niche yet to compare against.";
