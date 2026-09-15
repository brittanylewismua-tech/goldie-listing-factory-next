import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { briefForShop, shopWatchBetaHealth, SHOP_WATCH_FLAG } from "@/app/shop-watch-brief";

/**
 * THE INTERNAL BETA.
 *
 * Four sections, and nothing else. The member does not need the confidence
 * arithmetic, the raw events, the API field names or the inventory noise —
 * they need to know what the evidence shows and how much of it there is.
 *
 * A MEMBER SEES ONLY THEIR OWN WATCH LIST. The shop briefs are shared, which
 * is the whole point of the collection model, but which shops a member
 * watches is theirs. The query is scoped to the caller and there is no
 * parameter that names another member.
 */
export const GET = withErrorLog("shop-watch-brief", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  /* Internal beta: behind the flag, owner only, until the beta is done. */
  if (!isOwner(user))
    return NextResponse.json({ error: "Shop Watch is in internal beta.", flag: SHOP_WATCH_FLAG },
      { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const watched = await db.prepare(
    `SELECT shop_id, shop_name FROM member_shop_watches WHERE user_id = ? ORDER BY added_at DESC LIMIT 25`)
    .bind(user.userId)
    .all<{ shop_id: number; shop_name: string }>()
    .catch(() => ({ results: [] as Array<{ shop_id: number; shop_name: string }> }));

  const shops = [];
  for (const row of watched.results ?? []) {
    const brief = await briefForShop(row.shop_id);
    shops.push({
      shopId: row.shop_id,
      shopName: row.shop_name,
      etsy: `https://www.etsy.com/shop/${encodeURIComponent(row.shop_name)}`,
      /* Four sections. Each card says what the pattern is, which listing it
         is about, how much evidence stands behind it, and how fresh it is. */
      gettingAttention: (brief.attention ?? []).map(card => present(card, row.shop_name)),
      whatBuyersLove: (brief.love ?? []).map(card => present(card, row.shop_name)),
      whatBuyersDislike: (brief.dislike ?? []).map(card => present(card, row.shop_name)),
      whatChanged: (brief.changed ?? []).map(card => present(card, row.shop_name)),
      lastRefreshed: brief.freshness,
      reviewsConsidered: brief.reviewsConsidered,
      builtFresh: brief.regenerated,
    });
  }

  return NextResponse.json({
    flag: SHOP_WATCH_FLAG,
    shops,
    health: await shopWatchBetaHealth(),
    reminder: "Reviews are evidence that somebody reviewed. They are not sales, and no listing sale count is derived from them.",
  });
});

/* What a card looks like to a member: the pattern, the listing, the weight of
   evidence, and nothing about how it was computed. */
function present(card: {
  headline: string; listingId: number | null; sampleSize: number;
  windowFrom: number; windowTo: number;
}, shopName: string) {
  return {
    pattern: card.headline,
    listing: card.listingId
      ? { id: card.listingId, url: `https://www.etsy.com/listing/${card.listingId}` }
      : { id: null, url: `https://www.etsy.com/shop/${encodeURIComponent(shopName)}` },
    evidence: `${card.sampleSize} review${card.sampleSize === 1 ? "" : "s"}`,
    window: `${Math.round((card.windowTo - card.windowFrom) / 86_400)} days`,
  };
}
