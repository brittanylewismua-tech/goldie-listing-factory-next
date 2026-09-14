/**
 * THE CHEAPEST QUESTION IN THE SYSTEM: DID ANYTHING SELL?
 *
 * Reading fifteen thousand listings every few hours to find the handful that
 * moved is the wrong shape. Etsy hands us `transaction_sold_count` for a whole
 * shop for free, bundled with any listing read from that shop — so one listing
 * per shop, a hundred shops per call, answers "which corners of the corpus are
 * worth looking at right now" for about sixty-seven calls a pass.
 *
 * The shop is a SENSOR, never a subject. Nothing here is shown to a member,
 * and no member ever picks a shop to follow.
 *
 * WHAT IT PRODUCES. A shop whose sold count rose gets marked for inspection,
 * and the interval between the two readings is recorded with the full delta
 * unresolved. Inspection then explains as much of it as the evidence allows
 * and the rest stays honestly unexplained.
 */
import { env } from "cloudflare:workers";
import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { ensureMarketTables, openInterval } from "@/app/market-store";

const db = () => (env as unknown as { DB: D1Database }).DB;

/** Etsy takes a hundred listing ids per batch call; the sensor uses all of it. */
const BATCH = 100;
/** A pass covers the whole corpus, so it is bounded by shops, not by time. */
const DEFAULT_MAX_CALLS = 80;
/** After this many reads without the representative answering, pick another. */
const MISSES_BEFORE_REPLACEMENT = 3;

type ShopFacts = {
  shopId: number;
  soldCount: number | null;
  activeCount: number | null;
  reviewCount: number | null;
};

/**
 * Give every shop in the corpus a representative listing to be read through.
 *
 * Cheapest possible choice: an active listing we already track. Nothing is
 * fetched to make this decision.
 */
export async function assignRepresentatives(): Promise<number> {
  const result = await db()
    .prepare(
      `INSERT INTO shop_sensor_state (shop_id, representative_listing_id)
       SELECT shop_id, MIN(listing_id) FROM sold_watch
        WHERE shop_id IS NOT NULL AND state = 'active'
        GROUP BY shop_id
       ON CONFLICT(shop_id) DO UPDATE SET
         representative_listing_id = COALESCE(
           shop_sensor_state.representative_listing_id, excluded.representative_listing_id)`)
    .run();
  return Number(result.meta?.changes ?? 0);
}

/**
 * Replace a representative that has stopped answering.
 *
 * A listing goes away — sold out and delisted, taken down, expired — and the
 * shop behind it would go dark without anyone noticing. Three silent reads is
 * enough to call it: pick another active listing from the same shop, and if
 * there is none, leave the shop without a sensor rather than pretend.
 */
export async function replaceStaleRepresentatives(): Promise<number> {
  const stale = await db()
    .prepare(
      `SELECT shop_id, representative_listing_id FROM shop_sensor_state
        WHERE misses >= ? LIMIT 200`)
    .bind(MISSES_BEFORE_REPLACEMENT)
    .all<{ shop_id: number; representative_listing_id: number | null }>();

  let replaced = 0;
  for (const row of stale.results ?? []) {
    const next = await db()
      .prepare(
        `SELECT listing_id FROM sold_watch
          WHERE shop_id = ? AND state = 'active' AND listing_id <> COALESCE(?, 0)
          ORDER BY last_read DESC LIMIT 1`)
      .bind(row.shop_id, row.representative_listing_id)
      .first<{ listing_id: number }>();
    await db()
      .prepare(
        `UPDATE shop_sensor_state SET representative_listing_id = ?, misses = 0 WHERE shop_id = ?`)
      .bind(next?.listing_id ?? null, row.shop_id)
      .run();
    if (next) replaced += 1;
  }
  return replaced;
}

async function readBatch(listingIds: number[]): Promise<Map<number, ShopFacts>> {
  await waitForEtsyCapacity();
  const response = await fetch(
    `https://openapi.etsy.com/v3/application/listings/batch` +
    `?listing_ids=${listingIds.join(",")}&includes=Shop`,
    { headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(20_000) },
  );
  await recordEtsyCall(response, "search");
  if (!response.ok) return new Map();
  const body = await response.json() as {
    results?: Array<{ listing_id?: number; shop?: Record<string, unknown> | null }>;
  };
  const out = new Map<number, ShopFacts>();
  for (const listing of body.results ?? []) {
    const shop = listing.shop;
    if (!listing.listing_id || !shop) continue;
    out.set(Number(listing.listing_id), {
      shopId: Number(shop.shop_id),
      soldCount: shop.transaction_sold_count === undefined ? null : Number(shop.transaction_sold_count),
      activeCount: shop.listing_active_count === undefined ? null : Number(shop.listing_active_count),
      reviewCount: shop.review_count === undefined ? null : Number(shop.review_count),
    });
  }
  return out;
}

export type SensorPass = {
  shopsRead: number;
  shopsMoved: number;
  unitsSeen: number;
  reviewsMoved: number;
  calls: number;
  missing: number;
  firstReadings: number;
};

/**
 * One pass of the sensor.
 *
 * Ordered by how long it has been since each shop was read, so a bounded pass
 * still covers everything in rotation rather than favouring the same shops.
 */
export async function sensorPass(
  { maxCalls = DEFAULT_MAX_CALLS }: { maxCalls?: number } = {},
): Promise<SensorPass> {
  await ensureMarketTables();
  await assignRepresentatives();
  await replaceStaleRepresentatives();

  const pass: SensorPass = {
    shopsRead: 0, shopsMoved: 0, unitsSeen: 0, reviewsMoved: 0,
    calls: 0, missing: 0, firstReadings: 0,
  };

  const due = await db()
    .prepare(
      `SELECT shop_id, representative_listing_id, sold_count, review_count, observed_at
         FROM shop_sensor_state
        WHERE representative_listing_id IS NOT NULL
        ORDER BY observed_at IS NULL DESC, observed_at ASC
        LIMIT ?`)
    .bind(maxCalls * BATCH)
    .all<{
      shop_id: number; representative_listing_id: number;
      sold_count: number | null; review_count: number | null; observed_at: string | null;
    }>();
  type SensorRow = {
    shop_id: number; representative_listing_id: number;
    sold_count: number | null; review_count: number | null; observed_at: string | null;
  };
  const rows: SensorRow[] = due.results ?? [];
  if (!rows.length) return pass;

  const byListing = new Map<number, SensorRow>(
    rows.map(row => [Number(row.representative_listing_id), row] as const));

  for (let index = 0; index < rows.length && pass.calls < maxCalls; index += BATCH) {
    const slice = rows.slice(index, index + BATCH).map(row => Number(row.representative_listing_id));
    const facts = await readBatch(slice);
    pass.calls += 1;

    const observedAt = new Date().toISOString();
    const writes: D1PreparedStatement[] = [];

    for (const listingId of slice) {
      const row = byListing.get(listingId);
      if (!row) continue;
      const fact = facts.get(listingId);

      if (!fact) {
        /* Silence is data too: count it, and the replacement pass will act on
           it before the shop can go quietly dark. */
        pass.missing += 1;
        writes.push(db().prepare(
          `UPDATE shop_sensor_state SET misses = misses + 1 WHERE shop_id = ?`).bind(row.shop_id));
        continue;
      }

      pass.shopsRead += 1;
      const previousSold = row.sold_count;
      const soldDelta = previousSold === null || fact.soldCount === null
        ? 0 : fact.soldCount - previousSold;

      /*
        A FIRST READING IS NOT A SALE.

        The difference between "no previous number" and "a previous number of
        zero" has produced phantom sales in this codebase before. No previous
        reading means no interval, full stop.
      */
      if (previousSold === null) pass.firstReadings += 1;
      else if (soldDelta > 0) {
        pass.shopsMoved += 1;
        pass.unitsSeen += soldDelta;
        await openInterval(
          row.shop_id, row.observed_at ?? observedAt, observedAt, soldDelta);
      }

      if (row.review_count !== null && fact.reviewCount !== null && fact.reviewCount > row.review_count)
        pass.reviewsMoved += 1;

      writes.push(db().prepare(
        `UPDATE shop_sensor_state
            SET previous_sold_count = sold_count,
                previous_observed_at = observed_at,
                sold_count = ?, active_count = ?, review_count = ?,
                observed_at = ?, misses = 0,
                /* Marked for inspection only when the shop actually sold
                   something, and cleared by the inspector, not by us. */
                inspect_due = CASE WHEN ? > 0 THEN 1 ELSE inspect_due END
          WHERE shop_id = ?`)
        .bind(fact.soldCount, fact.activeCount, fact.reviewCount, observedAt,
          soldDelta, row.shop_id));
    }

    for (let at = 0; at < writes.length; at += 100)
      await db().batch(writes.slice(at, at + 100));
  }

  return pass;
}

/** How the sensor is doing, for the operations page. Never for a member. */
export async function sensorHealth(): Promise<{
  shops: number; withRepresentative: number; everRead: number;
  readInLastHour: number; awaitingInspection: number; withoutRepresentative: number;
}> {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const row = await db()
    .prepare(
      `SELECT COUNT(*) AS shops,
              SUM(CASE WHEN representative_listing_id IS NOT NULL THEN 1 ELSE 0 END) AS reps,
              SUM(CASE WHEN observed_at IS NOT NULL THEN 1 ELSE 0 END) AS read_ever,
              SUM(CASE WHEN observed_at >= ? THEN 1 ELSE 0 END) AS read_recent,
              SUM(inspect_due) AS due
         FROM shop_sensor_state`)
    .bind(hourAgo)
    .first<Record<string, number>>();
  return {
    shops: Number(row?.shops ?? 0),
    withRepresentative: Number(row?.reps ?? 0),
    everRead: Number(row?.read_ever ?? 0),
    readInLastHour: Number(row?.read_recent ?? 0),
    awaitingInspection: Number(row?.due ?? 0),
    withoutRepresentative: Number(row?.shops ?? 0) - Number(row?.reps ?? 0),
  };
}
