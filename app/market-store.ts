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
      sold_delta INTEGER NOT NULL,
      resolved_units INTEGER NOT NULL DEFAULT 0,
      unresolved_units INTEGER NOT NULL DEFAULT 0,
      conflicted INTEGER NOT NULL DEFAULT 0
    )`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS shop_sales_intervals_shop
         ON shop_sales_intervals (shop_id, to_observed DESC)`),
  ]);
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
): Promise<void> {
  if (!events.length) return;
  const insert = db().prepare(
    `INSERT INTO listing_events
       (listing_id, shop_id, type, previous, current, delta, observed_at,
        previous_observed_at, source, interval_id, conflicted)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  await inBatches(events.map(event => insert.bind(
    event.listingId, event.shopId, event.type,
    event.previous === null ? null : String(event.previous),
    event.current === null ? null : String(event.current),
    event.delta, event.observedAt, event.previousObservedAt, source, intervalId,
    event.conflicted ? 1 : 0)));
}

export async function writeSalesActivity(
  linked: SalesLinked[], intervalId: number | null,
): Promise<void> {
  if (!linked.length) return;
  const insert = db().prepare(
    `INSERT INTO listing_sales_activity
       (listing_id, shop_id, units, reason, observed_at, previous_observed_at, interval_id)
     VALUES (?,?,?,?,?,?,?)`);
  await inBatches(linked.map(row => insert.bind(
    row.listingId, row.shopId, row.units, row.reason,
    row.observedAt, row.previousObservedAt, intervalId)));
}

export async function openInterval(
  shopId: number, fromObserved: string, toObserved: string, soldDelta: number,
): Promise<number> {
  const result = await db()
    .prepare(
      `INSERT INTO shop_sales_intervals (shop_id, from_observed, to_observed, sold_delta, unresolved_units)
       VALUES (?,?,?,?,?)`)
    .bind(shopId, fromObserved, toObserved, soldDelta, soldDelta)
    .run();
  return Number(result.meta?.last_row_id ?? 0);
}

export async function closeInterval(
  intervalId: number, resolved: number, unresolved: number, conflicted: boolean,
): Promise<void> {
  await db()
    .prepare(
      `UPDATE shop_sales_intervals
          SET resolved_units = ?, unresolved_units = ?, conflicted = ?
        WHERE id = ?`)
    .bind(resolved, unresolved, conflicted ? 1 : 0, intervalId)
    .run();
}

/* D1 refuses very large batches, and a sweep can produce thousands of writes.
   Chunking here keeps every caller from having to remember that. */
async function inBatches(statements: D1PreparedStatement[], size = 100): Promise<void> {
  for (let index = 0; index < statements.length; index += size)
    await db().batch(statements.slice(index, index + size));
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
