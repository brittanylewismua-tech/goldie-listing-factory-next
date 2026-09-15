/**
 * WHAT HAPPENS AFTER A PAID CALL FAILS.
 *
 * The previous version marked a failure and allowed the next request to
 * retake it immediately. During a provider outage that is not a retry policy,
 * it is a loop: every refresh buys another failure at full price. Failures
 * are the calls most likely to arrive in bursts, so they need the strictest
 * spacing, not the loosest.
 *
 * This module is pure so the production cases can actually be exercised
 * rather than asserted against SQL text.
 */
export const MAX_ATTEMPTS = 4;
/* Spacing between attempts, in seconds. The provider is usually back inside
   the first two; the fourth is there to survive a long incident. */
export const BACKOFF_SECONDS = [30, 300, 1_800];
export const LEASE_SECONDS = 180;
/* A duplicate waits about this long for the running job, then is told to come
   back. Holding the request open for the whole lease would tie up a worker
   for three minutes to avoid a wait the client can do itself. */
export const DUPLICATE_WAIT_MS = 2_000;

export type State = "running" | "ready" | "failed" | "terminal";

export type Row = {
  state: State;
  payload: unknown;
  /* Fencing. A worker may only finish the claim it still owns. */
  generation: number;
  leaseExpires: number;
  attempts: number;
  nextAttemptAt: number;
  lastFailure: string;
  reopenedBy: string;
};

/**
 * Jittered backoff.
 *
 * Without jitter, everything that failed during an outage retries at the same
 * instant the moment it ends, which is how a recovering provider gets knocked
 * over a second time.
 */
export function nextAttemptAt(
  attempts: number, now: number, random: () => number = Math.random,
): number {
  const base = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];
  /* Up to 25% either side, never negative. */
  return now + Math.max(1, Math.round(base * (0.75 + random() * 0.5)));
}

export type Decision =
  | { action: "serve"; payload: unknown }
  | { action: "call"; generation: number; leaseExpires: number; attempt: number }
  | { action: "pending"; because: string }
  | { action: "backoff"; retryAt: number; because: string }
  | { action: "terminal"; because: string };

/**
 * What a request should do, given what is already recorded.
 *
 * NOTHING HERE STARTS A SECOND PROVIDER CALL. Every path that finds work
 * already in flight, waiting out a backoff, or permanently failed returns
 * without spending.
 */
export function decide(row: Row | null, now: number): Decision {
  if (row?.state === "ready") return { action: "serve", payload: row.payload };

  if (row?.state === "terminal")
    return { action: "terminal",
      because: `Analysis failed ${row.attempts} times and has stopped. ${row.lastFailure}`.trim() };

  if (row?.state === "running" && row.leaseExpires > now)
    return { action: "pending", because: "This image is already being analyzed." };

  /* A failure is not eligible again until its backoff has elapsed. */
  if (row?.state === "failed" && row.nextAttemptAt > now)
    return { action: "backoff", retryAt: row.nextAttemptAt,
      because: "A recent attempt failed. Waiting before trying again." };

  const attempt = (row?.attempts ?? 0) + 1;
  if (attempt > MAX_ATTEMPTS)
    return { action: "terminal", because: `Reached the ${MAX_ATTEMPTS}-attempt ceiling.` };

  return {
    action: "call",
    /* A new generation on every claim, including a takeover of an expired
       lease. The old owner's generation is now stale forever. */
    generation: (row?.generation ?? 0) + 1,
    leaseExpires: now + LEASE_SECONDS,
    attempt,
  };
}

/** A worker may only write the claim it still owns. */
export const stillOwns = (row: Row | null, generation: number) =>
  Boolean(row) && row!.generation === generation;

export type Settlement = {
  /* Money: a failed call that burned tokens is still charged. */
  ledger: "settle" | "release";
  /* The member's success allowance is returned whatever happened. */
  refundMemberAllowance: true;
  nextState: State;
};

/**
 * How a failure settles.
 *
 * The two ledgers separate here exactly as they do for the scanner: the
 * member is always made whole, and the money is only released when the
 * provider reported nothing billable.
 */
export function settleFailure(
  { attempts, billed }: { attempts: number; billed: number },
): Settlement {
  return {
    ledger: billed > 0 ? "settle" : "release",
    refundMemberAllowance: true,
    nextState: attempts >= MAX_ATTEMPTS ? "terminal" : "failed",
  };
}

/**
 * Reopening a terminal failure is a deliberate act and is recorded as one.
 *
 * It grants exactly one more attempt. Without that, "retry" on a permanently
 * broken image becomes a button that bills forever.
 */
export function reopen(row: Row, by: string, now: number): Row {
  return {
    ...row,
    state: "failed",
    attempts: Math.max(0, MAX_ATTEMPTS - 1),
    nextAttemptAt: now,
    reopenedBy: by,
  };
}
