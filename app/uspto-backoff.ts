/**
 * USPTO SAID 429 FOR TWO DAYS AND THE STATUS PAGE SAID "88 WAITING".
 *
 * The historical backfile stopped advancing on 2026-09-14. Nothing was
 * broken: USPTO was refusing the bulk downloads with 429, the tick recorded
 * the failure, put the file straight back in the queue, and tried again
 * twenty minutes later — every twenty minutes, for two days, against an API
 * that was rate limiting precisely because it was being asked too often.
 *
 * Two separate faults, and the second is the worse one:
 *
 *   1. A transient failure went back in the queue with no delay, so the
 *      retry schedule was "as fast as the cron fires".
 *   2. The register status reported the file as `waiting`, which is true and
 *      useless. For two days the honest answer was "blocked by USPTO, next
 *      attempt at 06:20" and nothing anywhere could say it.
 *
 * Rate limiting is not a bad minute. It is the other side asking for time,
 * so it gets time, escalating while it keeps saying no and reset the moment
 * a file succeeds.
 */

/** A rate-limited file waits at least this long before being asked for again. */
export const FIRST_BACKOFF_MINUTES = 30;
/** However many times it is refused, it is retried at least this often. */
export const MAX_BACKOFF_MINUTES = 6 * 60;

/** Whether a failure means "ask again later" rather than "this file is bad". */
export function isRateLimit(note: string) {
  return /answered (429|503)/.test(note);
}

/**
 * How long to wait after `strikes` consecutive refusals.
 *
 * Doubling, capped. The cap matters more than the curve: a daily quota that
 * resets overnight must not push the next attempt past the reset, or the
 * backfile loses a whole day to politeness.
 */
export function backoffMinutes(strikes: number) {
  const doubled = FIRST_BACKOFF_MINUTES * 2 ** Math.max(0, strikes - 1);
  return Math.min(MAX_BACKOFF_MINUTES, doubled);
}

export function retryAfter(strikes: number, now = Date.now()) {
  return new Date(now + backoffMinutes(strikes) * 60_000).toISOString();
}

/**
 * What to tell a person looking at a queue that is not moving.
 *
 * "Waiting" was the string that hid this for two days, so a file held back by
 * the other side never says only that.
 */
export function blockedExplanation(note: string, retryAfterIso: string) {
  if (!isRateLimit(note)) return "";
  return `USPTO is rate limiting bulk downloads. Next attempt ${retryAfterIso}.`;
}
