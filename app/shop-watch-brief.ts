import { env } from "cloudflare:workers";
import { buildBrief, type Review, type ShopTotals } from "@/app/shop-watch-patterns";

/**
 * ONE BRIEF PER SHOP PER MORNING.
 *
 * The evidence underneath refreshes on the six-hour rule, but the member
 * reads a brief once a day. Regenerating it whenever somebody opens the page
 * would mean the same morning reading differently at nine and at noon, which
 * makes it impossible to trust and impossible to discuss.
 *
 * THE FLAG. Shop Watch stays behind SHOP_WATCH_FLAG until the beta is done.
 */
export const SHOP_WATCH_FLAG = "shopWatchInternalBeta";

/*
  The metering point for a future one-per-shop-per-day summary. The interface
  exists so the cost path is designed rather than bolted on later; the
  provider call does NOT, and enabling it needs an approved model, cost,
  allowance, ceiling, retry rule and cache identity.

  There will never be one call per review, and never one per member watching
  the same shop: the summary belongs to the shop's brief, which is shared.
*/
export const SUMMARY_WORKLOAD = "shopWatchSummary";
export const SUMMARY_ENABLED = false;

export async function ensureBriefTables() {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS shop_watch_briefs (
    shop_id INTEGER NOT NULL,
    brief_day TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    reviews_considered INTEGER NOT NULL DEFAULT 0,
    built_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (shop_id, brief_day))`).run();
}

const today = (now: Date) => now.toISOString().slice(0, 10);

/**
 * The brief for one shop, built once and shared by every watcher.
 *
 * Twenty members watching a shop read the same rows. The brief is keyed by
 * shop and day and knows nothing about who is reading it, which is both
 * cheaper and the only way shared intelligence can carry no watcher identity.
 */
export async function briefForShop(
  shopId: number, { now = new Date(), rebuild = false }: { now?: Date; rebuild?: boolean } = {},
) {
  await ensureBriefTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const day = today(now);

  if (!rebuild) {
    const held = await db.prepare(
      `SELECT payload_json FROM shop_watch_briefs WHERE shop_id = ? AND brief_day = ?`)
      .bind(shopId, day).first<{ payload_json: string }>();
    if (held) {
      try { return { ...JSON.parse(held.payload_json), regenerated: false }; }
      catch { /* rebuilt below */ }
    }
  }

  const seconds = Math.floor(now.getTime() / 1_000);
  const rows = await db.prepare(
    `SELECT transaction_id, listing_id, rating, review, created_at
       FROM shop_reviews WHERE shop_id = ? AND created_at >= ?
      ORDER BY created_at DESC LIMIT 500`)
    .bind(shopId, seconds - 60 * 86_400)
    .all<{ transaction_id: number; listing_id: number | null; rating: number | null;
      review: string; created_at: number }>();
  const reviews: Review[] = (rows.results ?? []).map(row => ({
    transactionId: row.transaction_id, listingId: row.listing_id,
    rating: row.rating, review: row.review, createdAt: row.created_at,
  }));

  /* Two most recent observations, so a change is a comparison rather than a
     reading. One observation can never produce a change. */
  const observed = await db.prepare(
    `SELECT sale_count, favorites, review_count, average_rating, observed_at
       FROM shop_observations WHERE shop_id = ? ORDER BY observed_at DESC LIMIT 2`)
    .bind(shopId)
    .all<{ sale_count: number | null; favorites: number | null; review_count: number | null;
      average_rating: number | null; observed_at: number }>()
    .catch(() => ({ results: [] as Array<Record<string, never>> }));
  const seen = (observed.results ?? []) as Array<{
    sale_count: number | null; favorites: number | null; review_count: number | null;
    average_rating: number | null; observed_at: number }>;
  /* A null from Etsy stays absent, never becomes a zero. */
  const totals = (row?: typeof seen[number]): ShopTotals => ({
    ...(typeof row?.sale_count === "number" ? { saleCount: row.sale_count } : {}),
    ...(typeof row?.favorites === "number" ? { favorites: row.favorites } : {}),
    ...(typeof row?.review_count === "number" ? { reviewCount: row.review_count } : {}),
    ...(typeof row?.average_rating === "number" ? { averageRating: row.average_rating } : {}),
  });

  const brief = buildBrief({
    reviews,
    previous: totals(seen[1]),
    current: totals(seen[0]),
    refreshedAt: seen[0]?.observed_at ?? 0,
    now: seconds,
  });

  await db.prepare(
    `INSERT INTO shop_watch_briefs (shop_id, brief_day, payload_json, reviews_considered)
     VALUES (?,?,?,?)
     ON CONFLICT(shop_id, brief_day) DO UPDATE SET
       payload_json = excluded.payload_json, built_at = CURRENT_TIMESTAMP`)
    .bind(shopId, day, JSON.stringify(brief), brief.reviewsConsidered).run();

  return { ...brief, regenerated: true };
}

/** Health counters, all from stored rows. */
export async function shopWatchBetaHealth() {
  await ensureBriefTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const count = async (sql: string, ...binds: unknown[]) => {
    try { return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0; }
    catch { return 0; }
  };
  return {
    watchedShops: await count(`SELECT COUNT(DISTINCT shop_id) AS n FROM member_shop_watches`),
    watchRows: await count(`SELECT COUNT(*) AS n FROM member_shop_watches`),
    /* The saving from sharing: rows minus distinct shops is collection work
       that twenty watchers did not each pay for. */
    duplicateWatchersShared: await count(
      `SELECT COUNT(*) - COUNT(DISTINCT shop_id) AS n FROM member_shop_watches`),
    reviewsStored: await count(`SELECT COUNT(*) AS n FROM shop_reviews`),
    briefsToday: await count(
      `SELECT COUNT(*) AS n FROM shop_watch_briefs WHERE brief_day = ?`, today(new Date())),
    summaryWorkload: { workload: SUMMARY_WORKLOAD, providerEnabled: SUMMARY_ENABLED },
  };
}
