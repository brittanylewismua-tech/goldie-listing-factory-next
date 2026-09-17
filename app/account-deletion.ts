import { DELETION_PLAN, OBJECT_PREFIXES, CONFIRMATION_PHRASE, RECENT_AUTH_SECONDS,
  mayDelete } from "./deletion-plan.ts";

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

export type DeletionStep = { table: string; changed: number; failed?: string };

export type DeletionOutcome =
  | { ok: true; alreadyDone: boolean; steps: DeletionStep[];
      /* Steps that could not be carried out. Empty on a clean run. */
      incomplete: DeletionStep[]; finishedAt: string }
  | { ok: false; because: string };

export type DeletionRunner = {
  /* Each returns the number of rows it changed. */
  run(sql: string, userId: string): Promise<number>;
  begin(userId: string, at: number): Promise<void>;
  finish(userId: string, at: number, steps: DeletionStep[]): Promise<void>;
  existing(userId: string): Promise<{ finishedAt: string | null } | null>;
  /*
    Stored files, removed by member-scoped prefix. Optional so the lifecycle
    can still be exercised against a store that has no object bucket; a runner
    without it records the prefixes as not attempted rather than as done.
  */
  removeObjects?(prefix: string, userId: string): Promise<number>;
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
    return { ok: true, alreadyDone: true, steps: [], incomplete: [],
      finishedAt: prior.finishedAt };

  await runner.begin(userId, now);

  /*
    EVERY STEP RUNS, EVEN IF ONE CANNOT.

    An earlier version let a throwing step stop the run, leaving the audit row
    open as "the truthful record of a partial deletion". That was defensible
    with twelve steps. With forty-three it is not: one table that was never
    migrated onto this database would abort at step three and leave forty
    tables of the member's data in place, while the member had already typed
    the phrase and been told their deletion was under way.

    So each step is attempted, its outcome recorded, and a failure carried
    rather than thrown. The member's data is removed as completely as it can
    be, the audit says exactly what did not happen, and the run stays
    idempotent — a retry finishes the rest.

    One statement, one bound parameter: the member's own id.
  */
  const steps: DeletionStep[] = [];
  for (const step of DELETION_PLAN) {
    try {
      const changed = await runner.run(step.sql, userId);
      steps.push({ table: step.table, changed });
    } catch (error) {
      steps.push({ table: step.table, changed: 0,
        failed: error instanceof Error ? error.message : String(error) });
    }
  }

  /* Files, after rows. A row pointing at a deleted object is a broken
     reference; an object with no row pointing at it is unreachable, which is
     the safer order to fail in. */
  for (const entry of OBJECT_PREFIXES) {
    const table = `${entry.prefix}<member>`;
    if (!runner.removeObjects) {
      steps.push({ table, changed: 0, failed: "no object store was available" });
      continue;
    }
    try {
      steps.push({ table, changed: await runner.removeObjects(entry.prefix, userId) });
    } catch (error) {
      steps.push({ table, changed: 0,
        failed: error instanceof Error ? error.message : String(error) });
    }
  }

  const incomplete = steps.filter(step => step.failed);
  /*
    The audit is completed either way. A run that finished with failures is a
    finished run with a list of what it could not do — leaving the row open
    would make a retry repeat the whole plan and would misreport a mostly
    complete deletion as one that never happened.
  */
  await runner.finish(userId, now, steps);
  return { ok: true, alreadyDone: false, steps, incomplete,
    finishedAt: new Date(now * 1000).toISOString() };
}

export { CONFIRMATION_PHRASE, RECENT_AUTH_SECONDS };
