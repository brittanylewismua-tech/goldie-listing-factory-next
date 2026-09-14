/**
 * THE HISTORY GOLDIE OWNS.
 *
 * Etsy will tell anybody what a listing looks like right now. What it will
 * never tell anybody is what that listing looked like yesterday, so the only
 * defensible asset here is the record of our own observations. These tables
 * are that record: immutable snapshots, the differences between them, and the
 * shop-level intervals those differences have to be justified against.
 *
 * Nothing in here is shown to a member. It exists so that every sentence a
 * member does read can be traced back to a row.
 */
import { env } from "cloudflare:workers";
import type { ListingEvent, SalesLinked, Snapshot } from "@/app/market-events";

const db = () => (env as unknown as { DB: D1Database }).DB;

/* A fingerprint small enough to store on every snapshot and stable enough to
   compare. Not a security hash — a change detector. */
export function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export async function ensureMarketTables(): Promise<void> {
  await db().batch([
    /* One row per look at a listing. Never updated, only inserted. */
    db().prepare(`CREATE TABLE IF NOT EXISTS listing_snapshots (
      listing_id INTEGER NOT NULL,
      shop_id INTEGER NOT NULL,
      observed_at TEXT NOT NULL,
      quantity INTEGER,
      state TEXT NOT NULL DEFAULT '',
      price_cents INTEGER,
      favorites INTEGER,
      views INTEGER,
      last_modified INTEGER,
      original_created INTEGER,
      taxonomy_id INTEGER,
      title_hash TEXT NOT NULL DEFAULT '',
      tags_hash TEXT NOT NULL DEFAULT '',
      image_hash TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (listing_id, observed_at)
    )`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS listing_snapshots_recent
         ON listing_snapshots (listing_id, observed_at DESC)`),

    /* The differences. This is what momentum is computed from. */
    db().prepare(`CREATE TABLE IF NOT EXISTS listing_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      shop_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      previous TEXT,
      current TEXT,
      delta INTEGER,
      observed_at TEXT NOT NULL,
      previous_observed_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      interval_id INTEGER,
      transaction_id INTEGER,
      conflicted INTEGER NOT NULL DEFAULT 0,
      reasons TEXT NOT NULL DEFAULT ''
    )`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS listing_events_listing
         ON listing_events (listing_id, observed_at DESC)`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS listing_events_type
         ON listing_events (type, observed_at DESC)`),
    /* THE SAME DIFFERENCE CANNOT BECOME TWO EVENTS. An inspection that runs
       twice over the same pair of observations writes the same rows, and the
       index is what makes the second write a no-op instead of a duplicate. */
    db().prepare(`CREATE UNIQUE INDEX IF NOT EXISTS listing_events_once
       ON listing_events (listing_id, type, previous_observed_at, observed_at)`),

    /* Sales-linked activity, kept apart from ordinary events because it is the
       only thing allowed to be described to a member as selling. */
    db().prepare(`CREATE TABLE IF NOT EXISTS listing_sales_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      shop_id INTEGER NOT NULL,
      units INTEGER NOT NULL,
      reason TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      previous_observed_at TEXT NOT NULL,
      interval_id INTEGER
    )`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS listing_sales_activity_listing
         ON listing_sales_activity (listing_id, observed_at DESC)`),
    /* One listing, one interval, one claim. Re-running an inspection must not
       double the units a listing is credited with. */
    db().prepare(`CREATE UNIQUE INDEX IF NOT EXISTS listing_sales_activity_once
       ON listing_sales_activity (listing_id, interval_id)`),

    /* What the sensor last saw of each shop. One row per shop, overwritten. */
    db().prepare(`CREATE TABLE IF NOT EXISTS shop_sensor_state (
      shop_id INTEGER PRIMARY KEY,
      representative_listing_id INTEGER,
      sold_count INTEGER,
      active_count INTEGER,
      review_count INTEGER,
      observed_at TEXT,
      previous_sold_count INTEGER,
      previous_observed_at TEXT,
      misses INTEGER NOT NULL DEFAULT 0,
      inspect_due INTEGER NOT NULL DEFAULT 0
    )`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS shop_sensor_due ON shop_sensor_state (inspect_due, observed_at)`),

    /* Every shop-level increase, and how much of it was ever explained. An
       interval that stays unresolved is a fact we keep, not a gap we fill. */
    db().prepare(`CREATE TABLE IF NOT EXISTS shop_sales_intervals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      from_observed TEXT NOT NULL,
      to_observed TEXT NOT NULL,
      previous_sold INTEGER,
      current_sold INTEGER,
      sold_delta INTEGER NOT NULL,
      sensor_batch TEXT NOT NULL DEFAULT '',
      resolved_units INTEGER NOT NULL DEFAULT 0,
      unresolved_units INTEGER NOT NULL DEFAULT 0,
      conflicted INTEGER NOT NULL DEFAULT 0,
      inspected_at TEXT
    )`),
    /* THE INTERVAL CANNOT BE COUNTED TWICE. A sensor pass delivered twice —
       a retry, an overlapping cycle, a replayed cron — must produce the same
       one row, so the shop and the two observation times are the identity. */
    db().prepare(`CREATE UNIQUE INDEX IF NOT EXISTS shop_sales_intervals_once
       ON shop_sales_intervals (shop_id, from_observed, to_observed)`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS shop_sales_intervals_shop
         ON shop_sales_intervals (shop_id, to_observed DESC)`),

    /* The inspection queue. A job that fails stays here with its attempt count
       and its error, because the failure mode that matters is not a crash — it
       is work quietly vanishing. */
    db().prepare(`CREATE TABLE IF NOT EXISTS inspection_jobs (
      interval_id INTEGER PRIMARY KEY,
      shop_id INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued',
      queued_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      listings_inspected INTEGER NOT NULL DEFAULT 0,
      events_created INTEGER NOT NULL DEFAULT 0,
      duplicates_prevented INTEGER NOT NULL DEFAULT 0,
      units_attributed INTEGER NOT NULL DEFAULT 0,
      units_unresolved INTEGER NOT NULL DEFAULT 0,
      conflicts INTEGER NOT NULL DEFAULT 0,
      requests INTEGER NOT NULL DEFAULT 0,
      delay_ms INTEGER,
      error TEXT NOT NULL DEFAULT ''
    )`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS inspection_jobs_queue
         ON inspection_jobs (state, queued_at)`),

    /* One writer at a time. Two cron firings overlapping would otherwise read
       the same shops, write the same snapshots and race on the same intervals. */
    db().prepare(`CREATE TABLE IF NOT EXISTS market_locks (
      name TEXT PRIMARY KEY,
      holder TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`),

    /* The hook the Hot Pool will read. Nothing consumes it yet, and nothing
       here decides how often a hot listing is polled. */
    db().prepare(`CREATE TABLE IF NOT EXISTS hot_pool_candidates (
      listing_id INTEGER PRIMARY KEY,
      shop_id INTEGER NOT NULL,
      first_flagged TEXT NOT NULL,
      last_flagged TEXT NOT NULL,
      flags INTEGER NOT NULL DEFAULT 1,
      last_reason TEXT NOT NULL DEFAULT ''
    )`),
  ]);

  /* CREATE TABLE IF NOT EXISTS is a no-op on a table that already exists, and
     this codebase has lost three deploys to that fact. Columns added after a
     table shipped are stated again as ALTERs, and the only tolerated error is
     the one meaning it is already there. */
  const additions: Array<[string, string]> = [
    ["shop_sales_intervals", "previous_sold INTEGER"],
    ["shop_sales_intervals", "current_sold INTEGER"],
    ["shop_sales_intervals", "sensor_batch TEXT NOT NULL DEFAULT ''"],
    ["shop_sales_intervals", "inspected_at TEXT"],
  ];
  for (const [table, column] of additions) {
    try {
      await db().prepare(`ALTER TABLE ${table} ADD COLUMN ${column}`).run();
    } catch (error) {
      if (!/duplicate column/i.test(error instanceof Error ? error.message : "")) throw error;
    }
  }
}

export async function latestSnapshot(listingId: number): Promise<Snapshot | null> {
  const row = await db()
    .prepare(
      `SELECT * FROM listing_snapshots WHERE listing_id = ?
        ORDER BY observed_at DESC LIMIT 1`)
    .bind(listingId)
    .first<Record<string, unknown>>();
  return row ? rowToSnapshot(row) : null;
}

/** The last look at each of many listings, in one query rather than N. */
export async function latestSnapshots(listingIds: number[]): Promise<Map<number, Snapshot>> {
  if (!listingIds.length) return new Map();
  const marks = listingIds.map(() => "?").join(",");
  const rows = await db()
    .prepare(
      `SELECT s.* FROM listing_snapshots s
         JOIN (SELECT listing_id, MAX(observed_at) AS observed_at
                 FROM listing_snapshots WHERE listing_id IN (${marks})
                GROUP BY listing_id) latest
           ON latest.listing_id = s.listing_id AND latest.observed_at = s.observed_at`)
    .bind(...listingIds)
    .all<Record<string, unknown>>();
  const out = new Map<number, Snapshot>();
  for (const row of rows.results ?? []) out.set(Number(row.listing_id), rowToSnapshot(row));
  return out;
}

const rowToSnapshot = (row: Record<string, unknown>): Snapshot => ({
  listingId: Number(row.listing_id),
  shopId: Number(row.shop_id),
  observedAt: String(row.observed_at),
  quantity: row.quantity === null ? null : Number(row.quantity),
  state: String(row.state ?? ""),
  priceCents: row.price_cents === null ? null : Number(row.price_cents),
  favorites: row.favorites === null ? null : Number(row.favorites),
  views: row.views === null ? null : Number(row.views),
  lastModified: row.last_modified === null ? null : Number(row.last_modified),
  originalCreated: row.original_created === null ? null : Number(row.original_created),
  taxonomyId: row.taxonomy_id === null ? null : Number(row.taxonomy_id),
  titleHash: String(row.title_hash ?? ""),
  tagsHash: String(row.tags_hash ?? ""),
  imageHash: String(row.image_hash ?? ""),
});

export async function writeSnapshots(snapshots: Snapshot[]): Promise<void> {
  if (!snapshots.length) return;
  const insert = db().prepare(
    `INSERT OR IGNORE INTO listing_snapshots
       (listing_id, shop_id, observed_at, quantity, state, price_cents, favorites, views,
        last_modified, original_created, taxonomy_id, title_hash, tags_hash, image_hash)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  await inBatches(snapshots.map(snapshot => insert.bind(
    snapshot.listingId, snapshot.shopId, snapshot.observedAt, snapshot.quantity, snapshot.state,
    snapshot.priceCents, snapshot.favorites, snapshot.views, snapshot.lastModified,
    snapshot.originalCreated, snapshot.taxonomyId, snapshot.titleHash, snapshot.tagsHash,
    snapshot.imageHash)));
}

export async function writeEvents(
  events: ListingEvent[], source: string, intervalId: number | null,
): Promise<{ written: number; duplicates: number }> {
  if (!events.length) return { written: 0, duplicates: 0 };
  const insert = db().prepare(
    `INSERT OR IGNORE INTO listing_events
       (listing_id, shop_id, type, previous, current, delta, observed_at,
        previous_observed_at, source, interval_id, conflicted)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const written = await inBatches(events.map(event => insert.bind(
    event.listingId, event.shopId, event.type,
    event.previous === null ? null : String(event.previous),
    event.current === null ? null : String(event.current),
    event.delta, event.observedAt, event.previousObservedAt, source, intervalId,
    event.conflicted ? 1 : 0)));
  /* A refused write is not a failure — it is the second run of the same
     inspection, and counting them is how we prove that. */
  return { written, duplicates: events.length - written };
}

export async function writeSalesActivity(
  linked: SalesLinked[], intervalId: number | null,
): Promise<void> {
  if (!linked.length) return;
  const insert = db().prepare(
    `INSERT OR IGNORE INTO listing_sales_activity
       (listing_id, shop_id, units, reason, observed_at, previous_observed_at, interval_id)
     VALUES (?,?,?,?,?,?,?)`);
  await inBatches(linked.map(row => insert.bind(
    row.listingId, row.shopId, row.units, row.reason,
    row.observedAt, row.previousObservedAt, intervalId)));
}

/**
 * Record a shop-level increase, once.
 *
 * Returns the interval and whether this call was the one that created it, so a
 * sensor pass delivered twice enqueues one inspection rather than two. The
 * conflict clause is what makes a retried pass harmless.
 */
export async function openInterval(
  shopId: number,
  fromObserved: string,
  toObserved: string,
  soldDelta: number,
  { previousSold = null, currentSold = null, sensorBatch = "" }: {
    previousSold?: number | null; currentSold?: number | null; sensorBatch?: string;
  } = {},
): Promise<{ id: number; created: boolean }> {
  const result = await db()
    .prepare(
      `INSERT INTO shop_sales_intervals
         (shop_id, from_observed, to_observed, previous_sold, current_sold,
          sold_delta, sensor_batch, unresolved_units)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(shop_id, from_observed, to_observed) DO NOTHING`)
    .bind(shopId, fromObserved, toObserved, previousSold, currentSold,
      soldDelta, sensorBatch, soldDelta)
    .run();

  const created = Number(result.meta?.changes ?? 0) > 0;
  if (created) return { id: Number(result.meta?.last_row_id ?? 0), created: true };

  const existing = await db()
    .prepare(
      `SELECT id FROM shop_sales_intervals
        WHERE shop_id = ? AND from_observed = ? AND to_observed = ?`)
    .bind(shopId, fromObserved, toObserved)
    .first<{ id: number }>();
  return { id: Number(existing?.id ?? 0), created: false };
}

/** Put an interval in the inspection queue. Also idempotent, for the same reason. */
export async function enqueueInspection(intervalId: number, shopId: number): Promise<boolean> {
  const result = await db()
    .prepare(
      `INSERT INTO inspection_jobs (interval_id, shop_id, queued_at)
       VALUES (?,?,?)
       ON CONFLICT(interval_id) DO NOTHING`)
    .bind(intervalId, shopId, new Date().toISOString())
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

/**
 * ONE WRITER AT A TIME.
 *
 * Two cron firings that overlap would read the same shops, write the same
 * snapshots and race each other on the same intervals. The lock expires on its
 * own so a firing killed mid-run cannot wedge the pipeline shut.
 */
export async function claimLock(
  name: string, holder: string, seconds: number,
): Promise<boolean> {
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + seconds * 1000).toISOString();
  const result = await db()
    .prepare(
      `INSERT INTO market_locks (name, holder, expires_at) VALUES (?,?,?)
       ON CONFLICT(name) DO UPDATE SET holder = excluded.holder, expires_at = excluded.expires_at
        WHERE market_locks.expires_at < ?`)
    .bind(name, holder, expires, now)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function releaseLock(name: string, holder: string): Promise<void> {
  await db().prepare(`DELETE FROM market_locks WHERE name = ? AND holder = ?`)
    .bind(name, holder).run();
}

/** The Hot Pool's inbox. Nothing reads it yet; the flag is the whole hook. */
export async function flagHotCandidates(
  rows: Array<{ listingId: number; shopId: number; reason: string }>,
): Promise<void> {
  if (!rows.length) return;
  const now = new Date().toISOString();
  const insert = db().prepare(
    `INSERT INTO hot_pool_candidates (listing_id, shop_id, first_flagged, last_flagged, last_reason)
     VALUES (?,?,?,?,?)
     ON CONFLICT(listing_id) DO UPDATE SET
       last_flagged = excluded.last_flagged,
       flags = hot_pool_candidates.flags + 1,
       last_reason = excluded.last_reason`);
  await inBatches(rows.map(row => insert.bind(row.listingId, row.shopId, now, now, row.reason)));
}

export async function closeInterval(
  intervalId: number, resolved: number, unresolved: number, conflicted: boolean,
): Promise<void> {
  await db()
    .prepare(
      `UPDATE shop_sales_intervals
          SET resolved_units = ?, unresolved_units = ?, conflicted = ?, inspected_at = ?
        WHERE id = ?`)
    .bind(resolved, unresolved, conflicted ? 1 : 0, new Date().toISOString(), intervalId)
    .run();
}

/* D1 refuses very large batches, and a sweep can produce thousands of writes.
   Chunking here keeps every caller from having to remember that. */
async function inBatches(statements: D1PreparedStatement[], size = 100): Promise<number> {
  let changes = 0;
  for (let index = 0; index < statements.length; index += size) {
    const results = await db().batch(statements.slice(index, index + size));
    for (const result of results) changes += Number(result.meta?.changes ?? 0);
  }
  return changes;
}

/**
 * ATTRIBUTION COVERAGE, WHICH IS THE NUMBER THAT SAYS WHETHER ANY OF THIS
 * WORKS. Of everything the shops told us they sold, how much could be tied to
 * a listing with evidence. Internal only, and the honest denominator for any
 * later claim about detection.
 */
export async function coverage(sinceIso: string): Promise<{
  intervals: number; soldUnits: number; resolvedUnits: number;
  unresolvedUnits: number; conflictedIntervals: number; coveragePercent: number;
}> {
  const row = await db()
    .prepare(
      `SELECT COUNT(*) AS intervals,
              COALESCE(SUM(sold_delta), 0) AS sold,
              COALESCE(SUM(resolved_units), 0) AS resolved,
              COALESCE(SUM(unresolved_units), 0) AS unresolved,
              COALESCE(SUM(conflicted), 0) AS conflicted
         FROM shop_sales_intervals WHERE to_observed >= ?`)
    .bind(sinceIso)
    .first<{ intervals: number; sold: number; resolved: number; unresolved: number; conflicted: number }>();
  const sold = Number(row?.sold ?? 0);
  const resolved = Number(row?.resolved ?? 0);
  return {
    intervals: Number(row?.intervals ?? 0),
    soldUnits: sold,
    resolvedUnits: resolved,
    unresolvedUnits: Number(row?.unresolved ?? 0),
    conflictedIntervals: Number(row?.conflicted ?? 0),
    coveragePercent: sold > 0 ? Math.round((resolved / sold) * 1000) / 10 : 0,
  };
}
