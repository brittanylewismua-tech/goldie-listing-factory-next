import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { EVIDENCE_FRESH_DAYS } from "@/app/momentum-cohort";

/**
 * WHOSE REVIEWS ARE THESE, ACTUALLY.
 *
 * I reported that all 500 stored reviews belong to Brittany's own shop. I did
 * not check. `shop_reviews` is keyed by shop id and holds rows for any shop
 * Goldie has read — her own and watched competitor shops both land in the same
 * table — so "all of them are hers" was an assumption dressed as a finding.
 *
 * This separates the evidence classes rather than merging them, and answers
 * the specific question that matters to the scanner: how many listings with
 * verified momentum also carry a review.
 *
 * No review text, buyer name or listing title is returned. Counts only.
 */
export const GET = withErrorLog("design-scanner-review-audit", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);
  const ask = async <T>(sql: string, ...args: unknown[]) =>
    db.prepare(sql).bind(...args).all<T>()
      .catch(error => ({ results: [] as T[],
        error: error instanceof Error ? error.message : "failed" }));

  /* Which shops the rows actually belong to, and which of those Goldie
     considers its own connection versus a watched shop. */
  const byShop = await ask<{ shopId: number; reviews: number; listings: number;
    oldest: number; newest: number }>(
    `SELECT shop_id AS shopId, COUNT(*) AS reviews,
            COUNT(DISTINCT listing_id) AS listings,
            MIN(created_at) AS oldest, MAX(created_at) AS newest
       FROM shop_reviews GROUP BY shop_id ORDER BY reviews DESC`);

  const connected = await ask<{ shopId: number }>(
    `SELECT DISTINCT shop_id AS shopId FROM etsy_connections`);
  const watched = await ask<{ shopId: number; highWater: number; bootstrapped: number }>(
    `SELECT shop_id AS shopId, review_high_water AS highWater,
            reviews_bootstrapped AS bootstrapped FROM watched_shops`);

  const ownShops = new Set((connected.results ?? []).map(row => Number(row.shopId)));
  const watchedShops = new Set((watched.results ?? []).map(row => Number(row.shopId)));

  const split = { own: { reviews: 0, listings: 0, shops: 0 },
    watched: { reviews: 0, listings: 0, shops: 0 },
    unattributed: { reviews: 0, listings: 0, shops: 0 } };
  for (const row of byShop.results ?? []) {
    const bucket = ownShops.has(Number(row.shopId)) ? split.own
      : watchedShops.has(Number(row.shopId)) ? split.watched
      : split.unattributed;
    bucket.reviews += Number(row.reviews);
    bucket.listings += Number(row.listings);
    bucket.shops += 1;
  }

  /* The question the scanner actually asked: do listings with verified
     momentum carry reviews? A review never qualifies a listing on its own —
     this only says whether corroboration is available where it already does. */
  const since = new Date((now - EVIDENCE_FRESH_DAYS * 86_400) * 1000).toISOString();
  const intersection = await db.prepare(
    `SELECT COUNT(DISTINCT a.listing_id) AS listings,
            COUNT(DISTINCT a.shop_id) AS shops
       FROM listing_sales_activity a
       JOIN shop_reviews v ON v.listing_id = a.listing_id
      WHERE a.interval_id IS NOT NULL AND a.observed_at >= ?`)
    .bind(since).first<{ listings: number; shops: number }>().catch(() => null);

  /* Whether the momentum shops are watched at all — reviews cannot be ingested
     for a shop that is not in the shared collection. */
  const momentumShops = await db.prepare(
    `SELECT COUNT(DISTINCT a.shop_id) AS shops,
            SUM(CASE WHEN w.shop_id IS NOT NULL THEN 1 ELSE 0 END) AS watchedShops
       FROM (SELECT DISTINCT shop_id FROM listing_sales_activity
              WHERE interval_id IS NOT NULL AND observed_at >= ?) a
       LEFT JOIN watched_shops w ON w.shop_id = a.shop_id`)
    .bind(since).first<{ shops: number; watchedShops: number }>().catch(() => null);

  return NextResponse.json({
    /* The table is shared; the classes are not. Kept apart on purpose. */
    evidenceClasses: split,
    shopsHoldingReviews: (byShop.results ?? []).length,
    topShops: (byShop.results ?? []).slice(0, 10),
    connectedShops: [...ownShops],
    watchedShopsWithReviewState: watched.results ?? [],
    momentumIntersectingReviews: intersection,
    momentumShopCoverage: momentumShops,
  });
});
