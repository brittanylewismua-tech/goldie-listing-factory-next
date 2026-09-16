/**
 * THE CLAIM RULE, WITH NO RUNTIME ATTACHED.
 *
 * `design-claim.ts` imports `cloudflare:workers`, which the node test runner
 * cannot resolve — the same wall `observation-gate.ts` hit. The rule that
 * actually needs asserting is arithmetic on two timestamps, so it lives here
 * where a test can reach it without a worker.
 */
export const CLAIM_TTL_SECONDS = 120;
/** How long a loser waits for the winner's row before doing the work itself. */
export const CLAIM_WAIT_MS = 15_000;
export const CLAIM_POLL_MS = 500;

/**
 * Whether a claim that already exists still holds.
 *
 * A claim is not a promise — a winner can crash — so claims expire. The cost
 * of a stale claim is one duplicate call in a rare case; the cost of a
 * permanent claim is an artwork that can never be analyzed again.
 */
export function claimHolds(claimedAtSeconds: number, nowSeconds: number) {
  return nowSeconds - claimedAtSeconds < CLAIM_TTL_SECONDS;
}
