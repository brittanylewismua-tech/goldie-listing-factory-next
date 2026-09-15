import { env } from "cloudflare:workers";

/**
 * THE SELLER'S OWN LISTINGS, AND WHAT THEY ACTUALLY DID.
 *
 * Sales come from Etsy transactions and from nothing else. Reviews, views,
 * favourites and inventory movement are real observations about a listing and
 * they are stored as such — but none of them is a sale, and none of them is
 * ever allowed to become one. A shop where views are treated as interest and
 * interest is treated as demand ends up with a map of what people looked at.
 *
 * A field Etsy does not expose stays absent. A zero would be indistinguishable
 * from a measurement.
 */
const db = () => (env as unknown as { DB: D1Database }).DB;

export type ListingState = "active" | "inactive" | "sold_out" | "expired" | "draft" | "unknown";

export async function ensureListingTables() {
  await db().batch([
    db().prepare(`CREATE TABLE IF NOT EXISTS shop_map_listings (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      listing_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      shop_section TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'unknown',
      created_at INTEGER,
      updated_at INTEGER,
      views INTEGER,
      favorites INTEGER,
      printify_product_id TEXT NOT NULL DEFAULT '',
      printify_blueprint_id INTEGER,
      product_family TEXT NOT NULL DEFAULT '',
      artwork_hash TEXT NOT NULL DEFAULT '',
      ingested_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, shop_id, listing_id))`),
    db().prepare(`CREATE TABLE IF NOT EXISTS shop_map_listing_sales (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      listing_id INTEGER NOT NULL,
      transaction_id INTEGER NOT NULL,
      receipt_id INTEGER,
      quantity INTEGER NOT NULL DEFAULT 0,
      price_minor INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      sold_at INTEGER NOT NULL,
      refunded INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, shop_id, transaction_id))`),
    db().prepare(`CREATE TABLE IF NOT EXISTS shop_map_world_overrides (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      listing_id INTEGER NOT NULL,
      world_ids TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      reversed_at INTEGER,
      PRIMARY KEY (user_id, shop_id, listing_id))`),
    db().prepare(`CREATE TABLE IF NOT EXISTS shop_map_world_labels (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      world_id TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      merged_into TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, shop_id, world_id))`),
    db().prepare(`CREATE TABLE IF NOT EXISTS shop_map_cost_rules (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      product_family TEXT NOT NULL,
      cost_minor INTEGER NOT NULL DEFAULT 0,
      shipping_minor INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      confirmed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, shop_id, product_family))`),
  ]);
  await db().prepare(
    `CREATE INDEX IF NOT EXISTS shop_map_sales_listing
       ON shop_map_listing_sales (user_id, shop_id, listing_id, sold_at)`).run();
}

export type Performance = {
  listingId: number;
  lifetimeOrders: number;
  lifetimeUnits: number;
  lifetimeRevenueMinor: number;
  yearOrders: number;
  yearRevenueMinor: number;
  monthOrders: number;
  monthRevenueMinor: number;
  last30Orders: number;
  last30RevenueMinor: number;
  last90Orders: number;
  last90RevenueMinor: number;
  refundedOrders: number;
  refundedMinor: number;
  largestOrderMinor: number;
};

/**
 * Performance from transactions only.
 *
 * Every figure here is a count or a sum of real Etsy transaction rows. There
 * is deliberately no parameter for views, favourites or reviews: they cannot
 * reach this calculation even by mistake.
 */
export function performanceFrom(
  sales: Array<{ listingId: number; quantity: number; priceMinor: number;
    soldAt: number; refunded: boolean }>,
  { now, monthFrom, monthTo, yearFrom }:
  { now: number; monthFrom: number; monthTo: number; yearFrom: number },
): Map<number, Performance> {
  const out = new Map<number, Performance>();
  const blank = (listingId: number): Performance => ({
    listingId, lifetimeOrders: 0, lifetimeUnits: 0, lifetimeRevenueMinor: 0,
    yearOrders: 0, yearRevenueMinor: 0, monthOrders: 0, monthRevenueMinor: 0,
    last30Orders: 0, last30RevenueMinor: 0, last90Orders: 0, last90RevenueMinor: 0,
    refundedOrders: 0, refundedMinor: 0, largestOrderMinor: 0,
  });

  for (const sale of sales) {
    const row = out.get(sale.listingId) ?? blank(sale.listingId);
    const amount = sale.priceMinor * Math.max(1, sale.quantity);
    row.lifetimeOrders += 1;
    row.lifetimeUnits += Math.max(1, sale.quantity);
    row.lifetimeRevenueMinor += amount;
    if (amount > row.largestOrderMinor) row.largestOrderMinor = amount;
    if (sale.refunded) { row.refundedOrders += 1; row.refundedMinor += amount; }
    if (sale.soldAt >= yearFrom) { row.yearOrders += 1; row.yearRevenueMinor += amount; }
    if (sale.soldAt >= monthFrom && sale.soldAt <= monthTo) {
      row.monthOrders += 1; row.monthRevenueMinor += amount;
    }
    if (sale.soldAt >= now - 30 * 86_400) { row.last30Orders += 1; row.last30RevenueMinor += amount; }
    if (sale.soldAt >= now - 90 * 86_400) { row.last90Orders += 1; row.last90RevenueMinor += amount; }
    out.set(sale.listingId, row);
  }
  return out;
}

/** Listing age in days, or null when Etsy did not give a creation date. */
export const listingAgeDays = (createdAt: number | null, now: number) =>
  createdAt ? Math.floor((now - createdAt) / 86_400) : null;
