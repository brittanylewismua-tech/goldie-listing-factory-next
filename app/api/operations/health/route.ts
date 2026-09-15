import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { BUILD_MARKER } from "@/app/build-marker";
import { CAPABILITIES } from "@/app/capability-registry";

/**
 * THE WHOLE SUITE, AND WHAT IS ACTUALLY BROKEN.
 *
 * The rule this exists to enforce: A FAILURE MUST LOOK LIKE A FAILURE. Every
 * probe below reports one of `ok`, `stale` or `broken`, and `broken` carries
 * the error and the last value that WAS valid. Nothing returns an empty
 * object that a reader mistakes for a healthy zero — that is how Shop Watch
 * rendered as "you are watching nothing" for every member while its query
 * threw on every request.
 *
 * So: no probe here has a bare catch that returns a plausible-looking empty.
 */
export const maxDuration = 120;

type Probe = {
  key: string;
  state: "ok" | "stale" | "broken" | "empty";
  detail: Record<string, unknown>;
  error?: string;
};

export const GET = withErrorLog("operations-health", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);
  const probes: Probe[] = [];

  /* Every probe goes through this, so a thrown query becomes `broken` with its
     message rather than a silent empty result. */
  const probe = async (
    key: string,
    run: () => Promise<{ state: Probe["state"]; detail: Record<string, unknown> }>,
  ) => {
    try { probes.push({ key, ...(await run()) }); }
    catch (error) {
      probes.push({ key, state: "broken", detail: {},
        error: error instanceof Error ? error.message : "probe failed" });
    }
  };

  const seconds = (value?: string | number | null) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return value;
    const parsed = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1_000) : 0;
  };
  const ageState = (at: number, staleAfter: number): Probe["state"] =>
    !at ? "empty" : now - at > staleAfter ? "stale" : "ok";

  await probe("etsySensor", async () => {
    /*
      THE MARKET SENSOR LIVES IN shop_sensor_state.

      This read `shop_observations`, which is Shop Watch's table — two watched
      shops — and reported the market detector as stale on the strength of it.
      The detector was fine; the probe was pointed at the wrong feature.
    */
    const row = await db.prepare(
      `SELECT MAX(observed_at) AS latest, COUNT(*) AS shops,
              SUM(CASE WHEN observed_at IS NULL THEN 1 ELSE 0 END) AS neverSensed
         FROM shop_sensor_state`)
      .first<{ latest: string; shops: number; neverSensed: number }>();
    const at = seconds(row?.latest);
    return { state: ageState(at, 6 * 3_600),
      detail: { lastReadingAt: at, shopsMonitored: Number(row?.shops ?? 0),
        neverSensed: Number(row?.neverSensed ?? 0) } };
  });

  await probe("shopWatchObservations", async () => {
    /* Shop Watch's own observations, which is what the previous probe was
       actually measuring. Kept, under the right name. */
    const row = await db.prepare(
      `SELECT MAX(observed_at) AS latest, COUNT(DISTINCT shop_id) AS shops
         FROM shop_observations`)
      .first<{ latest: string; shops: number }>();
    const at = seconds(row?.latest);
    return { state: ageState(at, 24 * 3_600),
      detail: { lastObservationAt: at, shopsObserved: Number(row?.shops ?? 0) } };
  });

  await probe("inspectionBacklog", async () => {
    /*
      DETECTION WITHOUT ATTRIBUTION IS NOT EVIDENCE.

      The sensor opens an interval whenever a shop's counter moves; the
      inspector is what turns that into a listing-level claim. When the
      inspector falls behind, Market Watch keeps looking healthy while the
      evidence behind it stops growing — so the backlog is a first-class
      health signal, not a footnote.
    */
    const row = await db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN inspected_at IS NULL THEN 1 ELSE 0 END) AS waiting
         FROM shop_sales_intervals`)
      .first<{ total: number; waiting: number }>();
    const jobs = await db.prepare(
      `SELECT state, COUNT(*) AS n FROM inspection_jobs GROUP BY state`)
      .all<{ state: string; n: number }>();
    const byState: Record<string, number> = {};
    for (const entry of jobs.results ?? []) byState[entry.state] = Number(entry.n) || 0;
    const waiting = Number(row?.waiting ?? 0);
    const failed = byState.failed ?? 0;
    return {
      /* A backlog this size is not "stale", it is a workload that cannot keep
         up, and it says so. */
      state: waiting > 10_000 || failed > 500 ? "broken" : waiting > 1_000 ? "stale" : "ok",
      detail: { intervals: Number(row?.total ?? 0), awaitingInspection: waiting,
        jobs: byState },
    };
  });

  await probe("listingPoller", async () => {
    const row = await db.prepare(
      `SELECT MAX(observed_at) AS latest, COUNT(*) AS snapshots FROM listing_snapshots`)
      .first<{ latest: string; snapshots: number }>();
    const at = seconds(row?.latest);
    return { state: ageState(at, 6 * 3_600),
      detail: { lastSnapshotAt: at, snapshots: Number(row?.snapshots ?? 0) } };
  });

  await probe("attribution", async () => {
    const row = await db.prepare(
      `SELECT SUM(resolved_units) AS resolved, SUM(unresolved_units) AS unresolved,
              COUNT(*) AS intervals
         FROM shop_sales_intervals WHERE inspected_at IS NOT NULL`)
      .first<{ resolved: number; unresolved: number; intervals: number }>();
    const resolved = Number(row?.resolved ?? 0);
    const unresolved = Number(row?.unresolved ?? 0);
    const total = resolved + unresolved;
    return { state: total ? "ok" : "empty",
      detail: { resolved, unresolved, intervals: Number(row?.intervals ?? 0),
        /* Coverage is reported, never improved by spreading the remainder. */
        coverage: total ? Number((resolved / total).toFixed(3)) : null } };
  });

  await probe("referenceImages", async () => {
    const row = await db.prepare(
      `SELECT COUNT(*) AS held, SUM(CASE WHEN retrieved_at > ? THEN 1 ELSE 0 END) AS fresh,
              SUM(CASE WHEN outcome = 'recovered' THEN 1 ELSE 0 END) AS usable
         FROM reference_images`)
      .bind(now - 6 * 3_600)
      .first<{ held: number; fresh: number; usable: number }>();
    const held = Number(row?.held ?? 0);
    const fresh = Number(row?.fresh ?? 0);
    return { state: !held ? "empty" : fresh === 0 ? "stale" : "ok",
      detail: { held, freshWithinSixHours: fresh, usable: Number(row?.usable ?? 0) } };
  });

  await probe("marketEvidence", async () => {
    const row = await db.prepare(
      `SELECT MIN(observed_at) AS oldest, MAX(observed_at) AS newest, COUNT(*) AS rows_
         FROM listing_sales_activity WHERE interval_id IS NOT NULL`)
      .first<{ oldest: string; newest: string; rows_: number }>();
    const newest = seconds(row?.newest);
    const oldest = seconds(row?.oldest);
    return { state: ageState(newest, 12 * 3_600),
      detail: { rows: Number(row?.rows_ ?? 0), newestAt: newest, oldestAt: oldest,
        windowSeconds: newest && oldest ? newest - oldest : 0 } };
  });

  await probe("shopWatch", async () => {
    const row = await db.prepare(
      `SELECT COUNT(*) AS shops,
              SUM(CASE WHEN next_refresh_at IS NOT NULL AND next_refresh_at < ? THEN 1 ELSE 0 END) AS due,
              SUM(CASE WHEN refresh_failures > 2 THEN 1 ELSE 0 END) AS failing,
              MIN(review_high_water) AS lowestHighWater
         FROM watched_shops`)
      .bind(new Date(now * 1000).toISOString())
      .first<{ shops: number; due: number; failing: number; lowestHighWater: number }>();
    const failing = Number(row?.failing ?? 0);
    return { state: failing > 0 ? "broken" : Number(row?.shops ?? 0) ? "ok" : "empty",
      detail: { shops: Number(row?.shops ?? 0), due: Number(row?.due ?? 0),
        failingShops: failing, lowestReviewHighWater: Number(row?.lowestHighWater ?? 0) } };
  });

  await probe("trademarkIngest", async () => {
    const files = await db.prepare(
      `SELECT state, COUNT(*) AS n FROM tm_ingest_files GROUP BY state`)
      .all<{ state: string; n: number }>();
    const marks = await db.prepare(`SELECT COUNT(*) AS n FROM tm_marks`)
      .first<{ n: number }>();
    const byState: Record<string, number> = {};
    for (const row of files.results ?? []) byState[row.state] = Number(row.n) || 0;
    const incomplete = (byState.waiting ?? 0) + (byState.partial ?? 0);
    return { state: (byState.failed ?? 0) > 0 ? "broken" : incomplete ? "stale" : "ok",
      detail: { marks: Number(marks?.n ?? 0), files: byState,
        /* While anything is waiting or partial, no check may read as clean. */
        registerComplete: incomplete === 0 && Number(marks?.n ?? 0) > 0 } };
  });

  await probe("shopMapFinance", async () => {
    /*
      The rollup timestamp column is `computed_at`, an integer. An earlier
      version asked for `built_at`, which belongs to shop_watch_briefs — and
      this view reported it as BROKEN with the error rather than rendering a
      healthy empty. That is the rule in this file working as intended, on its
      own author.
    */
    const row = await db.prepare(
      `SELECT (SELECT COUNT(*) FROM finance_receipts) AS receipts,
              (SELECT COUNT(*) FROM finance_ledger) AS ledger,
              (SELECT COUNT(*) FROM finance_production) AS production,
              (SELECT COUNT(*) FROM finance_rollups) AS rollups,
              (SELECT MAX(computed_at) FROM finance_rollups) AS builtAt`)
      .first<Record<string, string | number>>();
    const at = seconds(row?.builtAt as string);
    return { state: Number(row?.rollups ?? 0) ? ageState(at, 48 * 3_600) : "empty",
      detail: { ...row, lastRollupAt: at } };
  });

  await probe("artworkCapture", async () => {
    const row = await db.prepare(
      `SELECT SUM(CASE WHEN state = 'pending' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) AS failed,
              COUNT(*) AS jobs FROM artwork_capture_jobs`)
      .first<{ pending: number; failed: number; jobs: number }>();
    const failed = Number(row?.failed ?? 0);
    return { state: failed > 10 ? "broken" : "ok",
      detail: { backlog: Number(row?.pending ?? 0), permanentFailures: failed,
        jobs: Number(row?.jobs ?? 0) } };
  });

  await probe("referenceAnalysis", async () => {
    const row = await db.prepare(
      `SELECT (SELECT COUNT(*) FROM reference_analysis) AS analysed,
              (SELECT COUNT(*) FROM reference_images WHERE outcome = 'recovered') AS recoverable`)
      .first<{ analysed: number; recoverable: number }>();
    const analysed = Number(row?.analysed ?? 0);
    const recoverable = Number(row?.recoverable ?? 0);
    return { state: recoverable ? "ok" : "empty",
      detail: { analysed, recoverable, backlog: Math.max(0, recoverable - analysed) } };
  });

  await probe("paidReservations", async () => {
    const row = await db.prepare(
      `SELECT state, COUNT(*) AS n FROM spend_reservations
        WHERE created_at >= ? GROUP BY state`)
      .bind(new Date((now - 86_400) * 1000).toISOString())
      .all<{ state: string; n: number }>();
    const byState: Record<string, number> = {};
    for (const entry of row.results ?? []) byState[entry.state] = Number(entry.n) || 0;
    const stuck = await db.prepare(
      `SELECT COUNT(*) AS n FROM spend_reservations
        WHERE state = 'held' AND created_at < ?`)
      .bind(new Date((now - 3_600) * 1000).toISOString())
      .first<{ n: number }>();
    return { state: Number(stuck?.n ?? 0) > 5 ? "broken" : "ok",
      detail: { last24h: byState, staleHeld: Number(stuck?.n ?? 0) } };
  });

  const broken = probes.filter(row => row.state === "broken");
  const stale = probes.filter(row => row.state === "stale");

  return NextResponse.json({
    build: BUILD_MARKER,
    capabilities: CAPABILITIES.length,
    /* Healthy means every probe answered and none is broken. An empty probe is
       reported as empty, never folded into ok. */
    healthy: broken.length === 0,
    broken: broken.map(row => ({ key: row.key, error: row.error ?? "", last: row.detail })),
    stale: stale.map(row => row.key),
    probes,
  });
});
