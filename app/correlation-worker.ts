import { env } from "cloudflare:workers";
import {
  correlate, timingFor, eventsInWindow, CORRELATION_RULE_VERSION,
  EARLIEST_CORRELATION_SECONDS, MAX_EVIDENCE_AGE_SECONDS,
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
    /*
      SELECT WHAT IS ACTUALLY READY, NOT THE NEWEST.

      The first version ordered by to_observed DESC and filtered afterwards, so
      every batch filled with intervals that were minutes old, all of them
      returned "too early", and the ready ones behind them were never reached:
      200 considered, 200 too early, 0 correlated. The window belongs in the
      query.

      Newest-first WITHIN the ready range, so a burst is worked from the end
      that is still recoverable.
    */
    const readyBefore = new Date((now - EARLIEST_CORRELATION_SECONDS) * 1000).toISOString();
    const expiredBefore = new Date((now - MAX_EVIDENCE_AGE_SECONDS) * 1000).toISOString();

    /* Anything past the useful window is closed in one statement rather than
       occupying a slot in every batch from now on. */
    const closedOut = await db().prepare(
      `UPDATE shop_sales_intervals
          SET correlated_at = ?, correlation_state = 'expired'
        WHERE correlated_at IS NULL AND to_observed < ?`)
      .bind(now, expiredBefore).run();
    result.expired = Number(closedOut.meta?.changes ?? 0);

    const rows = await db().prepare(
      `SELECT id, shop_id AS shopId, sold_delta AS soldDelta,
              from_observed AS fromObserved, to_observed AS toObserved
         FROM shop_sales_intervals
        WHERE correlated_at IS NULL AND sold_delta > 0
          AND to_observed <= ?
        ORDER BY to_observed DESC
        LIMIT ?`)
      .bind(readyBefore, maxIntervals)
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

    /* A safety net only: the statement above closes the expired ones. This
       catches anything that aged out between the two queries. */
    if (expired.length) {
      const marks = expired.map(() => "?").join(",");
      await db().prepare(
        `UPDATE shop_sales_intervals
            SET correlated_at = ?, correlation_state = 'expired'
          WHERE id IN (${marks})`)
        .bind(now, ...expired).run();
      result.expired += expired.length;
    }
    if (!ready.length) return { ...result, milliseconds: Date.now() - began };

    /*
      ONE READ PER CHUNK OF SHOPS, NOT ONE PER INTERVAL — AND NOT ONE HUGE IN().

      D1 caps the number of bound variables in a statement, and a batch of
      1,500 intervals spans far more shops than that: the first version bound
      every shop id into one IN() and got "too many SQL variables". The shops
      are chunked instead, which keeps the read count small without exceeding
      the limit.
    */
    const shops = [...new Set(ready.map(row => row.shopId))];
    const earliest = Math.min(...ready.map(row => row.fromObserved)) - 600;
    const latest = Math.max(...ready.map(row => row.toObserved)) + 600;
    const fromIso = new Date(earliest * 1000).toISOString();
    const toIso = new Date(latest * 1000).toISOString();
    const CHUNK = 80;

    const events: ListingEvent[] = [];
    const listingCount = new Map<number, number>();
    for (let index = 0; index < shops.length; index += CHUNK) {
      const slice = shops.slice(index, index + CHUNK);
      const marks = slice.map(() => "?").join(",");
      const eventRows = await db().prepare(
        `SELECT id, listing_id AS listingId, shop_id AS shopId, type, delta,
                observed_at AS observedAt, previous_observed_at AS previousObservedAt
           FROM listing_events
          WHERE shop_id IN (${marks})
            AND observed_at >= ? AND observed_at <= ?`)
        .bind(...slice, fromIso, toIso)
        .all<{ id: number; listingId: number; shopId: number; type: string;
          delta: number | null; observedAt: string; previousObservedAt: string }>();
      for (const row of eventRows.results ?? [])
        events.push({
          id: Number(row.id), listingId: Number(row.listingId),
          shopId: Number(row.shopId), type: String(row.type),
          delta: row.delta === null ? null : Number(row.delta),
          observedAt: epoch(row.observedAt),
          previousObservedAt: epoch(row.previousObservedAt),
        });

      const observed = await db().prepare(
        `SELECT shop_id AS shopId, COUNT(*) AS n FROM shop_listings
          WHERE shop_id IN (${marks}) GROUP BY shop_id`)
        .bind(...slice).all<{ shopId: number; n: number }>()
        .catch(() => ({ results: [] as Array<{ shopId: number; n: number }> }));
      for (const row of observed.results ?? [])
        listingCount.set(Number(row.shopId), Number(row.n));
    }

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

    /* Batched in small groups for the same reason the reads are chunked: a
       statement list that is too long is refused outright, and a refused write
       loses a whole pass of work. */
    for (let index = 0; index < writes.length; index += 25)
      await db().batch(writes.slice(index, index + 25));

    return { ...result, milliseconds: Date.now() - began };
  } finally {
    /* Released whatever happened, so an interrupted pass cannot block the next
       one for the length of the lease. */
    await releaseLock("correlation", holder).catch(() => {});
  }
}
