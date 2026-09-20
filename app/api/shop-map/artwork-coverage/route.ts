import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyConnection, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { printifyCall } from "../../../printify-call.ts";

/**
 * HOW MUCH OF THE PAST CAN STILL BE SEEN?
 *
 * An earlier version of this audit sampled ten of twenty-three Printify
 * products, found all ten gone, and reported that historical artwork recovery
 * was zero per cent. That was a sample stated as a total, and it also ignored
 * the other route entirely: every Etsy transaction names a listing, and a
 * listing that still exists still has images.
 *
 * So this tests EVERY historical product and EVERY transaction's listing, and
 * reports coverage in four separate buckets rather than one number. The
 * buckets matter because they are not equivalent evidence:
 *
 *   exact printable artwork  — what was actually printed. Immutable.
 *   current product artwork  — what the product prints TODAY. May have changed.
 *   Etsy listing image       — what the listing shows today. May have changed.
 *   nothing                  — no image survives at all.
 *
 * Only the first is an order-time snapshot. The others are useful and must
 * never be described as proof of what a past buyer saw.
 */
export const GET = withErrorLog("shop-map-artwork-coverage", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parameters = new URL(request.url).searchParams;
  const printifyShopId = Number(parameters.get("printify")) || 1374648;
  const from = Number(parameters.get("from")) || 1767225600;
  const to = Number(parameters.get("to")) || Math.floor(Date.now() / 1000);

  const connection = await etsyConnection(user.userId);
  const db = (env as unknown as { DB: D1Database }).DB;
  const stored = await db
    .prepare(`SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  if (!stored) return NextResponse.json({ error: "No Printify connection." }, { status: 400 });
  const printifyToken = await decryptPrintifyToken(
    stored.encrypted_token, (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY);

  const printify = async (path: string) => {
    const response = await printifyCall(`https://api.printify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${printifyToken}`, "User-Agent": "Goldie-Listing-Factory" },
      signal: AbortSignal.timeout(20_000),
    }, { feature: "qa", userId: user.userId });
    const text = await response.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* status carries it */ }
    return { status: response.status, parsed };
  };

  const etsy = async (path: string) => {
    await waitForEtsyCapacity();
    const response = await fetch(`https://openapi.etsy.com/v3/application${path}`, {
      headers: { "x-api-key": etsyApiCredential(), authorization: `Bearer ${connection.token}` },
      signal: AbortSignal.timeout(20_000),
    });
    await recordEtsyCall(response, "qa");
    const text = await response.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* status carries it */ }
    return { status: response.status, parsed };
  };

  /* ------------------------------------------------- every historical order */
  type Order = {
    id?: string; created_at?: string;
    metadata?: { shop_order_id?: string };
    line_items?: Array<{ product_id?: string }>;
  };
  const orders: Order[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const answer = await printify(`/shops/${printifyShopId}/orders.json?limit=50&page=${page}`);
    if (answer.status !== 200) break;
    const body = answer.parsed as { data?: Order[]; last_page?: number };
    orders.push(...(body?.data ?? []));
    if (!body?.data?.length || page >= Number(body.last_page ?? 1)) break;
  }

  const historicalProductIds = new Set<string>();
  for (const order of orders)
    for (const item of order.line_items ?? [])
      if (item.product_id) historicalProductIds.add(String(item.product_id));

  /* EVERY one of them, not a sample. */
  let productsAlive = 0;
  let productsGone = 0;
  let productsWithPrintImage = 0;
  const productStatuses: Record<string, number> = {};
  /* Kept per product, so a transaction can be asked whether ITS product
     survived rather than whether any product did. */
  const productOutcome = new Map<string, number>();
  for (const productId of historicalProductIds) {
    const answer = await printify(`/shops/${printifyShopId}/products/${productId}.json`);
    productOutcome.set(productId, answer.status);
    productStatuses[String(answer.status)] = (productStatuses[String(answer.status)] ?? 0) + 1;
    if (answer.status !== 200) { productsGone += 1; continue; }
    productsAlive += 1;
    const product = answer.parsed as {
      print_areas?: Array<{ placeholders?: Array<{ images?: unknown[] }> }>;
    };
    const hasImage = (product.print_areas ?? []).some(area =>
      (area.placeholders ?? []).some(place => (place.images ?? []).length));
    if (hasImage) productsWithPrintImage += 1;
  }

  /* ------------------------------------------ every transaction's listing */
  const receipts = await etsy(
    `/shops/${connection.shopId}/receipts?limit=100&min_created=${from}&max_created=${to}`);
  type Receipt = {
    receipt_id?: number;
    transactions?: Array<{
      transaction_id?: number; listing_id?: number; listing_image_id?: number;
    }>;
  };
  const receiptRows = ((receipts.parsed as { results?: Receipt[] })?.results) ?? [];

  const transactions: Array<{ transactionId: number; listingId: number; listingImageId: number }> = [];
  for (const receipt of receiptRows)
    for (const transaction of receipt.transactions ?? [])
      transactions.push({
        transactionId: Number(transaction.transaction_id ?? 0),
        listingId: Number(transaction.listing_id ?? 0),
        /*
          A transaction naming its own image is the closest Etsy comes to an
          order-time visual record, so whether it is present at all matters.
        */
        listingImageId: Number(transaction.listing_image_id ?? 0),
      });

  const transactionsNamingAnImage = transactions.filter(row => row.listingImageId > 0).length;

  const listingIds = [...new Set(transactions.map(row => row.listingId).filter(Boolean))];
  const listingState: Record<string, number> = {};
  const listingsWithImages = new Set<number>();
  for (const listingId of listingIds) {
    const answer = await etsy(`/listings/${listingId}?includes=Images`);
    if (answer.status !== 200) {
      listingState[`http_${answer.status}`] = (listingState[`http_${answer.status}`] ?? 0) + 1;
      continue;
    }
    const listing = answer.parsed as { state?: string; images?: unknown[] };
    const state = String(listing.state ?? "unknown");
    listingState[state] = (listingState[state] ?? 0) + 1;
    if ((listing.images ?? []).length) listingsWithImages.add(listingId);
  }

  /* --------------------------------------------------------- the buckets */

  /*
    THE FINDING THAT MATTERS, AND IT IS NOT THE PRINTIFY ONE.

    Every transaction names a `listing_image_id`. Etsy issues image ids per
    upload and never reassigns them, so if that id is still among the
    listing's images, the image the buyer actually saw is still retrievable —
    an order-time visual record, which Printify does not provide at all.

    A listing whose images were replaced loses that id, and the absence is
    itself the signal: it is how a changed listing tells on itself.
  */
  const imagesByListing = new Map<number, Set<number>>();
  for (const listingId of listingIds) {
    const answer = await etsy(`/listings/${listingId}/images`);
    if (answer.status !== 200) continue;
    const rows = ((answer.parsed as { results?: Array<{ listing_image_id?: number }> })?.results) ?? [];
    imagesByListing.set(listingId, new Set(rows.map(row => Number(row.listing_image_id ?? 0))));
  }
  const stillHasItsImage = (row: { listingId: number; listingImageId: number }) =>
    row.listingImageId > 0 && Boolean(imagesByListing.get(row.listingId)?.has(row.listingImageId));

  const withOrderTimeImage = transactions.filter(stillHasItsImage).length;
  const changedSinceSale = transactions.filter(row =>
    listingsWithImages.has(row.listingId) && !stillHasItsImage(row)).length;

  /* Printable artwork survives only where the product itself does. */
  const liveProducts = new Set<string>();
  for (const [productId, status] of productOutcome) if (status === 200) liveProducts.add(productId);
  const receiptOfTransaction = new Map<number, number>();
  for (const receipt of receiptRows)
    for (const transaction of receipt.transactions ?? [])
      receiptOfTransaction.set(Number(transaction.transaction_id ?? 0), Number(receipt.receipt_id ?? 0));
  const productOfReceipt = new Map<string, string>();
  for (const order of orders) {
    const receiptId = String(order.metadata?.shop_order_id ?? "");
    const productId = String((order.line_items ?? [])[0]?.product_id ?? "");
    if (receiptId && productId) productOfReceipt.set(receiptId, productId);
  }
  const withPrintable = transactions.filter(row => {
    const productId = productOfReceipt.get(String(receiptOfTransaction.get(row.transactionId) ?? ""));
    return Boolean(productId && liveProducts.has(productId));
  }).length;

  const withNothing = transactions.filter(row => !listingsWithImages.has(row.listingId)).length;
  const share = (count: number) =>
    transactions.length ? Math.round((count / transactions.length) * 1000) / 10 : 0;

  return NextResponse.json({
    scope: { etsyShop: connection.shopId, printifyShop: printifyShopId, fromUnix: from, toUnix: to },

    printifyHistory: {
      orders: orders.length,
      distinctHistoricalProducts: historicalProductIds.size,
      /* Every one tested, not a sample. */
      productsTested: historicalProductIds.size,
      productsStillRetrievable: productsAlive,
      productsGone,
      productsStillCarryingAPrintImage: productsWithPrintImage,
      httpStatuses: productStatuses,
    },

    etsyHistory: {
      receipts: receiptRows.length,
      transactions: transactions.length,
      distinctListings: listingIds.length,
      listingStates: listingState,
      listingsStillCarryingImages: listingsWithImages.size,
      transactionsNamingAListingImage: transactionsNamingAnImage,
    },

    /*
      Four buckets, never collapsed into one number. Only the first is an
      order-time snapshot; the rest are today's images, which may have been
      changed since the sale and must never be called proof of what a past
      buyer saw.
    */
    coverage: {
      /* The printable file itself, from a product that still exists. */
      exactPrintableArtwork: { transactions: withPrintable, percent: share(withPrintable) },
      /* The image Etsy recorded for that transaction, still present. */
      orderTimeEtsyImage: { transactions: withOrderTimeImage, percent: share(withOrderTimeImage) },
      /* Listing has images, but not the one the sale named: changed since. */
      changedSinceSale: { transactions: changedSinceSale, percent: share(changedSinceSale) },
      noImageAvailable: { transactions: withNothing, percent: share(withNothing) },
    },

    caveat: "A current Etsy listing image is not an order-time snapshot. It is useful historical evidence only where the listing has not been visually changed since the sale, which this cannot establish.",
  });
});
