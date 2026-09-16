import { env } from "cloudflare:workers";
import {
  correlate, timingFor, eventsInWindow, CORRELATION_RULE_VERSION,
  type ShopInterval, type ListingEvent,
} from "@/app/correlation";
import { claimLock, releaseLock } from "@/app/market-store";

/**
 * THE CORRELATION PASS.
 *
 * Reads intervals that are ready, joins them against listing events already in
 * the database, writes attributions. Zero Etsy calls, so the only limit is how
 * fast D1 answers — which is what lets a consumer finally outrun its producer.
 *
 * APPEND ONLY, AND RECOMPUTABLE. Attributions are written to
 * `listing_sales_activity` exactly as the inspector wrote them, so everything
 * downstream keeps working, plus a `correlations` row holding the evidence and
 * the rule version behind each decision. Changing a rule means recomputing
 * from evidence that is still there, not losing the history.
 */
const db = () => (env as unknown as { DB: D1Database }).DB;

export async function ensureCorrelationTables() {
  await db().prepare(`CREATE TABLE IF NOT EXISTS correlations (
    interval_id INTEGER NOT NULL,
    rule_version INTEGER NOT NULL,
    shop_id INTEGER NOT NULL,
    attributed_units INTEGER NOT NULL DEFAULT 0,
    unresolved_units INTEGER NOT NULL DEFAULT 0,
    conflicted INTEGER NOT NULL DEFAULT 0,
    because TEXT NOT NULL DEFAULT '',
    evidence_json TEXT NOT NULL DEFAULT '',
    correlated_at INTEGER NOT NULL,
    PRIMARY KEY (interval_id, rule_version))`).run();
  await db().prepare(
    `CREATE INDEX IF NOT EXISTS correlations_shop
       ON correlations (shop_id, correlated_at DESC)`).run();
  /*
    THE COLUMNS BEFORE THE INDEX THAT USES THEM.

    `shop_sales_intervals` predates this feature, so CREATE TABLE IF NOT EXISTS
    does nothing to it and the new columns have to be stated as ALTERs. The
    index over them must come after, or SQLite refuses it — the ordering
    failure this codebase has lost three deploys to.
  */
  await addColumns();
}

async function addColumns() {
  for (const statement of [
    `ALTER TABLE shop_sales_intervals ADD COLUMN correlated_at INTEGER`,
    `ALTER TABLE shop_sales_intervals ADD COLUMN correlation_state TEXT NOT NULL DEFAULT ''`,
  ])
    await db().prepare(statement).run().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      /* CREATE TABLE IF NOT EXISTS is a no-op on an existing table, so a column
         added after the table shipped has to be stated as an ALTER — and the
         only tolerated error is the one meaning it is already there. */
      if (!/duplicate column/i.test(message)) throw error;
    });
  await db().prepare(
    `CREATE INDEX IF NOT EXISTS shop_sales_intervals_correlation
       ON shop_sales_intervals (correlated_at, to_observed)`).run().catch(() => {});
}

const epoch = (value: string | null | undefined) => {
  if (!value) return 0;
  const parsed = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1_000) : 0;
};

export type PassResult = {
  considered: number; correlated: number; tooEarly: number; expired: number;
  attributedUnits: number; unresolvedUnits: number; conflicted: number;
  listingsCredited: number; etsyCalls: 0; milliseconds: number;
  skipped?: string;
};

export async function correlationPass(
  { maxIntervals = 400, now = Math.floor(Date.now() / 1000) } = {},
): Promise<PassResult> {
  const began = Date.now();
  const result: PassResult = { considered: 0, correlated: 0, tooEarly: 0, expired: 0,
    attributedUnits: 0, unresolvedUnits: 0, conflicted: 0, listingsCredited: 0,
    etsyCalls: 0, milliseconds: 0 };

  await ensureCorrelationTables();
  const holder = crypto.randomUUID();
  /* Short, because a pass is fast now. A lock that outlives its work is how
     the old inspector blocked every manual attempt to help it. */
  if (!(await claimLock("correlation", holder, 120)))
    return { ...result, milliseconds: Date.now() - began,
      skipped: "A correlation pass was already running." };

  try {
    const rows = await db().prepare(
      `SELECT id, shop_id AS shopId, sold_delta AS soldDelta,
              from_observed AS fromObserved, to_observed AS toObserved
         FROM shop_sales_intervals
        WHERE correlated_at IS NULL AND sold_delta > 0
        ORDER BY to_observed DESC
        LIMIT ?`)
      .bind(maxIntervals)
      .all<{ id: number; shopId: number; soldDelta: number;
        fromObserved: string; toObserved: string }>();

    const intervals: ShopInterval[] = (rows.results ?? []).map(row => ({
      id: Number(row.id), shopId: Number(row.shopId),
      soldDelta: Number(row.soldDelta) || 0,
      fromObserved: epoch(row.fromObserved), toObserved: epoch(row.toObserved),
    }));
    result.considered = intervals.length;
    if (!intervals.length) return { ...result, milliseconds: Date.now() - began };

    /* Newest first, so a burst is worked from the end that is still
       recoverable rather than from a backlog that has already expired. */
    const ready: ShopInterval[] = [];
    const expired: number[] = [];
    for (const row of intervals) {
      const timing = timingFor(row, now);
      if (timing.state === "ready") ready.push(row);
      else if (timing.state === "expired") expired.push(row.id);
      else result.tooEarly += 1;
    }

    /* Expired intervals are CLOSED, not retried. They never re-enter the
       queue, never count as current demand and never reach a cohort. */
    if (expired.length) {
      const marks = expired.map(() => "?").join(",");
      await db().prepare(
        `UPDATE shop_sales_intervals
            SET correlated_at = ?, correlation_state = 'expired'
          WHERE id IN (${marks})`)
        .bind(now, ...expired).run();
      result.expired = expired.length;
    }
    if (!ready.length) return { ...result, milliseconds: Date.now() - began };

    /* One read for every event that could belong to any interval in this
       batch — a single query rather than one per interval. */
    const shops = [...new Set(ready.map(row => row.shopId))];
    const earliest = Math.min(...ready.map(row => row.fromObserved)) - 600;
    const latest = Math.max(...ready.map(row => row.toObserved)) + 600;
    const shopMarks = shops.map(() => "?").join(",");
    const eventRows = await db().prepare(
      `SELECT id, listing_id AS listingId, shop_id AS shopId, type, delta,
              observed_at AS observedAt, previous_observed_at AS previousObservedAt
         FROM listing_events
        WHERE shop_id IN (${shopMarks})
          AND observed_at >= ? AND observed_at <= ?`)
      .bind(...shops, new Date(earliest * 1000).toISOString(),
        new Date(latest * 1000).toISOString())
      .all<{ id: number; listingId: number; shopId: number; type: string;
        delta: number | null; observedAt: string; previousObservedAt: string }>();

    const events: ListingEvent[] = (eventRows.results ?? []).map(row => ({
      id: Number(row.id), listingId: Number(row.listingId), shopId: Number(row.shopId),
      type: String(row.type), delta: row.delta === null ? null : Number(row.delta),
      observedAt: epoch(row.observedAt),
      previousObservedAt: epoch(row.previousObservedAt),
    }));

    const observed = await db().prepare(
      `SELECT shop_id AS shopId, COUNT(*) AS n FROM shop_listings
        WHERE shop_id IN (${shopMarks}) GROUP BY shop_id`)
      .bind(...shops).all<{ shopId: number; n: number }>()
      .catch(() => ({ results: [] as Array<{ shopId: number; n: number }> }));
    const listingCount = new Map((observed.results ?? [])
      .map(row => [Number(row.shopId), Number(row.n)]));

    const writes: D1PreparedStatement[] = [];
    const activity = db().prepare(
      `INSERT OR IGNORE INTO listing_sales_activity
         (listing_id, shop_id, units, reason, observed_at, previous_observed_at, interval_id)
       VALUES (?,?,?,?,?,?,?)`);
    const correlation = db().prepare(
      `INSERT INTO correlations
         (interval_id, rule_version, shop_id, attributed_units, unresolved_units,
          conflicted, because, evidence_json, correlated_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(interval_id, rule_version) DO UPDATE SET
         attributed_units = excluded.attributed_units,
         unresolved_units = excluded.unresolved_units,
         because = excluded.because, evidence_json = excluded.evidence_json,
         correlated_at = excluded.correlated_at`);
    const close = db().prepare(
      `UPDATE shop_sales_intervals
          SET correlated_at = ?, correlation_state = ?,
              resolved_units = ?, unresolved_units = ?, conflicted = ?, inspected_at = ?
        WHERE id = ?`);

    for (const row of ready) {
      const mine = eventsInWindow(row, events);
      const outcome = correlate(row, mine, listingCount.get(row.shopId) ?? 0);
      const observedAt = new Date(row.toObserved * 1000).toISOString();
      const previousAt = new Date(row.fromObserved * 1000).toISOString();

      for (const attribution of outcome.attributions) {
        writes.push(activity.bind(attribution.listingId, row.shopId, attribution.units,
          attribution.reason, observedAt, previousAt, row.id));
        result.listingsCredited += 1;
      }
      writes.push(correlation.bind(row.id, CORRELATION_RULE_VERSION, row.shopId,
        outcome.attributedUnits, outcome.unresolvedUnits, outcome.conflicted ? 1 : 0,
        outcome.because, JSON.stringify(outcome.attributions), now));
      writes.push(close.bind(now, outcome.conflicted ? "conflicted" : "correlated",
        outcome.attributedUnits, outcome.unresolvedUnits,
        outcome.conflicted ? 1 : 0, observedAt, row.id));

      result.correlated += 1;
      result.attributedUnits += outcome.attributedUnits;
      result.unresolvedUnits += outcome.unresolvedUnits;
      if (outcome.conflicted) result.conflicted += 1;
    }

    for (let index = 0; index < writes.length; index += 50)
      await db().batch(writes.slice(index, index + 50));

    return { ...result, milliseconds: Date.now() - began };
  } finally {
    /* Released whatever happened, so an interrupted pass cannot block the next
       one for the length of the lease. */
    await releaseLock("correlation", holder).catch(() => {});
  }
}
