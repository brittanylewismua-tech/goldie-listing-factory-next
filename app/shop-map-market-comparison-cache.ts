/** Member-scoped, short-lived evidence cache for public Etsy comparisons. */
export async function ensureMarketComparisonCache(db:D1Database){
  await db.prepare("CREATE TABLE IF NOT EXISTS shop_map_market_comparison_cache (user_id TEXT NOT NULL,shop_id INTEGER NOT NULL,listing_id INTEGER NOT NULL,source_title TEXT NOT NULL,payload TEXT NOT NULL,checked_at INTEGER NOT NULL,PRIMARY KEY(user_id,shop_id,listing_id))").run();
}
