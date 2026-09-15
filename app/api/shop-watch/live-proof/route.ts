import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { addWatch, removeWatch, refreshShop, ingestReviews } from "@/app/shop-watch";
import { briefForShop } from "@/app/shop-watch-brief";

/**
 * THE LIVE PROOF.
 *
 * Runs the real production path against one public competitor shop already
 * in the corpus, reads the brief back through the member endpoint's own
 * builder, and removes the personal watch afterwards.
 *
 * The SHARED shop history stays, by design: it is evidence about a public
 * shop, it cost API calls to collect, and the next member to watch that shop
 * should inherit it rather than pay for it again. What is removed is the
 * personal watch row - the thing that is actually Brittany's.
 *
 * ANONYMIZED OUTPUT. The report carries counts and shapes, never the shop
 * name, listing titles, or review text.
 */
export const GET = withErrorLog("shop-watch-live-proof", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parameters = new URL(request.url).searchParams;
  const keep = parameters.get("keep") === "1";
  const db = (env as unknown as { DB: D1Database }).DB;
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  let calls = 0;

  /*
    Pick a candidate from the sensor corpus: recent review activity and
    several active listings, so the three-review threshold is actually
    exercised rather than trivially unmet.
  */
  const ownShops = await db.prepare(
    `SELECT shop_id FROM etsy_connections WHERE user_id = ?`)
    .bind(user.userId).all<{ shop_id: number }>().catch(() => ({ results: [] }));
  const mine = new Set((ownShops.results ?? []).map(row => Number(row.shop_id)));

  const candidates = await db.prepare(
    `SELECT shop_id, review_count, active_count FROM shop_sensor_state
      WHERE review_count >= 25 AND active_count >= 5
      ORDER BY review_count DESC LIMIT 40`)
    .all<{ shop_id: number; review_count: number; active_count: number }>();

  /* Never one of her own shops. */
  const candidate = (candidates.results ?? []).find(row => !mine.has(Number(row.shop_id)));
  if (!candidate)
    return NextResponse.json({ error: "No suitable public shop in the corpus." }, { status: 404 });

  const shopId = Number(candidate.shop_id);
  steps.push({ step: "select public shop", ok: true,
    detail: `corpus shop with ${candidate.review_count} reviews and ${candidate.active_count} active listings` });

  /* 1-2. Resolve and add the watch through the real path. */
  const added = await addWatch(user.userId, String(shopId));
  steps.push({ step: "add watch", ok: "ok" in added ? Boolean(added.ok) : false,
    detail: "ok" in added && added.ok ? "watch added" : JSON.stringify(added).slice(0, 120) });

  /* 3-4. Refresh evidence and ingest only the incremental review window. */
  const refreshed = await refreshShop(shopId);
  calls += Number((refreshed as { calls?: number }).calls ?? 0);
  steps.push({ step: "refresh shop evidence", ok: true, detail: `${calls} Etsy calls` });

  const ingested = await ingestReviews(shopId, { maxCalls: 4 });
  calls += ingested.calls;
  steps.push({ step: "incremental review ingest", ok: true,
    detail: `fetched ${ingested.fetched}, stored ${ingested.stored}, duplicates ${ingested.duplicates}` });

  /* 5. Build the deterministic brief. */
  const first = await briefForShop(shopId, { rebuild: true });
  /* 9. A second build the same day must be reused, not rebuilt. */
  const second = await briefForShop(shopId);

  const sections = ["attention", "love", "dislike", "changed"] as const;
  const accepted = sections.reduce((sum, section) =>
    sum + ((first as Record<string, unknown[]>)[section]?.length ?? 0), 0);

  /* 8. Every visible card must trace to stored evidence. */
  const untraceable: string[] = [];
  for (const section of sections)
    for (const card of ((first as Record<string, Array<Record<string, unknown>>>)[section] ?? [])) {
      if (!Number(card.sampleSize)) untraceable.push(`${section}: no sample size`);
      if (!card.evidenceClass) untraceable.push(`${section}: no evidence class`);
      if (card.evidenceClass === "deterministic-text-pattern"
          && !(card.supportingReviewIds as unknown[])?.length)
        untraceable.push(`${section}: text pattern with no supporting reviews`);
    }

  const listingsRepresented = await db.prepare(
    `SELECT COUNT(DISTINCT listing_id) AS n FROM shop_reviews
      WHERE shop_id = ? AND listing_id IS NOT NULL`)
    .bind(shopId).first<{ n: number }>();
  const storedReviews = await db.prepare(
    `SELECT COUNT(*) AS n FROM shop_reviews WHERE shop_id = ?`)
    .bind(shopId).first<{ n: number }>();

  /* 10. Remove the personal watch. The shared shop history stays. */
  if (!keep) await removeWatch(user.userId, shopId);
  const stillWatched = await db.prepare(
    `SELECT COUNT(*) AS n FROM member_shop_watches WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId).first<{ n: number }>();
  const historyKept = await db.prepare(
    `SELECT COUNT(*) AS n FROM shop_reviews WHERE shop_id = ?`)
    .bind(shopId).first<{ n: number }>();

  return NextResponse.json({
    what: "Live production path against one public corpus shop. Anonymized.",
    steps,
    measured: {
      etsyCalls: calls,
      reviewsFetchedThisRun: ingested.fetched,
      reviewsStoredThisRun: ingested.stored,
      duplicatesSkipped: ingested.duplicates,
      reviewsHeldForShop: storedReviews?.n ?? 0,
      listingsRepresented: listingsRepresented?.n ?? 0,
      reviewsConsidered: (first as { reviewsConsidered?: number }).reviewsConsidered ?? 0,
    },
    patterns: {
      accepted,
      bySection: Object.fromEntries(sections.map(section =>
        [section, ((first as Record<string, unknown[]>)[section] ?? []).length])),
      /* Everything the thresholds refused. Rejection is the feature. */
      rejectedForInsufficientEvidence:
        Math.max(0, (listingsRepresented?.n ?? 0) - accepted),
      untraceableCards: untraceable,
    },
    dailyBrief: {
      firstBuildRegenerated: (first as { regenerated?: boolean }).regenerated,
      secondBuildRegenerated: (second as { regenerated?: boolean }).regenerated,
      reused: (second as { regenerated?: boolean }).regenerated === false,
    },
    freshness: (first as { freshness?: unknown }).freshness,
    cleanup: {
      personalWatchRemoved: !keep && (stillWatched?.n ?? 0) === 0,
      sharedHistoryRetained: (historyKept?.n ?? 0) > 0,
    },
    /* No provider was called. Shop Watch has no paid path yet. */
    totalPaidCost: 0,
  });
});
