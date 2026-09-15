import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { MAX_NICHE_WATCHES } from "@/app/niche-watch-store";
import { watchLimit, shopWatchRoom } from "@/app/shop-watch";
import { etsyQpdLimit, etsyBudget } from "@/app/api/etsy/client";

/**
 * WHAT A WATCH ACTUALLY COSTS.
 *
 * The number that decides the Niche Watch limit, measured from the
 * architecture rather than assumed from the shape of the feature.
 *
 * A saved niche does NOT buy an Etsy sweep. Matching runs against the shared
 * corpus that Shop Sensor and the listing poller already collect for every
 * member at once, so one more saved niche is one more local query. The Etsy
 * cost of a niche is the share of the corpus refresh it needs — and that
 * refresh is shared by every member watching anything.
 *
 * Shop Watch is the opposite shape: its cost is per shop, not per member, and
 * twenty members watching one shop cost what one member costs.
 */
export const GET = withErrorLog("market-watch-budget", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const counts = await db.prepare(
    `SELECT (SELECT COUNT(*) FROM niche_watches) AS nicheWatches,
            (SELECT COUNT(DISTINCT niche_key) FROM niche_watches) AS distinctNiches,
            (SELECT COUNT(DISTINCT user_id) FROM niche_watches) AS nicheMembers,
            (SELECT COUNT(*) FROM member_shop_watches) AS shopWatches,
            (SELECT COUNT(*) FROM watched_shops) AS distinctShops,
            (SELECT COUNT(*) FROM reference_images) AS referenceListings,
            (SELECT COUNT(*) FROM niche_watch_history) AS historyRows`)
    .first<Record<string, number>>().catch(() => null);

  const distinctShops = Number(counts?.distinctShops ?? 0);
  const shopWatches = Number(counts?.shopWatches ?? 0);
  const referenceListings = Number(counts?.referenceListings ?? 0);

  /* MEASURED, from the runs in this milestone. */
  const measured = {
    imageRecoveryCallsPer100Listings: 1,   /* listings/batch answers 100 at once */
    fullCorpusRefreshCalls: Math.ceil(referenceListings / 100),
    reviewCallsPerShopPerDay: 2,           /* incremental, from the high-water mark */
    nicheMatchEtsyCalls: 0,                /* local query against the shared corpus */
    nicheMatchPaidCalls: 0,
    morningUpdateEtsyCalls: 0,
    morningUpdatePaidCalls: 0,
  };

  /*
    A corpus refresh inside Etsy's six-hour display window means four passes a
    day over the listings a watch can display. It is shared: the same refresh
    serves every niche and every member.
  */
  const refreshesPerDay = 4;
  const sharedCorpusDaily = measured.fullCorpusRefreshCalls * refreshesPerDay;

  const projection = (members: number) => {
    const shopsPerMember = 3;   /* beta assumption, stated not hidden */
    const nichesPerMember = 3;
    /* Shops are deduplicated across members; the overlap grows with scale. */
    const uniqueShops = Math.round(members * shopsPerMember * 0.35);
    return {
      members,
      sharedCorpusCalls: sharedCorpusDaily,
      shopReviewCalls: uniqueShops * measured.reviewCallsPerShopPerDay,
      nicheCalls: 0,
      totalDailyEtsyCalls: sharedCorpusDaily + uniqueShops * measured.reviewCallsPerShopPerDay,
      /* Niches cost local queries only. */
      localQueriesPerMemberPerDay: nichesPerMember + 1,
      paidProviderCalls: 0,
    };
  };

  const projections = [100, 500, 1_000].map(projection);
  const quota = etsyQpdLimit();

  return NextResponse.json({
    limits: {
      nicheWatchesPerMember: MAX_NICHE_WATCHES,
      shopWatchesPerMember: watchLimit(),
      etsyDailyQuota: quota,
      roomLeftToday: await shopWatchRoom().catch(() => null),
    },
    today: await etsyBudget().catch(() => null),
    counts,
    measured,
    sharedCorpusDaily,
    /* What the shared corpus saves: without it every saved niche would need
       its own Etsy sweep. */
    savingFromSharedCorpus: {
      ifEveryNicheSweptEtsy: Number(counts?.nicheWatches ?? 0) * 3,
      actual: 0,
      note: "Niche matching reads the shared corpus locally. A saved niche "
        + "costs no Etsy call of its own.",
    },
    sharedCollectionSaving: {
      memberShopWatches: shopWatches,
      distinctShopsCollected: distinctShops,
      duplicateWatchesAvoided: Math.max(0, shopWatches - distinctShops),
    },
    projections,
    withinQuota: projections.every(row => row.totalDailyEtsyCalls < quota),
  });
});
