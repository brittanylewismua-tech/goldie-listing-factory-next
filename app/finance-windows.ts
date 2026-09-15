/**
 * WALKING THE LEDGER IN WINDOWS ETSY WILL ACCEPT.
 *
 * Measured: a 90-day request answers 400 — "Time window between min_created
 * and max_created must be no more than 2678400 seconds (31 days)." So any
 * period longer than a month is a sequence of windows, and the sequence has
 * to be complete or the month built from it is wrong in a way nothing later
 * will reveal.
 */
export const MAX_WINDOW_SECONDS = 31 * 86_400;
export const WINDOW_SECONDS = 30 * 86_400;

/*
  How far back an incremental read reaches behind the high-water mark.

  Refunds, fee reversals and adjusted entries are written against their
  ORIGINAL date, days or weeks after that date has passed. Reading only
  forward from the high-water mark would miss every one of them, and the
  month would look settled while still moving.
*/
export const OVERLAP_SECONDS = 14 * 86_400;

export type Window = { from: number; to: number };

/** Non-overlapping windows covering [from, to], oldest first. */
export function windowsFor(from: number, to: number, size = WINDOW_SECONDS): Window[] {
  if (!(to > from)) return [];
  const windows: Window[] = [];
  let cursor = Math.floor(from);
  while (cursor < to) {
    const end = Math.min(to, cursor + size);
    windows.push({ from: cursor, to: end });
    /* +1 so consecutive windows cannot both contain the boundary second and
       ingest the same entry twice. */
    cursor = end + 1;
  }
  return windows;
}

/** Where an incremental read should start, given what has been seen. */
export function incrementalFrom(highWater: number, now: number, earliest: number) {
  if (!highWater) return earliest;
  /* Never start in the future, and never reach behind the shop's first day. */
  return Math.max(earliest, Math.min(now, highWater - OVERLAP_SECONDS));
}

export const windowTooLarge = (window: Window) =>
  window.to - window.from > MAX_WINDOW_SECONDS;

/** Windows that failed, so a resumed run repeats only those. */
export type WindowState = { from: number; to: number; state: "complete" | "failed" | "pending" };

export function outstanding(states: WindowState[]) {
  return states.filter(window => window.state !== "complete");
}
