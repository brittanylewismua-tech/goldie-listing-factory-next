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

/**
 * WINDOW BOUNDARIES SIT ON A FIXED GRID.
 *
 * The first version derived boundaries from wherever the incremental read
 * happened to start. Because that start moves - it reaches fourteen days
 * behind a high-water mark that advances every run - every run produced a
 * DIFFERENT set of boundaries, inserted them all, and left the previous set
 * outstanding forever. Measured: outstanding windows went 43 -> 74 across two
 * runs while nothing failed.
 *
 * Anchoring to a fixed epoch makes planning idempotent: the same period always
 * produces the same windows, so a window completed once stays completed.
 */
export function snapToGrid(at: number, anchor: number, size = WINDOW_SECONDS) {
  if (at <= anchor) return anchor;
  return anchor + Math.floor((at - anchor) / size) * size;
}

/** Non-overlapping windows covering [from, to], oldest first, grid-aligned. */
export function windowsFor(
  from: number, to: number, size = WINDOW_SECONDS, anchor = from,
): Window[] {
  if (!(to > from)) return [];
  const windows: Window[] = [];
  /*
    Boundaries come from the grid itself rather than from walking forward and
    adding a second each time. Walking drifted the alignment by one second per
    window, so a re-plan produced boundaries the first plan never had.

    Each window ends one second before the next begins, so consecutive windows
    cannot both contain the same entry.
  */
  for (let start = snapToGrid(from, anchor, size); start < to; start += size)
    windows.push({ from: start, to: Math.min(to, start + size - 1) });
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
