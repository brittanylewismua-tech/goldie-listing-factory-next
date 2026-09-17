import { DELETION_PLAN, CONFIRMATION_PHRASE, RECENT_AUTH_SECONDS, mayDelete }
  from "./deletion-plan.ts";

/**
 * CARRYING OUT A DELETION, AND BEING ABLE TO SAY THAT IT HAPPENED.
 *
 * The plan, the scoped SQL, the confirmation phrase and the recent-auth rule
 * already existed and were tested. What did not exist was execution, because
 * an irreversible bulk delete should not ship on the strength of a code
 * review. It ships now with three things that make it checkable:
 *
 *   an APPEND-ONLY audit row, written BEFORE the first statement and completed
 *   after the last, so a deletion interrupted half way leaves a record saying
 *   exactly that rather than looking like it never began;
 *
 *   IDEMPOTENCE, so a retried request finds the finished record and reports
 *   the same success instead of running the plan twice;
 *
 *   per-step counts, so "your data was deleted" is a statement with evidence
 *   under it rather than a reassurance.
 *
 * The audit row is deliberately NOT part of the plan it audits: deleting the
 * proof of a deletion is how a system ends up unable to answer the only
 * question that matters afterwards.
 */
export const DELETION_AUDIT_TABLE = "account_deletions";

export type DeletionOutcome =
  | { ok: true; alreadyDone: boolean; steps: { table: string; changed: number }[];
      finishedAt: string }
  | { ok: false; because: string };

export type DeletionRunner = {
  /* Each returns the number of rows it changed. */
  run(sql: string, userId: string): Promise<number>;
  begin(userId: string, at: number): Promise<void>;
  finish(userId: string, at: number, steps: { table: string; changed: number }[]): Promise<void>;
  existing(userId: string): Promise<{ finishedAt: string | null } | null>;
};

/**
 * The whole lifecycle, with the storage passed in.
 *
 * Injected rather than imported so this can be exercised against a seeded
 * database and a disposable identity — which is the only honest way to test
 * something that cannot be run twice against a real account.
 */
export async function deleteAccount(
  { userId, phrase, authenticatedAt, now, runner }:
  { userId: string; phrase: string; authenticatedAt: number; now: number;
    runner: DeletionRunner },
): Promise<DeletionOutcome> {
  const allowed = mayDelete({ phrase, authenticatedAt, now });
  if (!allowed.ok) return { ok: false, because: allowed.because };

  /* Already finished? Say so and touch nothing. */
  const prior = await runner.existing(userId);
  if (prior?.finishedAt)
    return { ok: true, alreadyDone: true, steps: [], finishedAt: prior.finishedAt };

  await runner.begin(userId, now);

  const steps: { table: string; changed: number }[] = [];
  for (const step of DELETION_PLAN) {
    /* One statement, one bound parameter: the member's own id. A step that
       throws stops the run with the audit row still open, which is the
       truthful record of a partial deletion. */
    const changed = await runner.run(step.sql, userId);
    steps.push({ table: step.table, changed });
  }

  await runner.finish(userId, now, steps);
  return { ok: true, alreadyDone: false, steps, finishedAt: new Date(now * 1000).toISOString() };
}

export { CONFIRMATION_PHRASE, RECENT_AUTH_SECONDS };
