import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { ensureMarketTables } from "@/app/market-store";
import { variationInventoryEnabled } from "@/app/triggered-inspection";
import { registerSize } from "@/app/trademark-register";

/**
 * IS THE PIPELINE ALIVE, AND IS IT ANY GOOD?
 *
 * A collector that quietly stops is the worst failure this system can have:
 * everything downstream keeps answering with old data and looks perfectly
 * healthy. This page exists to make silence visible.
 *
 * It also carries attribution coverage, which is the number that decides
 * whether any of this may ever be described to a member as selling. Two
 * denominators, because they answer different questions and quoting one as
 * the other would flatter the system: what share of observed sales units were
 * tied to a listing, and what share of shops that sold anything had at least
 * one listing explained.
 *
 * Owner only. No member sees a single figure from here.
 */
const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

export const GET = withErrorLog("market-health", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureMarketTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const days = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 7));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
  const dayStart = new Date().toISOString().slice(0, 10);

  const [
    sensor, cycle, intervals, jobs, delays, events, duplicates,
    snapshots, activity, shopsWithActivity, spend, registerFiles, register,
  ] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS shops,
              SUM(CASE WHEN representative_listing_id IS NOT NULL THEN 1 ELSE 0 END) AS reps,
              SUM(CASE WHEN observed_at >= ? THEN 1 ELSE 0 END) AS recent,
              SUM(CASE WHEN observed_at IS NULL THEN 1 ELSE 0 END) AS never_read,
              SUM(CASE WHEN observed_at IS NOT NULL AND observed_at < ? THEN 1 ELSE 0 END) AS stale
         FROM shop_sensor_state`).bind(tenMinutesAgo, tenMinutesAgo).first<Record<string, number>>(),
    db.prepare(
      `SELECT MIN(observed_at) AS oldest, MAX(observed_at) AS newest
         FROM shop_sensor_state WHERE observed_at IS NOT NULL`).first<Record<string, string>>(),
    db.prepare(
      `SELECT COUNT(*) AS intervals,
              COALESCE(SUM(sold_delta),0) AS units,
              COALESCE(SUM(resolved_units),0) AS attributed,
              COALESCE(SUM(unresolved_units),0) AS unresolved,
              COALESCE(SUM(conflicted),0) AS conflicts,
              SUM(CASE WHEN inspected_at IS NULL THEN 1 ELSE 0 END) AS uninspected
         FROM shop_sales_intervals WHERE to_observed >= ?`).bind(since).first<Record<string, number>>(),
    db.prepare(
      `SELECT state, COUNT(*) AS n FROM inspection_jobs GROUP BY state`).all(),
    db.prepare(
      `SELECT delay_ms FROM inspection_jobs
        WHERE state = 'done' AND delay_ms IS NOT NULL
        ORDER BY finished_at DESC LIMIT 500`).all<{ delay_ms: number }>(),
    db.prepare(
      `SELECT type, COUNT(*) AS n FROM listing_events WHERE observed_at >= ?
        GROUP BY type ORDER BY n DESC LIMIT 20`).bind(since).all(),
    db.prepare(
      `SELECT COALESCE(SUM(duplicates_prevented),0) AS n FROM inspection_jobs`).first<{ n: number }>(),
    db.prepare(
      `SELECT COUNT(*) AS rows, COUNT(DISTINCT listing_id) AS listings, MAX(observed_at) AS newest
         FROM listing_snapshots`).first<Record<string, string | number>>(),
    db.prepare(
      `SELECT COUNT(*) AS events, COALESCE(SUM(units),0) AS units,
              COUNT(DISTINCT listing_id) AS listings
         FROM listing_sales_activity WHERE observed_at >= ?`).bind(since).first<Record<string, number>>(),
    db.prepare(
      `SELECT COUNT(DISTINCT i.shop_id) AS selling,
              COUNT(DISTINCT CASE WHEN i.resolved_units > 0 THEN i.shop_id END) AS explained
         FROM shop_sales_intervals i WHERE i.to_observed >= ?`)
      .bind(since).first<Record<string, number>>(),
    /* The allowance belongs to the Etsy application, not to one feature, so
       the honest figure is the shared meter every call already writes to —
       not this feature's own private tally. */
    db.prepare(
      `SELECT feature, SUM(calls) AS calls FROM etsy_api_usage_buckets
        WHERE bucket >= ? GROUP BY feature ORDER BY calls DESC`)
      .bind(new Date(Date.now() - 24 * 3_600_000).toISOString().slice(0, 13))
      .all<{ feature: string; calls: number }>().catch(() => ({ results: [] })),
    db.prepare(
      `SELECT state, COUNT(*) AS n FROM tm_ingest_files GROUP BY state`).all()
      .catch(() => ({ results: [] })),
    registerSize(db).catch(() => ({ marks: 0, files: [] })),
  ]);

  const ordered = (delays.results ?? []).map(row => Number(row.delay_ms)).sort((a, b) => a - b);
  const at = (fraction: number) =>
    ordered.length ? ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))] : null;

  const units = Number(intervals?.units ?? 0);
  const attributed = Number(intervals?.attributed ?? 0);
  const jobCounts = Object.fromEntries(
    ((jobs.results ?? []) as Array<{ state: string; n: number }>)
      .map(row => [row.state, Number(row.n)]));

  /* A full cycle is the gap between the oldest and newest sensor reading: how
     long it currently takes to get all the way round the corpus. */
  const cycleMs = cycle?.oldest && cycle?.newest
    ? Date.parse(cycle.newest) - Date.parse(cycle.oldest) : null;
  const newestSnapshot = snapshots?.newest ? String(snapshots.newest) : null;
  const byWorkload = ((spend as { results?: Array<{ feature: string; calls: number }> }).results) ?? [];
  const callsToday = byWorkload.reduce((sum, row) => sum + Number(row.calls ?? 0), 0);
  const hoursElapsed = Math.max(
    0.25, (Date.now() - Date.parse(`${dayStart}T00:00:00Z`)) / 3_600_000);

  const ingest = Object.fromEntries(
    (((registerFiles as { results?: Array<{ state: string; n: number }> }).results) ?? [])
      .map(row => [row.state, Number(row.n)]));
  const remainingFiles = (ingest.waiting ?? 0) + (ingest.partial ?? 0) + (ingest.running ?? 0);

  return NextResponse.json({
    windowDays: days,

    shopSensor: {
      monitoredShops: Number(sensor?.shops ?? 0),
      withRepresentative: Number(sensor?.reps ?? 0),
      withoutRepresentative: Number(sensor?.shops ?? 0) - Number(sensor?.reps ?? 0),
      sensedInLastTenMinutes: Number(sensor?.recent ?? 0),
      neverSensed: Number(sensor?.never_read ?? 0),
      staleSensors: Number(sensor?.stale ?? 0),
      coveragePercent: percent(Number(sensor?.recent ?? 0), Number(sensor?.shops ?? 0)),
      cycleMs,
      lastCompletedReading: cycle?.newest ?? null,
    },

    triggeredInspection: {
      intervalsDetected: Number(intervals?.intervals ?? 0),
      intervalsAwaitingInspection: Number(intervals?.uninspected ?? 0),
      queued: jobCounts.queued ?? 0,
      running: jobCounts.running ?? 0,
      completed: jobCounts.done ?? 0,
      failed: jobCounts.failed ?? 0,
      medianDelayMs: at(0.5),
      p95DelayMs: at(0.95),
      duplicateEventsPrevented: Number(duplicates?.n ?? 0),
      manualEditConflicts: Number(intervals?.conflicts ?? 0),
      variationInventoryFlag: variationInventoryEnabled() ? "on" : "off",
    },

    attribution: {
      unitsObserved: units,
      unitsAttributed: attributed,
      unitsUnresolved: Number(intervals?.unresolved ?? 0),
      /* Denominator one: every unit any shop told us it sold. */
      unitCoveragePercent: percent(attributed, units),
      sellingShops: Number(shopsWithActivity?.selling ?? 0),
      shopsWithAnAttribution: Number(shopsWithActivity?.explained ?? 0),
      /* Denominator two: shops, not units. A shop where one of five sales was
         explained counts here and barely counts above, which is why both are
         reported rather than whichever reads better. */
      shopCoveragePercent: percent(
        Number(shopsWithActivity?.explained ?? 0), Number(shopsWithActivity?.selling ?? 0)),
      salesLinkedActivity: activity,
    },

    events: {
      byType: (events as { results?: unknown[] }).results ?? [],
      snapshotRows: Number(snapshots?.rows ?? 0),
      listingsWithHistory: Number(snapshots?.listings ?? 0),
      newestSnapshot,
      /* An hour without a snapshot means the collector has stopped, whatever
         else on this page looks healthy. */
      snapshotsStale: newestSnapshot ? Date.now() - Date.parse(newestSnapshot) > 3_600_000 : true,
    },

    requests: {
      /* A rolling day rather than since midnight, because the allowance is
         what Etsy is counting and it does not reset when our date string does. */
      etsyCallsLast24h: callsToday,
      byWorkload,
      projectedDailyEtsyCalls: Math.round((callsToday / hoursElapsed) * 24),
      internalCeiling: 80_000,
    },

    trademarkRegister: {
      marks: register.marks,
      filesLoaded: ingest.done ?? 0,
      filesRemaining: remainingFiles,
      filesFailed: ingest.failed ?? 0,
      /* Three firings an hour, one file each. */
      estimatedHoursToComplete: Math.round((remainingFiles / 3) * 10) / 10,
    },
  });
});
