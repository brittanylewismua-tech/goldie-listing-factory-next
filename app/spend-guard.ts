import { env } from "cloudflare:workers";
import { workload, type Workload } from "@/app/paid-workloads";

/**
 * RESERVE BEFORE SPENDING, RECONCILE AFTER.
 *
 * A ceiling checked by summing what has already been billed is not a ceiling.
 * Ten requests arriving in the same second all read the same total, all see
 * room, and all proceed — and the ceiling is discovered to have been crossed
 * only once every one of them has been paid for.
 *
 * So the estimated cost is written down BEFORE the provider is called, and
 * counts against the ceiling from that moment. When the call returns, the
 * reservation is replaced by what was actually billed. A call that never
 * happened releases its reservation instead of quietly holding budget.
 */
export async function ensureSpendTables() {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS spend_reservations (
      id TEXT PRIMARY KEY,
      workload TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT '',
      reserved_cost REAL NOT NULL DEFAULT 0,
      actual_cost REAL,
      state TEXT NOT NULL DEFAULT 'held',
      consumes_allowance INTEGER NOT NULL DEFAULT 0,
      fingerprint TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      settled_at TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS spend_overrides (
      workload TEXT PRIMARY KEY,
      daily_ceiling REAL,
      member_daily_limit INTEGER,
      paused INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  ]);
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS spend_reservations_window
       ON spend_reservations (workload, created_at)`).run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS spend_reservations_member
       ON spend_reservations (user_id, workload, created_at)`).run();
}

/** Owner configuration wins over the registry default. */
async function limitsFor(entry: Workload) {
  const db = (env as unknown as { DB: D1Database }).DB;
  const override = await db.prepare(
    `SELECT daily_ceiling, member_daily_limit, paused FROM spend_overrides WHERE workload = ?`)
    .bind(entry.key)
    .first<{ daily_ceiling: number | null; member_daily_limit: number | null; paused: number }>();
  return {
    ceiling: override?.daily_ceiling ?? entry.globalDailyCeiling,
    memberLimit: override?.member_daily_limit ?? entry.memberDailyLimit,
    paused: Boolean(override?.paused),
  };
}

/* Held reservations plus settled actuals. Both count: budget that is out on
   loan is budget that is gone. */
async function spentToday(workloadKey: string) {
  const db = (env as unknown as { DB: D1Database }).DB;
  const row = await db.prepare(
    `SELECT COALESCE(SUM(COALESCE(actual_cost, reserved_cost)), 0) AS spend
       FROM spend_reservations
      WHERE workload = ? AND state IN ('held', 'settled', 'failed-billed')
        AND created_at >= datetime('now', '-1 day')`)
    .bind(workloadKey).first<{ spend: number }>();
  return row?.spend ?? 0;
}

/*
  How many times the provider was reached, whatever the outcome. This is the
  cap that protects an unmeasured workload: reserving zero dollars would let
  the dollar guard treat it as free and pass an unlimited number.
*/
async function requestsToday(workloadKey: string) {
  const db = (env as unknown as { DB: D1Database }).DB;
  const row = await db.prepare(
    `SELECT COUNT(*) AS requests FROM spend_reservations
      WHERE workload = ? AND state IN ('held', 'settled', 'failed-billed')
        AND created_at >= datetime('now', '-1 day')`)
    .bind(workloadKey).first<{ requests: number }>();
  return row?.requests ?? 0;
}

/**
 * A member's consumed scans in the rolling window.
 *
 * Only a successful new analysis counts. A provider failure, an invalid
 * response, a cached result and a reopened result all leave the allowance
 * untouched — a member must never lose a scan to our outage.
 */
export async function memberUsage(userId: string, workloadKey: string) {
  await ensureSpendTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const rows = await db.prepare(
    `SELECT created_at FROM spend_reservations
      WHERE user_id = ? AND workload = ? AND consumes_allowance = 1 AND state = 'settled'
        AND created_at >= datetime('now', '-1 day')
      ORDER BY created_at ASC`)
    .bind(userId, workloadKey).all<{ created_at: string }>();
  const used = (rows.results ?? []).length;
  /*
    Attempts count every time the provider was reached, successful or not.
    Successes are refunded on failure; attempts never are, because the
    attempt is exactly what cost money.
  */
  const attemptRow = await db.prepare(
    `SELECT COUNT(*) AS attempts FROM spend_reservations
      WHERE user_id = ? AND workload = ?
        AND state IN ('settled', 'failed-billed')
        AND created_at >= datetime('now', '-1 day')`)
    .bind(userId, workloadKey).first<{ attempts: number }>();
  const attempts = attemptRow?.attempts ?? 0;
  const entry = workload(workloadKey);
  const limits = entry ? await limitsFor(entry) : { memberLimit: null as number | null };
  const limit = limits.memberLimit;
  const oldest = (rows.results ?? [])[0]?.created_at ?? null;
  return {
    used,
    attempts,
    attemptLimit: entry?.memberDailyAttempts ?? null,
    attemptsRemaining: entry?.memberDailyAttempts == null
      ? null : Math.max(0, entry.memberDailyAttempts - attempts),
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    /* When the oldest consumed scan ages out, one comes back. */
    oldestLeavesWindowAt: oldest ? new Date(new Date(`${oldest}Z`).getTime() + 86_400_000).toISOString() : null,
  };
}

export type Reservation =
  | { allowed: true; id: string; reservedCost: number }
  | { allowed: false;
      reason: "paused" | "global-ceiling" | "global-requests" | "member-limit"
        | "member-attempts" | "unregistered";
      message: string };

/**
 * THE ONLY DOOR TO A PAID CALL.
 *
 * Checked before the upload is sent anywhere and before the provider is
 * touched, so a refused scan costs nothing and transfers nothing.
 */
export async function reserveSpend(
  { workloadKey, userId, consumesAllowance = true, fingerprint = "" }:
  { workloadKey: string; userId: string; consumesAllowance?: boolean; fingerprint?: string },
): Promise<Reservation> {
  const entry = workload(workloadKey);
  /* An undeclared workload cannot be priced or capped, so it cannot run. */
  if (!entry) return { allowed: false, reason: "unregistered",
    message: `${workloadKey} is not in the paid-workload registry.` };

  await ensureSpendTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const limits = await limitsFor(entry);
  if (limits.paused)
    return { allowed: false, reason: "paused", message: capacityMessage(entry) };

  /*
    Two member gates, read from one usage query: successful actions, and
    provider attempts. The attempt gate applies even to a call that will not
    consume a success, because an attempt is what costs money.
  */
  if (entry.memberDailyLimit !== null || entry.memberDailyAttempts !== null) {
    const usage = await memberUsage(userId, workloadKey);
    if (consumesAllowance && usage.remaining !== null && usage.remaining <= 0)
      return { allowed: false, reason: "member-limit",
        message: `You have used all ${usage.limit} scans for today. `
          + `One becomes available again at ${usage.oldestLeavesWindowAt ?? "shortly"}. `
          + `Your saved results stay open and reopening them is free.` };
    if (usage.attemptsRemaining !== null && usage.attemptsRemaining <= 0)
      return { allowed: false, reason: "member-attempts",
        message: `Today's analysis attempts are used up. This can happen when `
          + `analyses fail repeatedly. Your saved results stay open, and the `
          + `limit resets over the next 24 hours.` };
  }

  /*
    THE DOLLAR CEILING WINS WHEN THE TWO DISAGREE.
    A request allowance is a proxy for cost; the cost is the thing being
    capped, so it is checked last and it is decisive.
  */
  if (entry.globalDailyRequests !== null
      && await requestsToday(workloadKey) + 1 > entry.globalDailyRequests)
    return { allowed: false, reason: "global-requests", message: capacityMessage(entry) };

  if (await spentToday(workloadKey) + entry.unitCost > limits.ceiling)
    return { allowed: false, reason: "global-ceiling", message: capacityMessage(entry) };

  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO spend_reservations
       (id, workload, user_id, reserved_cost, state, consumes_allowance, fingerprint)
     VALUES (?,?,?,?,'held',?,?)`)
    .bind(id, workloadKey, userId, entry.unitCost, consumesAllowance ? 1 : 0, fingerprint)
    .run();
  return { allowed: true, id, reservedCost: entry.unitCost };
}

/** The call succeeded. Replace the estimate with what was billed. */
export async function settleSpend(id: string, actualCost: number) {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(
    `UPDATE spend_reservations SET actual_cost = ?, state = 'settled',
            settled_at = CURRENT_TIMESTAMP
      WHERE id = ? AND state = 'held'`)
    .bind(actualCost, id).run();
}

/**
 * THE CALL FAILED, BUT THE TOKENS WERE STILL BURNED.
 *
 * A model that returns unparseable JSON has read the image and written a
 * response, and the provider bills for both. Treating that as "released"
 * would hand the member their allowance back — correct — while also
 * pretending the money was never spent, which is not. A member hitting a
 * broken prompt in a loop would then run up a real bill against a ceiling
 * that never moved.
 *
 * So the two ledgers part company on failure:
 *   the member is refunded, always;
 *   the dollar ledger is settled whenever the provider reported billable
 *   usage, and released only when nothing was billed.
 *
 * Either way the attempt is recorded, because the attempt limit is what
 * stops a repeated failure from billing forever.
 */
export async function failSpend(id: string, { billed = 0 }: { billed?: number } = {}) {
  const db = (env as unknown as { DB: D1Database }).DB;
  /* Billable usage on a failed call is real money and stays on the ledger. */
  const state = billed > 0 ? "failed-billed" : "released";
  await db.prepare(
    `UPDATE spend_reservations SET state = ?, actual_cost = ?,
            consumes_allowance = 0, settled_at = CURRENT_TIMESTAMP
      WHERE id = ? AND state = 'held'`)
    .bind(state, billed, id).run();
}

/** The request never reached the provider. Nothing was billed. */
export async function releaseSpend(id: string) {
  await failSpend(id, { billed: 0 });
}

/*
  What a member is told when the system, not their own use, is the limit.
  It says capacity, because that is true and because the alternative invites
  them to try again immediately.
*/
const capacityMessage = (entry: Workload) => entry.customerFacing
  ? "Analysis capacity is temporarily full. Your design is saved — try again a little later."
  : "Paused for capacity.";

/**
 * Background work yields to customer work.
 *
 * Reference ingestion pauses itself while the customer scan budget is near
 * its ceiling, rather than racing members for the same dollars.
 */
export async function referenceIngestionMayRun(): Promise<{ allowed: boolean; because: string }> {
  const scanner = workload("designScannerVision");
  const reference = workload("referenceIngestion");
  if (!scanner || !reference) return { allowed: false, because: "registry incomplete" };
  const scannerLimits = await limitsFor(scanner);
  const headroom = scannerLimits.ceiling - await spentToday("designScannerVision");
  if (headroom < scannerLimits.ceiling * 0.2)
    return { allowed: false, because: "Customer scan budget needs the capacity." };
  const referenceLimits = await limitsFor(reference);
  if (await spentToday("referenceIngestion") + reference.unitCost > referenceLimits.ceiling)
    return { allowed: false, because: "Reference ingestion has reached its own daily ceiling." };
  return { allowed: true, because: "" };
}

/** Owner view: what every declared workload has spent in the last day. */
export async function spendReport() {
  await ensureSpendTables();
  const report = [];
  for (const entry of (await import("@/app/paid-workloads")).PAID_WORKLOADS) {
    const limits = await limitsFor(entry);
    const spend = await spentToday(entry.key);
    report.push({
      workload: entry.key, customerFacing: entry.customerFacing,
      provider: entry.provider, model: entry.model,
      unitCost: entry.unitCost, costBasis: entry.costBasis,
      spentLast24h: Number(spend.toFixed(4)),
      ceiling: limits.ceiling, limitStatus: entry.limitStatus,
      memberDailyLimit: limits.memberLimit, paused: limits.paused,
      headroom: Number((limits.ceiling - spend).toFixed(4)),
    });
  }
  return report;
}
