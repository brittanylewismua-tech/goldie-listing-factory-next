/**
 * THE FIVE THINGS A SAVED NICHE'S BRIEF CAN BE.
 *
 * Kept apart deliberately. Collapsing them is how "nothing has happened yet"
 * and "we tried and it broke" end up wearing the same words — which is the
 * bug this whole milestone exists to fix.
 */
export type NicheState =
  /** A brief exists and is inside its refresh window. */
  | "fresh"
  /** Needs a rebuild now. */
  | "due"
  /** Claimed by a run that has not finished. */
  | "processing"
  /** Rebuilt successfully, but the niche has no corroborated movement to
      report yet. Not a failure, and it must never be shown as one. */
  | "unavailable"
  /** Consecutive rebuild errors; backing off rather than recycling forever. */
  | "failing";

export const NICHE_STATES: NicheState[] =
  ["fresh", "due", "processing", "unavailable", "failing"];
