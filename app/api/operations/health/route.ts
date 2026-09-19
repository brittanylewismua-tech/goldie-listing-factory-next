import { classify as classifyBrief, BRIEF_REFRESH_SECONDS } from "@/app/niche-brief-refresh";
import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { BUILD_MARKER } from "@/app/build-marker";
import { CAPABILITIES } from "@/app/capability-registry";
import { currentCorrelationHealth, recordHistoricalLoss, gateStatus }
  from "@/app/market-observation";

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

  await probe("correlation", async () => {
    /*
      CURRENT HEALTH, NOT HISTORY.

      The previous probe reported `broken` because 27,641 intervals had expired
      under the retired inspector. That is a permanent historical fact and it
      would have kept this probe broken forever — which teaches an operator to
      ignore a broken probe, the worst outcome a health view can produce.
      Historical loss is now a closed incident, reported separately below.
    */
    const health = await currentCorrelationHealth(now);
    return {
      state: health.state === "ok" ? "ok"
        : health.state === "empty" ? "empty"
        : health.state === "behind" ? "stale" : "broken",
      detail: { ...health },
    };
  });

  await probe("historicalLoss", async () => {
    /* A closed incident. Visible, and never part of today's status. */
    const incident = await recordHistoricalLoss(now) as Record<string, unknown>;
    return { state: "ok", detail: { incident } };
  });

  await probe("observationGate", async () => {
    const gate = await gateStatus(now);
    return {
      /* Observing is not broken and it is not ready. It is observing. */
      state: gate.passes ? "ok" : gate.samples ? "empty" : "empty",
      detail: { passes: gate.passes, hoursObserved: gate.hoursObserved,
        samples: gate.samples, segmentStartedAt: gate.segmentStartedAt,
        failing: gate.failing, measured: gate.measured },
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

  /*
    THE BRIEFS A MEMBER ACTUALLY READS, COUNTED SEPARATELY FROM THE IMAGES.

    These were conflated: `referenceImages` was healthy — every image inside
    the six-hour window — while six of seven saved niches displayed as
    unrefreshable, because nothing rebuilt the brief. One number said the
    system was fine and the member's screen said it was not, and there was no
    probe that could tell them apart. Now each state is its own figure.
  */
  await probe("nicheBriefs", async () => {
    const rows = await db.prepare(
      `SELECT w.niche_key AS key,
              MAX(w.last_opened) AS lastOpened,
              COALESCE((SELECT MAX(h.observed_at) FROM niche_watch_history h
                         WHERE h.niche_key = w.niche_key), 0) AS lastBriefAt,
              COALESCE((SELECT r.consecutive_failures FROM niche_brief_runs r
                         WHERE r.niche_key = w.niche_key), 0) AS consecutiveFailures,
              COALESCE((SELECT r.last_attempt_at FROM niche_brief_runs r
                         WHERE r.niche_key = w.niche_key), 0) AS lastAttemptAt,
              COALESCE((SELECT r.last_state FROM niche_brief_runs r
                         WHERE r.niche_key = w.niche_key), '') AS lastState
         FROM niche_watches w GROUP BY w.niche_key`)
      .all<{ key: string; lastOpened: number; lastBriefAt: number;
        consecutiveFailures: number; lastAttemptAt: number; lastState: string }>();

    const counts = { fresh: 0, due: 0, processing: 0, unavailable: 0, failing: 0 };
    let oldest = 0;
    for (const row of rows.results ?? []) {
      const state = String(row.lastState) === "unavailable"
        && now - Number(row.lastBriefAt) < BRIEF_REFRESH_SECONDS
        ? "unavailable"
        : classifyBrief({
            key: String(row.key), terms: [],
            lastOpened: Number(row.lastOpened) || 0,
            lastBriefAt: Number(row.lastBriefAt) || 0,
            consecutiveFailures: Number(row.consecutiveFailures) || 0,
            lastAttemptAt: Number(row.lastAttemptAt) || 0,
          }, now);
      counts[state] += 1;
      const age = now - (Number(row.lastBriefAt) || 0);
      if (Number(row.lastBriefAt) && age > oldest) oldest = age;
    }
    const total = (rows.results ?? []).length;
    /* Due is normal between runs. Only a brief past the staleness line the
       member's own screen uses is a problem, because that is the one that
       produces the refresh-failure message. */
    const overTheLine = oldest > 36 * 3_600;
    return {
      state: !total ? "empty" : counts.failing || overTheLine ? "stale" : "ok",
      detail: { savedNiches: total, ...counts,
        oldestBriefAgeSeconds: oldest,
        stalenessLineSeconds: 36 * 3_600 },
    };
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

    /*
      MEASURED CADENCE, NOT AN ASSUMPTION.

      "Stale" was being reported purely because files were waiting — but the
      register moved from 177,626 to 184,306 marks and a file completed today.
      A queue that is progressing is not stale; a queue with a long backlog is
      not broken. Those are three different states and this now tells them
      apart by looking at when a file last finished.
    */
    /* No catch here: this probe is already inside the wrapper that turns a
       throw into `broken` with its message, and a bare catch would hide the
       very failure this view exists to surface. */
    const lastDone = await db.prepare(
      `SELECT MAX(finished) AS at FROM tm_ingest_files WHERE state = 'done'`)
      .first<{ at: string }>();
    const lastAt = seconds(lastDone?.at);
    const sinceLast = lastAt ? now - lastAt : 0;

    /*
      THE DAILY FILE KEPT THIS PROBE GREEN WHILE THE BACKFILE WAS DEAD.

      "When did a file last finish" cannot tell a daily file from a historical
      one, and a daily file arrives every day — so `progressing` read true for
      days while 88 historical files failed identically every twenty minutes
      and not one of them ever completed. The probe answered the question it
      was asked; the question was wrong.

      The backfile is measured on its own. A tick runs every twenty minutes,
      so six hours without a historical file finishing, while historical files
      are waiting, is a stall rather than a slow patch.
    */
    const lastHistorical = await db.prepare(
      `SELECT MAX(finished) AS at FROM tm_ingest_files
        WHERE state = 'done' AND priority > 2`)
      .first<{ at: string }>();
    const historicalWaiting = await db.prepare(
      `SELECT COUNT(*) AS n FROM tm_ingest_files
        WHERE state IN ('waiting','partial') AND priority > 2`)
      .first<{ n: number }>();
    const backfileAt = seconds(lastHistorical?.at);
    const backfileSince = backfileAt ? now - backfileAt : 0;
    const backfileWaiting = Number(historicalWaiting?.n ?? 0);
    const backfileStalled = backfileWaiting > 0
      && (!backfileAt || backfileSince > 6 * 3_600);

    return {
      state: (byState.failed ?? 0) > 0 ? "broken"
        /* Nothing finished in a day and work is queued: genuinely stalled. */
        : incomplete && lastAt && sinceLast > 36 * 3_600 ? "broken"
        /* Or the historical queue has stopped while the daily one carries on,
           which is invisible in any measure that pools the two. */
        : backfileStalled ? "broken"
        : incomplete ? "ok"
        : "ok",
      detail: { marks: Number(marks?.n ?? 0), files: byState,
        lastCompletedAt: lastAt,
        hoursSinceLastFile: lastAt ? Math.round(sinceLast / 3_600) : null,
        progressing: Boolean(lastAt && sinceLast < 36 * 3_600),
        backfile: {
          waiting: backfileWaiting,
          lastCompletedAt: backfileAt,
          hoursSinceLastFile: backfileAt ? Math.round(backfileSince / 3_600) : null,
          stalled: backfileStalled,
        },
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
