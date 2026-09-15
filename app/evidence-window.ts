/**
 * SAY HOW LONG WE HAVE ACTUALLY BEEN WATCHING.
 *
 * The evidence line used to promise sixty days because sixty days was the
 * freshness rule. The detector has been running for about a day. Printing
 * "in the last 60 days" over a corpus that is 29 hours old is the kind of
 * claim that is technically a window and practically a lie.
 *
 * So the window is measured, not declared. It widens on its own as history
 * accumulates and it will say sixty days on the day that is true.
 */
export type Window = {
  earliest: number; latest: number; seconds: number;
  repeatedMovement: number; attributedUnits: number; shops: number;
  withImage: number; withReview: number; listings: number;
};

export function describeWindow(seconds: number): string {
  if (seconds < 3_600) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return `${minutes} minute${minutes === 1 ? "" : "s"} of monitoring`;
  }
  if (seconds < 48 * 3_600) {
    const hours = Math.max(1, Math.round(seconds / 3_600));
    return `${hours} hour${hours === 1 ? "" : "s"} of monitoring`;
  }
  const days = Math.round(seconds / 86_400);
  return `${days} days of monitoring`;
}

export const evidenceLine = (window: Window) =>
  `Compared with ${window.listings} listing${window.listings === 1 ? "" : "s"} showing `
  + `verified momentum across ${window.shops} shop${window.shops === 1 ? "" : "s"} during `
  + `${describeWindow(window.seconds)}.`;
