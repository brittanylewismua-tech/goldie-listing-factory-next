import { NextResponse } from "next/server";
import { decodeEntities } from "@/app/shop-map-worlds";
import { withErrorLog } from "@/app/error-log";
import { cachedListingDisplay } from "@/app/etsy-display-cache";
import { listingPhoto, listingPrice } from "@/app/etsy-listing-display";
import { requireFeatureApi } from "@/app/require-feature";
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
  /* Market Watch, not the owner flag. */
  const access = await requireFeatureApi("marketWatch");
  if (!access.ok) return access.response;
  const user = access.user;

  const db = (env as unknown as { DB: D1Database }).DB;
  /*
    THE NAME LIVES ON THE SHARED SHOP ROW, NOT THE MEMBER'S WATCH.

    This asked `member_shop_watches` for `shop_name`. That table has `label`;
    the name is on `watched_shops`. D1 threw, the catch below swallowed it, and
    Shop Watch rendered an empty list for every member — the same failure shape
    as D1433, where a query for columns the table did not have made What
    Changed permanently blank.

    So the name is joined from the table that holds it, `label` is the
    fallback, and a query failure is now REPORTED rather than returned as "you
    are watching nothing".
  */
  let queryFailed = "";
  const watched = await db.prepare(
    `SELECT m.shop_id AS shop_id,
            COALESCE(NULLIF(w.shop_name, ''), NULLIF(m.label, ''), '') AS shop_name
       FROM member_shop_watches m
       LEFT JOIN watched_shops w ON w.shop_id = m.shop_id
      WHERE m.user_id = ? AND m.paused = 0
      ORDER BY m.added_at DESC LIMIT 25`)
    .bind(user.userId)
    .all<{ shop_id: number; shop_name: string }>()
    .catch(error => {
      queryFailed = error instanceof Error ? error.message : "watch list unavailable";
      return { results: [] as Array<{ shop_id: number; shop_name: string }> };
    });

  const shops = [];
  for (const row of watched.results ?? []) {
    const brief = await briefForShop(row.shop_id);
    shops.push({
      shopId: row.shop_id,
      shopName: row.shop_name,
      etsy: `https://www.etsy.com/shop/${encodeURIComponent(row.shop_name)}`,
      /* Four sections. Each card says what the pattern is, which listing it
         is about, how much evidence stands behind it, and how fresh it is. */
      gettingAttention: (brief.attention ?? []).map((card: Parameters<typeof present>[0] & {evidenceClass?:string}) => present(card, row.shop_name)),
      whatBuyersLove: (brief.love ?? []).map((card: Parameters<typeof present>[0] & {evidenceClass?:string}) => present(card, row.shop_name)),
      whatBuyersDislike: (brief.dislike ?? []).map((card: Parameters<typeof present>[0] & {evidenceClass?:string}) => present(card, row.shop_name)),
      /*
        The two cards in this section are not built from reviews, so the
        weight of their evidence is not a review count. The translation
        happens here, where the internal class still exists; `present` is
        handed a member's sentence and never sees the class at all.
      */
      whatChanged: (brief.changed ?? []).map((card: Parameters<typeof present>[0] & {evidenceClass?:string}) => present(card, row.shop_name,
        card.evidenceClass === "confirmed-shop-total"
          ? "Etsy's own shop counter" : "")),
      lastRefreshed: brief.freshness,
      reviewsConsidered: brief.reviewsConsidered,
      builtFresh: brief.regenerated,
    });
  }

  if (queryFailed) return NextResponse.json({error: "Your watched shops could not be loaded. Please try again."}, {status:503});
  const cards = shops.flatMap(shop => [...shop.gettingAttention, ...shop.whatBuyersLove, ...shop.whatBuyersDislike]);
  const {listings, refreshFailed} = await cachedListingDisplay(cards.flatMap(card => card.listing.id ? [card.listing.id] : []), "shop-watch");
  const enriched = await Promise.all(shops.map(async shop => {
    const enrich = async (card: typeof cards[number]) => {
      const row = card.listing.id ? listings.get(card.listing.id) : undefined;
      const reviews = card.listing.id ? await db.prepare(`SELECT rating, review, created_at AS createdAt
        FROM shop_reviews WHERE shop_id = ? AND listing_id = ? AND review <> ''
        ORDER BY created_at DESC LIMIT 3`).bind(shop.shopId,card.listing.id)
        .all<{rating:number;review:string;createdAt:number}>() : {results:[]};
      return {...card, listing: {...card.listing, title: row?.title ?? "", imageUrl: row ? listingPhoto(row) : "",
        priceCents: row ? listingPrice(row) : null, currency: row?.price?.currency_code ?? "USD"}, reviews: (reviews.results ?? []).map(review=>({...review,review:decodeEntities(review.review)}))};
    };
    return {...shop, gettingAttention:await Promise.all(shop.gettingAttention.map(enrich)),
      whatBuyersLove:await Promise.all(shop.whatBuyersLove.map(enrich)),
      whatBuyersDislike:await Promise.all(shop.whatBuyersDislike.map(enrich)), displayUnavailable: refreshFailed};
  }));

  return NextResponse.json({
    flag: SHOP_WATCH_FLAG,
    /* An empty list because nothing is watched and an empty list because the
       query broke are different, and the member is told which. */
    ...(queryFailed ? { error: queryFailed } : {}),
    shops: enriched,
    limit: 25,
    health: await shopWatchBetaHealth(),
    reminder: "Reviews are evidence that somebody reviewed. They are not sales, and no listing sale count is derived from them.",
  });
});

/* What a card looks like to a member: the pattern, the listing, the weight of
   evidence, and nothing about how it was computed. */
function present(card: {
  headline: string; because: string; listingId: number | null; sampleSize: number;
  windowFrom: number; windowTo: number;
}, shopName: string, weight = "") {
  return {
    pattern: card.headline,
    /* The reasoning, which the selection rule computed and then discarded.
       Without it, "9 of the last 496 reviews" is a true sentence nobody can
       act on: whether nine is a lot depends on a denominator the card never
       showed. */
    because: card.because,
    listing: card.listingId
      ? { id: card.listingId, url: `https://www.etsy.com/listing/${card.listingId}` }
      : { id: null, url: `https://www.etsy.com/shop/${encodeURIComponent(shopName)}` },
    /*
      D1689 · A SALES CARD THAT LABELLED ITSELF "1 REVIEW".

      Every card's evidence line was built as a review count, including the
      two that are not built from reviews at all. "This shop sold 11 more
      items since yesterday" — whose own sentence says it is "the one number
      here that is actually sales rather than reviews" — carried the footer
      "1 review · 1 days", where the 1 is a placeholder sample size that was
      never meant to be shown. It contradicted the card above it and put a
      fabricated review count under a sales figure.
    */
    evidence: weight
      || `${card.sampleSize} review${card.sampleSize === 1 ? "" : "s"}`,
    window: (() => {
      const days = Math.round((card.windowTo - card.windowFrom) / 86_400);
      return `${days} day${days === 1 ? "" : "s"}`;
    })(),
  };
}
