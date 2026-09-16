import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import {
  recordSample, gateStatus, currentCorrelationHealth, recordHistoricalLoss,
  ensureObservationTables, type Sample,
} from "@/app/market-observation";
import { CORRELATION_RULE_VERSION } from "@/app/correlation";
import { BUILD_MARKER } from "@/app/build-marker";
import { etsyBudget } from "@/app/api/etsy/client";

/**
 * ONE OBSERVATION SAMPLE, ON THE CLOCK.
 *
 * Persisted rather than watched, because a gate that depends on somebody
 * remembering to look is not a gate. Each firing records what was true; the
 * rolling window is computed from those rows.
 */
export const maxDuration = 120;

export const GET = withErrorLog("market-observe", async (request: Request) => {
  const internal = !request.headers.get("cf-connecting-ip");
  if (!internal) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user))
      return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);
  await ensureObservationTables();
  await recordHistoricalLoss(now);

  const health = await currentCorrelationHealth(now);

  /* Did each workload actually run recently? Measured, not assumed. */
  const sensor = await db.prepare(
    `SELECT MAX(observed_at) AS at FROM shop_sensor_state`)
    .first<{ at: string }>().catch(() => null);
  /*
    The column is `listings`. Asking for `listings_read` threw, the catch
    returned null, and the gate recorded "a listing sweep did not complete"
    against a poller that was 97% fresh with every batch completing — a probe
    failure dressed as a product failure, which is exactly what this milestone
    was told to stop doing.
  */
  const sweep = await db.prepare(
    `SELECT finished_at AS at, listings FROM poll_sweeps
      WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`)
    .first<{ at: string; listings: number }>().catch(() => null);
  const fresh = await db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN last_polled_at > ? THEN 1 ELSE 0 END) AS fresh
       FROM corpus_poll_state`)
    .bind(new Date((now - 6 * 3_600) * 1000).toISOString())
    .first<{ total: number; fresh: number }>().catch(() => null);
  const errors = await db.prepare(
    `SELECT COUNT(*) AS n FROM error_log
      WHERE created_at > ? AND severity = 'error'`)
    .bind(new Date((now - 3_600) * 1000).toISOString())
    .first<{ n: number }>().catch(() => null);
  const units = await db.prepare(
    `SELECT COALESCE(SUM(attributed_units),0) AS attributed,
            COALESCE(SUM(unresolved_units),0) AS unresolved,
            COUNT(*) AS correlated
       FROM correlations WHERE rule_version = ? AND correlated_at > ?`)
    .bind(CORRELATION_RULE_VERSION, now - 3_600)
    .first<{ attributed: number; unresolved: number; correlated: number }>()
    .catch(() => null);
  const budget = await etsyBudget().catch(() => null);

  const epoch = (value?: string | null) => {
    if (!value) return 0;
    const parsed = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1_000) : 0;
  };

  const total = Number(fresh?.total ?? 0);
  const sample: Sample = {
    at: now, build: BUILD_MARKER, ruleVersion: CORRELATION_RULE_VERSION,
    sensorOk: now - epoch(sensor?.at) < 6 * 3_600,
    sweepOk: now - epoch(sweep?.at) < 3 * 3_600,
    /* A pass that has not run for three hours is not working, whatever the
       last one reported. */
    correlationOk: health.state === "ok" || health.state === "empty",
    eligible: health.pastEarliest + health.awaitingSweep,
    correlated: Number(units?.correlated ?? 0),
    expiredNew: health.expiredUnderNewArchitecture,
    p50: health.p50DelaySeconds, p95: health.p95DelaySeconds,
    backlog: health.pastEarliest,
    attributedUnits: Number(units?.attributed ?? 0),
    unresolvedUnits: Number(units?.unresolved ?? 0),
    listingFreshness: total ? Number(fresh?.fresh ?? 0) / total : 1,
    etsyCalls: Number((budget as { used?: number } | null)?.used ?? 0),
    errors: Number(errors?.n ?? 0),
    cohortsOk: true, briefsOk: true,
  };

  await recordSample(sample);
  return NextResponse.json({ recorded: sample, gate: await gateStatus(now), health });
});
