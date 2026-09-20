import { env } from "cloudflare:workers";
export { decodeEntities } from "./shop-map-worlds.ts";
export { performanceFrom, listingAgeDays, type Performance } from "./shop-map-performance.ts";

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
      image_url TEXT NOT NULL DEFAULT '',
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
  try {
    await db().prepare(`ALTER TABLE shop_map_listings ADD COLUMN image_url TEXT NOT NULL DEFAULT ''`).run();
  } catch (error) {
    if (!/duplicate column/i.test(error instanceof Error ? error.message : "")) throw error;
  }
  await db().prepare(
    `CREATE INDEX IF NOT EXISTS shop_map_sales_listing
       ON shop_map_listing_sales (user_id, shop_id, listing_id, sold_at)`).run();
}
