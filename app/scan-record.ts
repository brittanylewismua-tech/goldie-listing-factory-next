/**
 * ONE MEMBER'S SCAN, AND THE LINE BETWEEN THE TWO KINDS OF ANALYSIS.
 *
 * There are two analyses in this feature and they have different rules:
 *
 *   REFERENCE analysis — somebody else's listing. Construction only. No
 *   wording, ever, anywhere, at any point. It is shared across members.
 *
 *   UPLOAD analysis — the member's own artwork. Same construction fields, PLUS
 *   the visible wording, because the Trademark Checker cannot check a phrase
 *   it is not given. That wording is the member's own words about their own
 *   design; it lives in their private scan record, is never shared, and never
 *   reaches the comparison layer.
 *
 * The comparison function is handed construction fields only. It has no
 * parameter that could carry wording from either side, which is what makes
 * "the scanner cannot tell you what to write" a property of the code rather
 * than a promise in a comment.
 */
export const UPLOAD_ANALYSIS_VERSION = 1;

export type UploadIntelligence = {
  typography: string; textHierarchy: string; composition: string;
  illustration: string; textToArt: number; colorStrategy: string;
  contrast: string; density: string; printCoverage: number;
  thumbnailReadability: string; mechanism: string; wordCount: number;
  /* The member's own design's words. Trademark check only. */
  visibleWording: string;
};

/**
 * Strip the member's wording before anything comparative touches the record.
 *
 * Called on every path into the comparison. A future edit that forgets to call
 * it fails the test that compares the comparison input's keys against the
 * construction schema.
 */
export const constructionOnly = (upload: UploadIntelligence) => {
  const { visibleWording, ...construction } = upload;
  void visibleWording;
  return construction;
};

export const scanKey = (userId: string, artworkHash: string) =>
  `${userId}:${artworkHash}:${UPLOAD_ANALYSIS_VERSION}`;

/** Why a scan did not produce a comparison. Shown to the member as written. */
export type Refusal =
  | { kind: "cohort-too-small"; because: string }
  | { kind: "no-shop-diversity"; because: string }
  | { kind: "no-repeated-movement"; because: string }
  | { kind: "images-unusable"; because: string };

export const THRESHOLD = {
  /*
    AN INTERNAL BETA RULE, NOT A STATISTICAL STANDARD.

    Approved 2026-09-15 against measured distributions across seven niches.
    It is the bar at which a comparison stops being a description of one shop's
    week, not a claim about significance, and it must never be described as
    one. Configurable because the right numbers will change as the evidence
    window grows.
  */
  listings: 12,
  shops: 8,
  repeatedMovement: 5,
  usableImageShare: 0.8,
} as const;

export type CohortShape = {
  listings: number; shops: number; repeatedMovement: number; withUsableImage: number;
};

export function meetsThreshold(
  cohort: CohortShape, threshold = THRESHOLD,
): { ok: true } | { ok: false; refusal: Refusal } {
  const imageShare = cohort.listings
    ? cohort.withUsableImage / cohort.listings : 0;
  if (cohort.listings < threshold.listings)
    return { ok: false, refusal: { kind: "cohort-too-small",
      because: "Nobody has watched this keyword here long enough to compare artwork "
        + "against it yet. That is a gap in our own records and says nothing about what "
        + "you made. Check a listing against the live search above instead - that needs "
        + "nothing recorded in advance." } };
  if (cohort.shops < threshold.shops)
    return { ok: false, refusal: { kind: "no-shop-diversity",
      because: `The movement in this niche comes from only ${cohort.shops} shop`
        + `${cohort.shops === 1 ? "" : "s"}. That describes those shops, not the niche. `
        + `The live check above compares against the whole search instead.` } };
  if (cohort.repeatedMovement < threshold.repeatedMovement)
    return { ok: false, refusal: { kind: "no-repeated-movement",
      because: `Only ${cohort.repeatedMovement} listing`
        + `${cohort.repeatedMovement === 1 ? "" : "s"} here sold more than once. `
        + `Single sales are not yet a pattern worth comparing against.` } };
  if (imageShare < threshold.usableImageShare)
    return { ok: false, refusal: { kind: "images-unusable",
      because: `Too few listings in this niche have a current image available to compare with.` } };
  return { ok: true };
}
