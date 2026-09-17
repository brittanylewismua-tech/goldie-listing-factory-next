/**
 * WHAT A SWEEP ACTUALLY PROVED.
 *
 * Its own module, and free of the DOM and the Workers runtime, so the rule
 * that decides whether a run may be called mobile verification is testable
 * directly rather than inferred from a page.
 *
 * An iframe 375 CSS pixels wide gives a page a real narrow viewport and makes
 * its width media queries fire. It does NOT make the browser report a touch
 * device, and this product's mobile rules need BOTH halves:
 *
 *   @media (max-width: 820px) and (pointer: coarse)
 *
 * is what hides the Listing Factory shell behind the desktop gate. Satisfying
 * the width alone proves narrow-width layout and nothing about touch, so a
 * run that never saw a coarse pointer says exactly that.
 */
export const PHONE_WIDTHS = [375, 390, 430];

/* The product's own rule, quoted rather than approximated. A test asserts
   this string still matches the stylesheet that enforces it. */
export const MOBILE_GATE = "(max-width: 820px) and (pointer: coarse)";

export type SweepReading = {
  state: string;
  /* What the page was actually given, not what was asked for. */
  askedWidth: number;
  innerWidth: number | null;
  clientWidth: number | null;
  coarsePointer: boolean | null;
  mobileGateMatches: boolean | null;
  horizontalOverflow: number | null;
  undersizedTargets: string[];
  problems: string[];
};

/*
  WHAT THE RUN ACTUALLY RAN UNDER.

  Reported beside every result, so the reading can never be taken for more
  than it is. If the pointer was never coarse, the product's mobile gate
  never matched either, and what was verified is narrow layout — not mobile.
*/
export type SweepConditions = {
  widths: number[];
  viewports: number[];
  clientWidths: number[];
  coarsePointer: boolean;
  mobileGateMatched: boolean;
  worstOverflow: number;
  undersized: number;
  label: "mobile verified" | "narrow-layout verified";
};

export function conditionsOf(readings: SweepReading[]): SweepConditions {
  const coarse = readings.length > 0 && readings.every(one => one.coarsePointer === true);
  const gated = readings.some(one => one.mobileGateMatches === true);
  return {
    widths: [...new Set(readings.map(one => one.askedWidth))].sort((a, b) => a - b),
    viewports: [...new Set(readings.map(one => one.innerWidth ?? -1))].sort((a, b) => a - b),
    clientWidths: [...new Set(readings.map(one => one.clientWidth ?? -1))].sort((a, b) => a - b),
    coarsePointer: coarse,
    mobileGateMatched: gated,
    worstOverflow: Math.max(0, ...readings.map(one => one.horizontalOverflow ?? 0)),
    undersized: readings.reduce((sum, one) => sum + one.undersizedTargets.length, 0),
    /* Both halves of the product's own rule, or it is not mobile verification. */
    label: coarse ? "mobile verified" : "narrow-layout verified",
  };
}
