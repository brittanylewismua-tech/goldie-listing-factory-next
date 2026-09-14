import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";
import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyConnection, etsyFetch, recordEtsyCall } from "@/app/api/etsy/client";

/**
 * WHAT ETSY ACTUALLY DOES, MEASURED.
 *
 * Every question here has been answered wrongly at least once by reading
 * documentation instead of the wire. In July 2026 Etsy removed
 * `includes=Inventory` from the listing endpoints and published a dedicated
 * batch inventory endpoint, and whether that endpoint answers for a listing
 * somebody else owns decides whether variation-level movement is a signal we
 * can have at all. Nothing downstream should be designed on a guess.
 *
 * The probe reads only. It spends a handful of calls and reports the raw
 * status and shape of each answer.
 */
const call = async (path: string) => {
  const response = await fetch(`https://openapi.etsy.com/v3/application/${path}`, {
    headers: { "x-api-key": etsyApiCredential() },
    signal: AbortSignal.timeout(20_000),
  });
  await recordEtsyCall(response, "qa");
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* Kept as text below. */
  }
  return { path, status: response.status, parsed, text: parsed ? "" : text.slice(0, 400) };
};

/** The fields the collector would want, reported present or absent. */
const shape = (value: unknown, keys: string[]) => {
  const object = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.map(key => [key, key in object ? typeof object[key] : "absent"]));
};

export const GET = withErrorLog("etsy-capability", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const parameters = new URL(request.url).searchParams;

  /* Real listings from the corpus rather than invented ids: a probe against a
     listing that does not exist proves nothing about permission. */
  const sample = await db
    .prepare(
      `SELECT listing_id, shop_id, quantity, personalizable
         FROM sold_watch
        WHERE state = 'active'
        ORDER BY last_read DESC
        LIMIT 3`,
    )
    .all<{ listing_id: number; shop_id: number; quantity: number; personalizable: number }>();
  const rows = sample.results ?? [];
  if (!rows.length) return NextResponse.json({ error: "No corpus listings to probe." });

  const ids = rows.map(row => row.listing_id);
  const ownListing = parameters.get("own_listing");

  const results: Record<string, unknown> = {};

  /* 1. Batch listing read, the workhorse. Confirms the Shop association still
        carries the two shop-level counters the sensor depends on. */
  const batch = await call(
    `listings/batch?listing_ids=${ids.join(",")}&includes=Images,Shop&currency=USD`,
  );
  const first = ((batch.parsed as { results?: unknown[] })?.results ?? [])[0] as
    | Record<string, unknown>
    | undefined;
  results.batchListings = {
    status: batch.status,
    returned: ((batch.parsed as { results?: unknown[] })?.results ?? []).length,
    listingFields: shape(first, [
      "listing_id", "shop_id", "quantity", "views", "num_favorers", "state",
      "original_creation_timestamp", "creation_timestamp", "last_modified_timestamp",
      "state_timestamp", "taxonomy_id", "tags", "materials", "is_personalizable",
      "price", "url", "listing_type", "processing_min", "has_variations", "inventory",
    ]),
    shopFields: shape(first?.shop, [
      "shop_id", "shop_name", "transaction_sold_count", "listing_active_count",
      "review_count", "review_average", "digital_listing_count",
    ]),
  };

  /* 2. The July 2026 inventory endpoint, on listings we do not own. This is
        the question the whole offering-level signal depends on. */
  const competitorInventory = await call(`listings/batch/inventory?listing_ids=${ids.join(",")}`);
  results.competitorInventory = {
    status: competitorInventory.status,
    body: competitorInventory.parsed ?? competitorInventory.text,
  };

  /* 3. The same endpoint on a listing the authorised account owns, when one is
        named — the difference between the two is what ownership costs. */
  if (ownListing) {
    const own = await call(`listings/batch/inventory?listing_ids=${ownListing}`);
    results.ownInventory = { status: own.status, body: own.parsed ?? own.text };
  }

  /* 3b. The inventory endpoint again, this time signed as the connected
         seller. App-key access is refused outright; the question left is
         whether an authorised token can read a listing it does not own. */
  try {
    const connection = await etsyConnection(user.userId);
    const own = await etsyFetch<unknown>(
      `/listings/batch/inventory?listing_ids=${ids.join(",")}`,
      connection.token, undefined, undefined, "qa",
    ).then(body => ({ status: 200, body })).catch(error => ({
      status: 0, body: error instanceof Error ? error.message : "failed",
    }));
    results.competitorInventoryAsSeller = own;
  } catch (error) {
    results.competitorInventoryAsSeller = {
      skipped: error instanceof Error ? error.message : "no connection",
    };
  }

  /* 3c. What the batch listing read still calls "inventory" — the field is
         present in the response even after July's removal, and empty is a
         very different answer from populated. */
  results.inventoryFieldOnBatch = first?.inventory ?? null;

  /* 4. Reviews for a listing owned by somebody else: buyer proof, or not.
        Asked of a shop with real trading history, because a brand new
        listing answering "no reviews" proves nothing either way. */
  const busiest = await db
    .prepare(
      `SELECT w.listing_id, w.shop_id
         FROM sold_watch w
         JOIN (SELECT shop_id, MAX(sold_count) AS sold FROM shop_sold GROUP BY shop_id) s
           ON s.shop_id = w.shop_id
        WHERE w.state = 'active'
        ORDER BY s.sold DESC
        LIMIT 1`,
    )
    .first<{ listing_id: number; shop_id: number }>();
  if (busiest) {
    const busy = await call(`shops/${busiest.shop_id}/reviews?limit=3`);
    const busyReview = ((busy.parsed as { results?: unknown[] })?.results ?? [])[0];
    results.busyShopReviews = {
      shopId: busiest.shop_id,
      status: busy.status,
      count: (busy.parsed as { count?: number })?.count ?? null,
      fields: shape(busyReview, [
        "shop_id", "listing_id", "transaction_id", "rating", "review",
        "create_timestamp", "created_timestamp", "update_timestamp", "language", "image_url_fullxfull",
      ]),
    };
  }

  const reviews = await call(`listings/${ids[0]}/reviews?limit=3`);
  const review = ((reviews.parsed as { results?: unknown[] })?.results ?? [])[0];
  results.listingReviews = {
    status: reviews.status,
    count: (reviews.parsed as { count?: number })?.count ?? null,
    fields: shape(review, [
      "shop_id", "listing_id", "transaction_id", "rating", "review",
      "create_timestamp", "created_timestamp", "update_timestamp", "language",
    ]),
  };

  /* 5. Reviews by shop, which is the cheaper path when a shop's review count
        moves and we do not know which listing it belongs to. */
  const shopReviews = await call(`shops/${rows[0].shop_id}/reviews?limit=3`);
  results.shopReviews = {
    status: shopReviews.status,
    count: (shopReviews.parsed as { count?: number })?.count ?? null,
    body: shopReviews.status === 200 ? undefined : shopReviews.parsed ?? shopReviews.text,
  };

  /* 6. Can a sold-out listing still be read? Momentum depends on seeing the
        moment stock hits zero, which is also the moment Etsy may hide it. */
  const soldOut = await db
    .prepare(`SELECT listing_id FROM sold_watch WHERE quantity = 0 ORDER BY last_read DESC LIMIT 1`)
    .first<{ listing_id: number }>();
  if (soldOut) {
    const read = await call(`listings/${soldOut.listing_id}`);
    results.soldOutListing = {
      listingId: soldOut.listing_id,
      status: read.status,
      state: (read.parsed as { state?: string })?.state ?? null,
      quantity: (read.parsed as { quantity?: number })?.quantity ?? null,
    };
  }

  /* 7. The rate the limits actually allow, read off the response rather than
        off a constant that was wrong for a week. */
  const limitProbe = await fetch(
    "https://openapi.etsy.com/v3/application/openapi-ping",
    { headers: { "x-api-key": etsyApiCredential() } },
  );
  results.limits = {
    perDay: limitProbe.headers.get("x-limit-per-day"),
    remainingDay: limitProbe.headers.get("x-remaining-today"),
    perSecond: limitProbe.headers.get("x-limit-per-second"),
    remainingSecond: limitProbe.headers.get("x-remaining-this-second"),
  };

  return NextResponse.json({ probed: ids, results });
});
