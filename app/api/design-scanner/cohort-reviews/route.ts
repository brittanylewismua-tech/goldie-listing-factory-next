import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { ingestReviews } from "@/app/shop-watch";
import { normalizeNiche, intersect, type Candidate } from "@/app/niche-cohort";
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
  const phrase = (url.searchParams.get("q") ?? "").trim();
  if (!phrase) return NextResponse.json({ error: "Give a niche as ?q=" }, { status: 400 });
  const dryRun = url.searchParams.get("apply") !== "1";
  /* A hard ceiling on the Etsy budget this may consume in one invocation. */
  const maxShops = Math.max(1, Math.min(20, Number(url.searchParams.get("shops")) || 8));

  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);
  const since = new Date((now - EVIDENCE_FRESH_DAYS * 86_400) * 1000).toISOString();

  const corpus = await db.prepare(
    `SELECT r.listing_id AS listingId, a.shop_id AS shopId, r.title AS title, r.tags AS tags
       FROM reference_images r
       JOIN (SELECT DISTINCT listing_id, shop_id FROM listing_sales_activity
              WHERE interval_id IS NOT NULL AND observed_at >= ?) a
         ON a.listing_id = r.listing_id
      WHERE r.outcome = 'recovered'`)
    .bind(since)
    .all<{ listingId: number; shopId: number; title: string; tags: string }>();

  const { terms } = normalizeNiche(phrase);
  const candidates: Candidate[] = (corpus.results ?? []).map(row => ({
    listingId: Number(row.listingId), shopId: Number(row.shopId),
    title: String(row.title ?? ""), tags: String(row.tags ?? "").split("|").filter(Boolean),
  }));
  const members = intersect(candidates,
    new Set(candidates.map(row => row.listingId)), terms).members;
  const cohortShops = [...new Set(members.map(member => member.shopId))];

  const watched = await db.prepare(
    `SELECT shop_id AS shopId, review_high_water AS highWater,
            reviews_bootstrapped AS bootstrapped FROM watched_shops`)
    .all<{ shopId: number; highWater: number; bootstrapped: number }>()
    .catch(() => ({ results: [] as Array<{ shopId: number; highWater: number; bootstrapped: number }> }));
  const already = new Map((watched.results ?? []).map(row => [Number(row.shopId), row]));

  const alreadyCollected = cohortShops.filter(shopId => already.has(shopId));
  const wouldBeNew = cohortShops.filter(shopId => !already.has(shopId));

  if (dryRun)
    return NextResponse.json({
      niche: phrase, cohortListings: members.length, cohortShops: cohortShops.length,
      alreadyInSharedCollection: alreadyCollected.length,
      wouldJoinCollection: wouldBeNew.length,
      /* What applying would actually cost, before it is spent. */
      estimatedEtsyCalls: Math.min(maxShops, cohortShops.length),
      note: "Dry run. Reviews are supporting evidence only and never qualify a listing.",
    });

  /*
    Incremental only. `ingestReviews` reads the shop's own high-water mark and
    asks Etsy for `min_created` from there, so a shop already collected returns
    only what is new and a shop nobody has read is capped at its bootstrap.
  */
  let calls = 0;
  let stored = 0;
  const failures: string[] = [];
  for (const shopId of cohortShops.slice(0, maxShops)) {
    if (!already.has(shopId))
      await db.prepare(
        `INSERT INTO watched_shops (shop_id, shop_name, url, added_at)
         VALUES (?,?,?,?) ON CONFLICT(shop_id) DO NOTHING`)
        .bind(shopId, "", "", new Date().toISOString()).run();
    try {
      const outcome = await ingestReviews(shopId, { maxCalls: 2 });
      calls += outcome.calls;
      stored += outcome.stored;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "ingest failed");
    }
  }

  const corroborated = await db.prepare(
    `SELECT COUNT(DISTINCT v.listing_id) AS listings FROM shop_reviews v
      JOIN listing_sales_activity a ON a.listing_id = v.listing_id
     WHERE a.interval_id IS NOT NULL AND a.observed_at >= ?`)
    .bind(since).first<{ listings: number }>().catch(() => null);

  return NextResponse.json({
    niche: phrase, cohortShops: cohortShops.length,
    shopsProcessed: Math.min(maxShops, cohortShops.length),
    joinedCollection: wouldBeNew.length, etsyCalls: calls, reviewsStored: stored,
    momentumListingsNowCorroborated: corroborated?.listings ?? 0,
    failures: failures.slice(0, 3),
  });
});
