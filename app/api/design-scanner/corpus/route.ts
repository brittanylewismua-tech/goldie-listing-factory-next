import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { measure, readiness, type Row } from "@/app/corpus-measure";
import { EVIDENCE_FRESH_DAYS, SHOP_SHARE_CAP, MIN_COHORT } from "@/app/momentum-cohort";

/**
 * MEASURE THE REFERENCE CORPUS BEFORE BUILDING ON IT.
 *
 * Owner-only, read-only, no paid call. It reads the sales-linked evidence
 * Market Watch has already earned and reports what is actually there — not
 * what a cohort would need there to be.
 *
 * No listing titles, shop names, URLs or review text leave this endpoint.
 * Shop ids appear only as concentration counts, which is what a cap needs and
 * is nothing a member ever sees.
 */
export const GET = withErrorLog("design-scanner-corpus", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);
  const since = new Date((now - 365 * 86_400) * 1000).toISOString();

  /*
    One row per listing that has ever been credited with a sale-linked
    movement, with the evidence counted alongside it. `interval_id` is what
    makes a movement corroborated — a row without one was never tied to a
    confirmed increase in the shop's own sold counter.
  */
  const rows = await db.prepare(
    `SELECT a.listing_id      AS listingId,
            a.shop_id         AS shopId,
            MAX(a.observed_at) AS observedAt,
            SUM(a.units)      AS units,
            COUNT(DISTINCT a.interval_id) AS intervals,
            (SELECT reason FROM listing_sales_activity r
              WHERE r.listing_id = a.listing_id ORDER BY r.observed_at DESC LIMIT 1) AS reason,
            (SELECT taxonomy_id FROM shop_listings l WHERE l.listing_id = a.listing_id) AS taxonomyId,
            /* The most recent snapshot that CARRIED an image, not the most
               recent snapshot. The bulk poller does not request images, so
               taking the latest row reports "no image" for every listing a
               poll has touched since its inspection — which is all of them. */
            (SELECT image_hash FROM listing_snapshots s
              WHERE s.listing_id = a.listing_id AND s.image_hash <> ''
              ORDER BY s.observed_at DESC LIMIT 1) AS imageHash,
            (SELECT COUNT(*) FROM shop_reviews v
              WHERE v.listing_id = a.listing_id AND v.created_at >= ?) AS reviewsRecently
       FROM listing_sales_activity a
      WHERE a.interval_id IS NOT NULL
      GROUP BY a.listing_id, a.shop_id`)
    .bind(now - EVIDENCE_FRESH_DAYS * 86_400)
    .all<{
      listingId: number; shopId: number; observedAt: string; units: number;
      intervals: number; reason: string | null; taxonomyId: number | null;
      imageHash: string | null; reviewsRecently: number;
    }>()
    .catch(error => ({ results: [], error: error instanceof Error ? error.message : "failed" }));

  const failed = (rows as { error?: string }).error;
  if (failed) return NextResponse.json({ error: failed }, { status: 500 });

  const shaped: Row[] = (rows.results ?? []).map(record => ({
    listingId: record.listingId, shopId: record.shopId,
    taxonomyId: record.taxonomyId ?? null,
    units: Number(record.units) || 0,
    reason: record.reason ?? "",
    observedAt: Math.floor(Date.parse(record.observedAt) / 1000) || 0,
    intervals: Number(record.intervals) || 0,
    reviewsRecently: Number(record.reviewsRecently) || 0,
    imageHash: record.imageHash ?? "",
  }));

  const measurement = measure(shaped, now,
    { freshDays: EVIDENCE_FRESH_DAYS, cap: SHOP_SHARE_CAP });

  /* How much of the corpus exists at all, so a small measurement can be told
     apart from a broken query. */
  const totals = await db.prepare(
    `SELECT (SELECT COUNT(*) FROM listing_sales_activity) AS activity,
            (SELECT COUNT(*) FROM listing_sales_activity WHERE interval_id IS NOT NULL) AS corroborated,
            (SELECT MIN(observed_at) FROM listing_sales_activity) AS oldestActivity,
            (SELECT MAX(observed_at) FROM listing_sales_activity) AS newestActivity,
            (SELECT COUNT(*) FROM shop_listings) AS listings,
            (SELECT COUNT(*) FROM listing_snapshots) AS snapshots,
            (SELECT COUNT(*) FROM shop_reviews) AS reviews,
            (SELECT COUNT(DISTINCT listing_id) FROM shop_reviews WHERE listing_id IS NOT NULL) AS reviewedListings,
            (SELECT COUNT(*) FROM shop_sales_intervals) AS intervals`)
    .first<Record<string, number | string>>()
    .catch(() => null);

  /*
    Whether ANY image identity has ever been captured. `withUsableImage: 0`
    could mean the corpus has no images or that this query is wrong, and those
    are very different problems.
  */
  const images = await db.prepare(
    `SELECT COUNT(*) AS snapshotsWithImage,
            COUNT(DISTINCT listing_id) AS listingsWithImage
       FROM listing_snapshots WHERE image_hash <> ''`)
    .first<Record<string, number>>()
    .catch(() => null);

  return NextResponse.json({
    window: { freshDays: EVIDENCE_FRESH_DAYS, capPerShop: SHOP_SHARE_CAP, minimumCohort: MIN_COHORT },
    corpus: totals, images, measurement, readiness: readiness(measurement, { minimum: MIN_COHORT }),
    since,
  });
});
