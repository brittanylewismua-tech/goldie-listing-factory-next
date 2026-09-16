import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { ingestReviews, shopWatchRoom } from "@/app/shop-watch";
import { planFetch, pagesFor, type ShopCandidate, type PriorityClass }
  from "@/app/review-priority";
import { EVIDENCE_FRESH_DAYS } from "@/app/momentum-cohort";

/**
 * REVIEWS FOR THE SHOPS A COHORT IS ALREADY MADE OF.
 *
 * Reviews are SUPPORTING evidence. They never qualify a listing — a listing
 * with reviews and no observed movement stays out, exactly as before. This
 * only enriches listings that already earned their place.
 *
 * NO DUPLICATE COLLECTION WORK. A shop already in `watched_shops` is already
 * being collected by whoever added it; adding it again is a no-op on the same
 * row, and the shared high-water mark means the second caller fetches only
 * what the first has not. No full histories: `min_created` is always the
 * stored high-water mark.
 *
 * Owner-only, bounded, and never called during a scan.
 */
export const maxDuration = 300;

export const POST = withErrorLog("design-scanner-cohort-reviews", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const url = new URL(request.url);
  /* The niche parameter is no longer required: priority now spans saved
     niches, repeated movement, scanner cohorts and followed shops, so the
     queue is built from all of them rather than from one phrase. */
  const dryRun = url.searchParams.get("apply") !== "1";
  /* A hard ceiling on the Etsy budget this may consume in one invocation. */
  const maxShops = Math.max(1, Math.min(20, Number(url.searchParams.get("shops")) || 8));

  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);
  const since = new Date((now - EVIDENCE_FRESH_DAYS * 86_400) * 1000).toISOString();

  /*
    EVERY PRIORITY CLASS, NOT JUST ONE NICHE.

    The first version took the shops behind one niche cohort. The product's
    order is broader and is about member attention: a saved niche first, then
    listings that moved more than once, then live scanner cohorts, then shops a
    member explicitly follows, then whatever else has moved at all.
  */
  const candidates: ShopCandidate[] = [];
  const add = (shopId: number, priority: PriorityClass) => {
    if (shopId) candidates.push({ shopId, priority, alreadyCollected: false, highWater: 0 });
  };

  /* 1 · shops inside saved niche watches */
  const savedShops = await db.prepare(
    `SELECT DISTINCT c.shop_id AS shopId
       FROM niche_candidates c
      WHERE c.state IN ('monitoring','momentum','repeated-momentum')`)
    .all<{ shopId: number }>().catch(() => ({ results: [] as Array<{ shopId: number }> }));
  for (const row of savedShops.results ?? []) add(Number(row.shopId), "saved-niche");

  /* 2 · shops with listings that moved in more than one interval */
  const repeated = await db.prepare(
    `SELECT shop_id AS shopId FROM listing_sales_activity
      WHERE interval_id IS NOT NULL AND observed_at >= ?
      GROUP BY listing_id, shop_id HAVING COUNT(DISTINCT interval_id) >= 2`)
    .bind(since).all<{ shopId: number }>()
    .catch(() => ({ results: [] as Array<{ shopId: number }> }));
  for (const row of repeated.results ?? []) add(Number(row.shopId), "repeated-movement");

  /* 3 · shops inside a live Design Scanner cohort */
  const cohort = await db.prepare(
    `SELECT DISTINCT a.shop_id AS shopId
       FROM reference_analysis r
       JOIN listing_sales_activity a ON a.listing_id = r.listing_id
      WHERE a.interval_id IS NOT NULL AND a.observed_at >= ?`)
    .bind(since).all<{ shopId: number }>()
    .catch(() => ({ results: [] as Array<{ shopId: number }> }));
  for (const row of cohort.results ?? []) add(Number(row.shopId), "scanner-cohort");

  /* 4 · shops a member explicitly follows */
  const followed = await db.prepare(
    `SELECT DISTINCT shop_id AS shopId FROM member_shop_watches WHERE paused = 0`)
    .all<{ shopId: number }>().catch(() => ({ results: [] as Array<{ shopId: number }> }));
  for (const row of followed.results ?? []) add(Number(row.shopId), "shop-watch");

  /* 5 · anything else that has moved */
  const rest = await db.prepare(
    `SELECT DISTINCT shop_id AS shopId FROM listing_sales_activity
      WHERE interval_id IS NOT NULL AND observed_at >= ? LIMIT 2000`)
    .bind(since).all<{ shopId: number }>()
    .catch(() => ({ results: [] as Array<{ shopId: number }> }));
  for (const row of rest.results ?? []) add(Number(row.shopId), "other-momentum");

  /* Who is already collected, and how far their evidence reaches. */
  const watched = await db.prepare(
    `SELECT shop_id AS shopId, review_high_water AS highWater FROM watched_shops`)
    .all<{ shopId: number; highWater: number }>()
    .catch(() => ({ results: [] as Array<{ shopId: number; highWater: number }> }));
  const known = new Map((watched.results ?? [])
    .map(row => [Number(row.shopId), Number(row.highWater) || 0]));
  for (const candidate of candidates) {
    candidate.alreadyCollected = known.has(candidate.shopId);
    candidate.highWater = known.get(candidate.shopId) ?? 0;
  }

  /* The budget is Shop Watch's own allowance, checked before anything runs. */
  const room = await shopWatchRoom().catch(() => 0);
  const plan = planFetch(candidates, { maxShops, budget: room });

  const byClass: Record<string, number> = {};
  for (const candidate of candidates)
    byClass[candidate.priority] = (byClass[candidate.priority] ?? 0) + 1;

  if (dryRun)
    return NextResponse.json({
      eligibleByPriority: byClass,
      distinctShops: new Set(candidates.map(row => row.shopId)).size,
      alreadyInSharedCollection: plan.fetch.filter(row => row.alreadyCollected).length,
      wouldJoinCollection: plan.fetch.filter(row => !row.alreadyCollected).length,
      wouldFetch: plan.fetch.length,
      deferred: plan.deferred,
      estimatedEtsyCalls: plan.estimatedCalls,
      budgetAvailable: room,
      note: "Dry run. Reviews are supporting evidence only and never qualify a listing.",
    });

  /*
    Incremental only. `ingestReviews` reads the shop's own high-water mark and
    asks Etsy for `min_created` from there, so a shop already collected returns
    only what is new and a shop nobody has read is capped at its bootstrap.
  */
  let calls = 0;
  let stored = 0;
  let duplicates = 0;
  let initial = 0;
  let incremental = 0;
  const failures: string[] = [];
  const admitted: number[] = [];

  for (const candidate of plan.fetch) {
    if (!candidate.alreadyCollected) {
      /* Joining the SHARED collection. Another member watching this shop
         later costs nothing, because the shop is the unit. */
      await db.prepare(
        `INSERT INTO watched_shops (shop_id, shop_name, url, added_at)
         VALUES (?,?,?,?) ON CONFLICT(shop_id) DO NOTHING`)
        .bind(candidate.shopId, "", "", new Date().toISOString()).run();
      admitted.push(candidate.shopId);
    }
    try {
      /* Bounded first read, incremental after — decided from the shop's own
         high-water mark, never from a full history pull. */
      const outcome = await ingestReviews(candidate.shopId,
        { maxCalls: pagesFor(candidate) });
      calls += outcome.calls;
      stored += outcome.stored;
      duplicates += outcome.duplicates;
      if (candidate.highWater > 0) incremental += 1; else initial += 1;
    } catch (error) {
      /* A failed shop leaves its previous evidence untouched. */
      failures.push(error instanceof Error ? error.message : "ingest failed");
    }
  }

  /* Momentum listings that now carry review corroboration. A review never
     created any of this: it only sits alongside movement already confirmed. */
  const corroborated = await db.prepare(
    `SELECT COUNT(DISTINCT v.listing_id) AS listings, COUNT(DISTINCT a.shop_id) AS shops
       FROM shop_reviews v
       JOIN listing_sales_activity a ON a.listing_id = v.listing_id
      WHERE a.interval_id IS NOT NULL AND a.observed_at >= ?`)
    .bind(since).first<{ listings: number; shops: number }>().catch(() => null);

  const evidence = await db.prepare(
    `SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest, COUNT(*) AS total
       FROM shop_reviews`)
    .first<{ oldest: number; newest: number; total: number }>().catch(() => null);

  return NextResponse.json({
    eligibleByPriority: byClass,
    shopsFetched: plan.fetch.length,
    shopsAdmitted: admitted.length,
    deferred: plan.deferred,
    initialRetrievals: initial,
    incrementalRetrievals: incremental,
    reviewsStored: stored,
    duplicatesSkipped: duplicates,
    etsyCalls: calls,
    budgetAvailable: room,
    momentumListingsWithReviews: corroborated?.listings ?? 0,
    shopsWithCorroboration: corroborated?.shops ?? 0,
    reviewEvidence: evidence,
    failures: failures.slice(0, 3),
    note: "Reviews are supporting buyer evidence. They never qualify momentum, "
      + "a review timestamp is never a sale timestamp, and a review count is "
      + "never a sales count.",
  });
});
