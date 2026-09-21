import { crossSiteWrite, CROSS_SITE_REFUSAL } from "@/app/same-site-only";
import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyConnection, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { ensureListingTables, decodeEntities } from "@/app/shop-map-listings";
import { listingDisplay, listingPhoto } from "@/app/etsy-listing-display";
import { etsySaleValues } from "@/app/etsy-sale-values";
import { productFamily } from "@/app/product-type-utils";

/**
 * INGEST THE SELLER'S OWN LISTINGS.
 *
 * Every state Etsy will give us, not only the active ones: a sold-out or
 * expired listing is often the most interesting thing in a shop, and a map
 * built from active listings alone describes what is on the shelf rather than
 * what sold.
 *
 * Sales are read from transactions already stored during financial ingestion.
 * Views and favourites are written only when Etsy actually returns them.
 *
 * READ ONLY. No listing is created, edited, published or deleted.
 */
const STATES = ["active", "inactive", "sold_out", "expired", "draft"] as const;

/*
  D1716 · THIS WAS A GET, AND IT DOES WORK.

  A GET is meant to be safe to repeat and safe to follow: a bookmark, a
  crawler, a browser prefetch, a copied link, a click. This one writes, so
  it is a POST now. The GET below refuses without doing anything, so an old
  link fails loudly rather than quietly running the job again.
*/
export async function GET() {
  return NextResponse.json(
    { error: "This does work, so it is a POST now. Nothing was run." },
    { status: 405, headers: { Allow: "POST" } });
}

export const POST = withErrorLog("shop-map-listings", async (request: Request) => {
  if (crossSiteWrite(request)) return NextResponse.json(CROSS_SITE_REFUSAL, { status: 403 });
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureListingTables();
  const parameters = new URL(request.url).searchParams;
  const maxPages = Math.min(20, Math.max(1, Number(parameters.get("pages")) || 4));
  const db = (env as unknown as { DB: D1Database }).DB;
  const connection = await etsyConnection(user.userId);
  const shopId = Number(connection.shopId);
  const now = Math.floor(Date.now() / 1_000);
  let calls = 0;

  const etsy = async (path: string) => {
    await waitForEtsyCapacity();
    const response = await fetch(`https://openapi.etsy.com/v3/application${path}`, {
      headers: { "x-api-key": etsyApiCredential(), authorization: `Bearer ${connection.token}` },
      signal: AbortSignal.timeout(25_000),
    });
    await recordEtsyCall(response, "finance");
    calls += 1;
    return { status: response.status, body: response.ok ? await response.json() as unknown : null };
  };

  type Listing = {
    listing_id?: number; title?: string; tags?: string[]; state?: string;
    shop_section_id?: number; created_timestamp?: number; original_creation_timestamp?: number;
    updated_timestamp?: number; last_modified_timestamp?: number;
    views?: number; num_favorers?: number;
    images?: Array<{ url_570xN?: string; url_fullxfull?: string }>;
  };

  /* Section names, so a world can be labelled with what the seller called it. */
  const sectionNames = new Map<number, string>();
  const sections = await etsy(`/shops/${shopId}/sections`);
  for (const section of ((sections.body as { results?: Array<{ shop_section_id?: number; title?: string }> })?.results) ?? [])
    if (section.shop_section_id) sectionNames.set(Number(section.shop_section_id), decodeEntities(String(section.title ?? "")));

  /* Keep the shop identity beside its numbers. Etsy returns this on the shop
     record, not on a listing, so it has its own small cache. */
  const shopAnswer = await etsy(`/shops/${shopId}`);
  if (shopAnswer.status === 200) {
    const shop = shopAnswer.body as { icon_url_fullxfull?: string; image_url_760x100?: string };
    const imageUrl = String(shop.icon_url_fullxfull ?? shop.image_url_760x100 ?? "");
    if (imageUrl) await db.prepare(
      `INSERT INTO shop_map_shop_profiles (user_id, shop_id, image_url, updated_at)
       VALUES (?,?,?,?) ON CONFLICT(user_id, shop_id) DO UPDATE SET
       image_url = excluded.image_url, updated_at = excluded.updated_at`)
      .bind(user.userId, shopId, imageUrl, now).run();
  }

  const byState: Record<string, number> = {};
  const fieldsSeen = { views: 0, favorites: 0, created: 0 };
  let stored = 0;

  const listingsOnly = parameters.get("sales") !== "1" || parameters.get("listings") === "1";
  for (const state of (listingsOnly ? STATES : [])) {
    for (let page = 0; page < maxPages; page += 1) {
      const answer = await etsy(
        `/shops/${shopId}/listings?state=${state}&limit=100&offset=${page * 100}`);
      /*
        A state the granted scope does not permit answers with an error rather
        than an empty list. That is recorded, not retried and not guessed at.
      */
      if (answer.status !== 200) { byState[`${state}:status${answer.status}`] = 1; break; }
      const results = ((answer.body as { results?: Listing[] })?.results) ?? [];
      if (!results.length) break;

      const display = await listingDisplay(results.map(row => Number(row.listing_id)), "finance", connection.token);
      for (const listing of results) {
        const listingId = Number(listing.listing_id ?? 0);
        if (!listingId) continue;
        const sectionId = Number(listing.shop_section_id ?? 0);
        const views = typeof listing.views === "number" ? listing.views : null;
        const favorites = typeof listing.num_favorers === "number" ? listing.num_favorers : null;
        const created = Number(listing.original_creation_timestamp ?? listing.created_timestamp ?? 0) || null;
        const imageUrl = listingPhoto(display.get(listingId) ?? listing);
        if (views !== null) fieldsSeen.views += 1;
        if (favorites !== null) fieldsSeen.favorites += 1;
        if (created) fieldsSeen.created += 1;

        await db.prepare(
          `INSERT INTO shop_map_listings
             (user_id, shop_id, listing_id, title, tags, shop_section, state,
              created_at, updated_at, views, favorites, image_url, product_family, ingested_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(user_id, shop_id, listing_id) DO UPDATE SET
             title = excluded.title, tags = excluded.tags,
             shop_section = excluded.shop_section, state = excluded.state,
             updated_at = excluded.updated_at,
             /* Absent stays absent: a null must not overwrite a real reading. */
             views = COALESCE(excluded.views, shop_map_listings.views),
             favorites = COALESCE(excluded.favorites, shop_map_listings.favorites),
             image_url = CASE WHEN excluded.image_url <> '' THEN excluded.image_url
               ELSE shop_map_listings.image_url END,
             ingested_at = excluded.ingested_at`)
          .bind(user.userId, shopId, listingId, decodeEntities(String(listing.title ?? "")),
            JSON.stringify(listing.tags ?? []), sectionNames.get(sectionId) ?? "",
            String(listing.state ?? state), created,
            Number(listing.last_modified_timestamp ?? listing.updated_timestamp ?? 0) || null,
            views, favorites, imageUrl,
            productFamily(decodeEntities(String(listing.title ?? ""))), now)
          .run();
        stored += 1;
        byState[state] = (byState[state] ?? 0) + 1;
      }
      if (results.length < 100) break;
    }
  }

  /*
    SALES, FROM TRANSACTIONS AND NOTHING ELSE.

    A receipt carries its transactions, and a transaction names the listing,
    the quantity and the price. That is the only path by which anything
    becomes a sale in Shop Map. Views and favourites are stored on the listing
    row and can never arrive here.
  */
  let salesStored = 0;
  if (parameters.get("sales") === "1") {
    /* Chunked: roughly 3,700 transaction inserts do not fit in one request,
       so the caller walks the receipt pages a few at a time. */
    const from = Math.max(0, Number(parameters.get("salesFrom")) || 0);
    const maxReceiptPages = Math.min(8, Math.max(1, Number(parameters.get("receipts")) || 4));
    for (let page = from; page < from + maxReceiptPages; page += 1) {
      const answer = await etsy(`/shops/${shopId}/receipts?limit=100&offset=${page * 100}`);
      if (answer.status !== 200) break;
      const receipts = ((answer.body as { results?: Array<Record<string, unknown>> })?.results) ?? [];
      if (!receipts.length) break;
      for (const receipt of receipts) {
        const receiptId = Number(receipt.receipt_id ?? 0) || null;
        const refunded = ((receipt.refunds ?? []) as unknown[]).length > 0 ? 1 : 0;
        for (const line of ((receipt.transactions ?? []) as Array<Record<string, unknown>>)) {
          const transactionId = Number(line.transaction_id ?? 0);
          const listingId = Number(line.listing_id ?? 0);
          if (!transactionId || !listingId) continue;
          const values=etsySaleValues(receipt,line,now);
          if(!values)continue;
          await db.prepare(
            `INSERT INTO shop_map_listing_sales
               (user_id, shop_id, listing_id, transaction_id, receipt_id, quantity,
                price_minor, currency, sold_at, refunded)
             VALUES (?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(user_id, shop_id, transaction_id) DO UPDATE SET
               refunded = excluded.refunded, quantity = excluded.quantity,
               price_minor = excluded.price_minor, currency = excluded.currency,
               sold_at = excluded.sold_at, receipt_id = excluded.receipt_id`)
            .bind(user.userId, shopId, listingId, transactionId, receiptId,
              values.quantity, values.priceMinor, values.currency, values.soldAt, refunded)
            .run();
          salesStored += 1;
        }
      }
      if (receipts.length < 100) break;
    }
  }

  /*
    THE SELLER'S OWN REVIEWS, KEPT APART FROM THE WATCHED SHOPS'.

    shop_reviews holds competitor evidence gathered by Shop Watch. Mixing the
    seller's own reviews into it would blur whose evidence is whose, so they
    live in their own table with their own freshness and high-water mark.

    A review time is when somebody wrote a review. It is never a sale time.
  */
  let reviewsStored = 0;
  if (parameters.get("reviews") === "1") {
    await db.prepare(`CREATE TABLE IF NOT EXISTS shop_map_own_reviews (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      transaction_id INTEGER NOT NULL,
      listing_id INTEGER,
      rating INTEGER,
      review TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      ingested_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, shop_id, transaction_id))`).run();
    await db.prepare(
      `CREATE INDEX IF NOT EXISTS shop_map_own_reviews_listing
         ON shop_map_own_reviews (user_id, shop_id, listing_id)`).run();

    const state = await db.prepare(
      `SELECT high_water FROM finance_sources
        WHERE user_id = ? AND shop_id = ? AND source = 'own-reviews'`)
      .bind(user.userId, shopId).first<{ high_water: number }>().catch(() => null);
    /* Overlap a little: a review can be edited after it was written. */
    const since = Math.max(0, Number(state?.high_water ?? 0) - 7 * 86_400);
    let newest = Number(state?.high_water ?? 0);

    for (let page = 0; page < 12; page += 1) {
      const answer = await etsy(
        `/shops/${shopId}/reviews?limit=100&offset=${page * 100}`
        + (since ? `&min_created=${since}` : ""));
      if (answer.status !== 200) break;
      const results = ((answer.body as { results?: Array<Record<string, unknown>> })?.results) ?? [];
      if (!results.length) break;
      for (const row of results) {
        const transactionId = Number(row.transaction_id ?? 0);
        if (!transactionId) continue;
        const created = Number(row.create_timestamp ?? row.created_timestamp ?? 0);
        if (created > newest) newest = created;
        await db.prepare(
          `INSERT INTO shop_map_own_reviews
             (user_id, shop_id, transaction_id, listing_id, rating, review, created_at, ingested_at)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(user_id, shop_id, transaction_id) DO UPDATE SET
             rating = excluded.rating, review = excluded.review`)
          .bind(user.userId, shopId, transactionId,
            Number(row.listing_id ?? 0) || null,
            row.rating === null || row.rating === undefined ? null : Number(row.rating),
            String(row.review ?? ""), created, now)
          .run();
        reviewsStored += 1;
      }
      if (results.length < 100) break;
    }

    await db.prepare(
      `INSERT INTO finance_sources (user_id, shop_id, source, refreshed_at, high_water)
       VALUES (?,?,'own-reviews',?,?)
       ON CONFLICT(user_id, shop_id, source) DO UPDATE SET
         refreshed_at = excluded.refreshed_at, high_water = excluded.high_water`)
      .bind(user.userId, shopId, now, newest).run();
  }

  /* Sales from the transactions already ingested. Nothing else becomes a sale. */
  const sales = await db.prepare(
    `SELECT COUNT(*) AS n FROM shop_map_listing_sales WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId).first<{ n: number }>().catch(() => ({ n: 0 }));

  return NextResponse.json({
    shopId, etsyCalls: calls, listingsStored: stored, byState,
    /* Which optional fields Etsy actually returned, so absence is visible. */
    fieldsExposed: {
      views: fieldsSeen.views, favorites: fieldsSeen.favorites, created: fieldsSeen.created,
    },
    salesStored, reviewsStored, salesRowsHeld: sales?.n ?? 0,
    nextSalesFrom: parameters.get("sales") === "1"
      ? Math.max(0, Number(parameters.get("salesFrom")) || 0)
        + Math.min(8, Math.max(1, Number(parameters.get("receipts")) || 4)) : null,
    reminder: "Read only. No listing created, edited, published or deleted. No buyer data.",
  });
});
