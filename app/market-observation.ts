import { env } from "cloudflare:workers";
import { CORRELATION_RULE_VERSION, MAX_EVIDENCE_AGE_SECONDS,
  EARLIEST_CORRELATION_SECONDS } from "@/app/correlation";
import { BUILD_MARKER } from "@/app/build-marker";

/**
 * TWO DIFFERENT QUESTIONS, KEPT APART.
 *
 * "Did we lose 62,449 shop-level sales under the old inspector?" — yes,
 * permanently, and that fact should never stop being visible.
 *
 * "Is Market Watch working right now?" — a completely separate question, and
 * the first answer was poisoning it. `inspectionBacklog=broken` would have
 * stayed broken forever, which trains an operator to ignore a broken probe:
 * the worst possible outcome for a health view.
 *
 * So historical loss becomes a CLOSED INCIDENT with a first and last affected
 * timestamp, and current health measures only work that arrived under the new
 * architecture.
 *
 * And readiness stops being inferred from whichever metric someone looks at.
 * The gate below is explicit, persisted, and cannot be satisfied by a good
 * afternoon.
 */
const db = () => (env as unknown as { DB: D1Database }).DB;

export async function ensureObservationTables() {
  await db().prepare(`CREATE TABLE IF NOT EXISTS market_observations (
    at INTEGER PRIMARY KEY,
    build TEXT NOT NULL DEFAULT '',
    rule_version INTEGER NOT NULL DEFAULT 0,
    sensor_ok INTEGER NOT NULL DEFAULT 0,
    sweep_ok INTEGER NOT NULL DEFAULT 0,
    correlation_ok INTEGER NOT NULL DEFAULT 0,
    eligible INTEGER NOT NULL DEFAULT 0,
    correlated INTEGER NOT NULL DEFAULT 0,
    expired_new INTEGER NOT NULL DEFAULT 0,
    p50_delay INTEGER NOT NULL DEFAULT 0,
    p95_delay INTEGER NOT NULL DEFAULT 0,
    backlog INTEGER NOT NULL DEFAULT 0,
    approaching_expiry INTEGER NOT NULL DEFAULT 0,
    attributed_units INTEGER NOT NULL DEFAULT 0,
    unresolved_units INTEGER NOT NULL DEFAULT 0,
    listing_freshness REAL NOT NULL DEFAULT 0,
    etsy_calls INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    cohorts_ok INTEGER NOT NULL DEFAULT 0,
    briefs_ok INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL DEFAULT '')`).run();
  /*
    CREATE TABLE IF NOT EXISTS does nothing to a table that already exists, so
    a column added to the definition above never reaches a live database. The
    existing rows keep 0, which is what they measured: the column records
    intervals that reached three-quarters of their evidence window
    uncorrelated, and nothing was ever counting them before.
  */
  await db().prepare(
    `ALTER TABLE market_observations ADD COLUMN approaching_expiry INTEGER NOT NULL DEFAULT 0`)
    .run().catch(() => {});
  await db().prepare(
    `CREATE INDEX IF NOT EXISTS market_observations_at ON market_observations (at DESC)`)
    .run();
  /* The incident record. One row, closed, never rewritten by a later run. */
  await db().prepare(`CREATE TABLE IF NOT EXISTS market_incidents (
    id TEXT PRIMARY KEY,
    what TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'closed',
    first_affected INTEGER,
    last_affected INTEGER,
    intervals_lost INTEGER NOT NULL DEFAULT 0,
    units_lost INTEGER NOT NULL DEFAULT 0,
    jobs_retired INTEGER NOT NULL DEFAULT 0,
    recorded_at INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '')`).run();
}

const epoch = (value: string | null | undefined) => {
  if (!value) return 0;
  const parsed = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1_000) : 0;
};

/**
 * HISTORICAL LOSS — recorded once, then read.
 *
 * Recomputed only when the incident row does not exist, because the numbers
 * are a snapshot of what the retired architecture did and must not drift as
 * the new one works.
 */
export const INCIDENT_ID = "retired-triggered-inspector";

export async function recordHistoricalLoss(now = Math.floor(Date.now() / 1000)) {
  await ensureObservationTables();
  const held = await db().prepare(
    `SELECT * FROM market_incidents WHERE id = ?`).bind(INCIDENT_ID)
    .first<Record<string, unknown>>().catch(() => null);
  if (held) return held;

  const loss = await db().prepare(
    `SELECT COUNT(*) AS intervals, COALESCE(SUM(sold_delta), 0) AS units,
            MIN(to_observed) AS firstAffected, MAX(to_observed) AS lastAffected
       FROM shop_sales_intervals
      WHERE correlation_state = 'expired'`)
    .first<{ intervals: number; units: number;
      firstAffected: string; lastAffected: string }>().catch(() => null);
  const retired = await db().prepare(
    `SELECT COUNT(*) AS n FROM inspection_jobs WHERE state = 'retired'`)
    .first<{ n: number }>().catch(() => null);

  const row = {
    id: INCIDENT_ID,
    what: "The triggered inspector opened one Etsy inspection per shop interval "
      + "and could not keep up. Evidence expires when a shop restocks, so the "
      + "backlog became permanent loss rather than delay.",
    status: "closed",
    firstAffected: epoch(loss?.firstAffected),
    lastAffected: epoch(loss?.lastAffected),
    intervalsLost: Number(loss?.intervals ?? 0),
    unitsLost: Number(loss?.units ?? 0),
    jobsRetired: Number(retired?.n ?? 0),
    note: "Replaced by local correlation. Nothing was deleted; expired work is "
      + "closed so it stops being retried or counted as current demand.",
  };
  await db().prepare(
    `INSERT INTO market_incidents
       (id, what, status, first_affected, last_affected, intervals_lost,
        units_lost, jobs_retired, recorded_at, note)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO NOTHING`)
    .bind(row.id, row.what, row.status, row.firstAffected, row.lastAffected,
      row.intervalsLost, row.unitsLost, row.jobsRetired, now, row.note).run();
  return row;
}

export type CurrentHealth = {
  awaitingSweep: number;
  pastEarliest: number;
  approachingExpiry: number;
  expiredUnderNewArchitecture: number;
  p50DelaySeconds: number;
  p95DelaySeconds: number;
  throughputPerSecond: number | null;
  backlogGrowthPerHour: number | null;
  lastCorrelationAt: number;
  ruleVersion: number;
  state: "ok" | "behind" | "stalled" | "empty";
};

/** Only work that arrived under the new architecture. */
export async function currentCorrelationHealth(
  now = Math.floor(Date.now() / 1000),
): Promise<CurrentHealth> {
  await ensureObservationTables();
  const readyBefore = new Date((now - EARLIEST_CORRELATION_SECONDS) * 1000).toISOString();
  const expiryNear = new Date((now - MAX_EVIDENCE_AGE_SECONDS * 0.75) * 1000).toISOString();
  const staleCut = new Date((now - MAX_EVIDENCE_AGE_SECONDS) * 1000).toISOString();

  const open = await db().prepare(
    `SELECT
       SUM(CASE WHEN to_observed > ? THEN 1 ELSE 0 END) AS awaitingSweep,
       SUM(CASE WHEN to_observed <= ? THEN 1 ELSE 0 END) AS pastEarliest,
       SUM(CASE WHEN to_observed <= ? AND to_observed > ? THEN 1 ELSE 0 END) AS approaching
     FROM shop_sales_intervals
     WHERE correlated_at IS NULL AND sold_delta > 0`)
    .bind(readyBefore, readyBefore, expiryNear, staleCut)
    .first<{ awaitingSweep: number; pastEarliest: number; approaching: number }>()
    .catch(() => null);

  /*
    Expiry UNDER THE NEW ARCHITECTURE only — anything closed before the
    correlation rule existed belongs to the incident, not to today.
  */
  const incident = await db().prepare(
    `SELECT recorded_at AS recordedAt FROM market_incidents WHERE id = ?`)
    .bind(INCIDENT_ID).first<{ recordedAt: number }>().catch(() => null);
  const since = Number(incident?.recordedAt ?? 0);
  const expiredNew = await db().prepare(
    `SELECT COUNT(*) AS n FROM shop_sales_intervals
      WHERE correlation_state = 'expired' AND correlated_at > ?`)
    .bind(since).first<{ n: number }>().catch(() => null);

  /* Delay measured from the correlations table, which only the new path writes. */
  const delays = await db().prepare(
    `SELECT (c.correlated_at
              - CAST(strftime('%s', REPLACE(i.to_observed,' ','T')) AS INTEGER)) AS delay
       FROM correlations c
       JOIN shop_sales_intervals i ON i.id = c.interval_id
      WHERE c.rule_version = ? AND c.correlated_at > ?
      ORDER BY delay`)
    .bind(CORRELATION_RULE_VERSION, now - 24 * 3_600)
    .all<{ delay: number }>().catch(() => ({ results: [] as Array<{ delay: number }> }));
  const sorted = (delays.results ?? []).map(row => Number(row.delay) || 0)
    .filter(value => value >= 0);
  const at = (share: number) => sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] : 0;

  const last = await db().prepare(
    `SELECT MAX(correlated_at) AS at FROM correlations WHERE rule_version = ?`)
    .bind(CORRELATION_RULE_VERSION).first<{ at: number }>().catch(() => null);

  /*
    A RATE OVER SIX HOURS, NOT THE DIFFERENCE BETWEEN THE LAST TWO READINGS.

    This took two consecutive observations and divided by the ten minutes
    between them — multiplying whatever noise was in that one difference by
    six. The queue fills continuously and is drained every ten minutes, so
    two adjacent samples differ by a few hundred at random, and the operator
    view read "backlog growing 5,027 an hour" while the backlog was flat and
    nothing had ever expired.

    A least-squares slope over the last six hours instead: the same question,
    asked of enough readings to have an answer.
  */
  const rateFrom = now - 6 * 3_600;
  const recent = await db().prepare(
    `SELECT at, backlog FROM market_observations WHERE at >= ? ORDER BY at ASC`)
    .bind(rateFrom)
    .all<{ at: number; backlog: number }>()
    .catch(() => ({ results: [] as Array<{ at: number; backlog: number }> }));
  const points = (recent.results ?? []).map(row =>
    ({ hours: (Number(row.at) - rateFrom) / 3_600, backlog: Number(row.backlog) }));
  let growth: number | null = null;
  if (points.length >= 6) {
    const n = points.length;
    const meanX = points.reduce((sum, p) => sum + p.hours, 0) / n;
    const meanY = points.reduce((sum, p) => sum + p.backlog, 0) / n;
    let top = 0, bottom = 0;
    for (const point of points) {
      top += (point.hours - meanX) * (point.backlog - meanY);
      bottom += (point.hours - meanX) ** 2;
    }
    growth = bottom > 0 ? top / bottom : null;
  }

  const pastEarliest = Number(open?.pastEarliest ?? 0);
  const lastAt = Number(last?.at ?? 0);
  return {
    awaitingSweep: Number(open?.awaitingSweep ?? 0),
    pastEarliest,
    approachingExpiry: Number(open?.approaching ?? 0),
    expiredUnderNewArchitecture: Number(expiredNew?.n ?? 0),
    p50DelaySeconds: at(0.5),
    p95DelaySeconds: at(0.95),
    throughputPerSecond: null,
    backlogGrowthPerHour: growth === null ? null : Number(growth.toFixed(1)),
    lastCorrelationAt: lastAt,
    ruleVersion: CORRELATION_RULE_VERSION,
    /*
      Healthy means work is flowing. A pile of intervals past their earliest
      correlation time is the one thing that means it is not.
    */
    state: !lastAt ? "empty"
      : now - lastAt > 3 * 3_600 ? "stalled"
      : pastEarliest > 2_000 ? "behind"
      : "ok",
  };
}

/* The gate itself lives in `observation-gate.ts`, which has no Workers
   imports so it can be tested directly. Re-exported here so callers have one
   place to look. */
export {
  OBSERVATION_HOURS, GATE_STANDARD, evaluateGate,
  type Sample, type GateResult,
} from "@/app/observation-gate";
import { evaluateGate as evaluate, type Sample as SampleShape } from "@/app/observation-gate";

/** One observation sample, written once. A repeat firing is a no-op. */
export async function recordSample(sample: SampleShape) {
  await ensureObservationTables();
  await db().prepare(
    `INSERT INTO market_observations
      (at, build, rule_version, sensor_ok, sweep_ok, correlation_ok, eligible,
       correlated, expired_new, p50_delay, p95_delay, backlog, approaching_expiry,
       attributed_units, unresolved_units, listing_freshness, etsy_calls, errors,
       cohorts_ok, briefs_ok, payload_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(at) DO NOTHING`)
    .bind(sample.at, sample.build, sample.ruleVersion,
      sample.sensorOk ? 1 : 0, sample.sweepOk ? 1 : 0, sample.correlationOk ? 1 : 0,
      sample.eligible, sample.correlated, sample.expiredNew, sample.p50, sample.p95,
      sample.backlog, sample.approachingExpiry ?? 0,
      sample.attributedUnits, sample.unresolvedUnits,
      sample.listingFreshness, sample.etsyCalls, sample.errors,
      sample.cohortsOk ? 1 : 0, sample.briefsOk ? 1 : 0, JSON.stringify(sample))
    .run();
}

export async function gateStatus(now = Math.floor(Date.now() / 1000)) {
  await ensureObservationTables();
  const rows = await db().prepare(
    `SELECT payload_json AS payload FROM market_observations
      WHERE at > ? ORDER BY at`)
    .bind(now - 10 * 86_400)
    .all<{ payload: string }>()
    .catch(() => ({ results: [] as Array<{ payload: string }> }));
  const samples: SampleShape[] = [];
  for (const row of rows.results ?? []) {
    try { samples.push(JSON.parse(row.payload) as SampleShape); } catch { /* skip */ }
  }
  return { ...evaluate(samples, now), build: BUILD_MARKER,
    ruleVersion: CORRELATION_RULE_VERSION };
}
