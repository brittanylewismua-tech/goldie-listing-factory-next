/**
 * THE LEASE RULES, WITH NO RUNTIME ATTACHED.
 *
 * `work-lease.ts` imports `cloudflare:workers`, which the node test runner
 * cannot resolve — the wall `observation-gate.ts` hit first. The rules that
 * need asserting are arithmetic on two timestamps, so they live here where a
 * test can reach them without a worker.
 */
export const LEASE_TTL_SECONDS = 120;
/** How long a waiter watches for the winner's result before doing it itself. */
export const LEASE_WAIT_MS = 15_000;
export const LEASE_POLL_MS = 400;

/**
 * Whether a lease that already exists still holds.
 *
 * A lease is not a promise — a winner can crash — so leases expire. The cost
 * of a stale lease is one duplicate call in a rare case; the cost of a
 * permanent one is work that can never be done again.
 */
export function leaseHolds(claimedAtSeconds: number, nowSeconds: number) {
  return nowSeconds - claimedAtSeconds < LEASE_TTL_SECONDS;
}
