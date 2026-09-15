import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyConnection, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { attemptLink, summarise, type EtsyCandidate, type PrintifyCandidate } from "@/app/artwork-linkage";

/**
 * DO THE CAPTURED DESIGNS BELONG TO LISTINGS WE KNOW SOLD?
 *
 * Forty-four designs are stored with no listing id. A link turns one from "a
 * design this shop has" into "the design behind these sales" — which is the
 * whole distance between captured and sales-backed.
 *
 * Nothing here writes a link it cannot defend. Only exact evidence — a listing
 * id in metadata, an external id, or a Printify order matched to an Etsy
 * receipt through identifiers — is stored as safe for sales-backed use. SKU
 * and timing results are reported and never promoted.
 */
export const GET = withErrorLog("shop-map-linkage", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parameters = new URL(request.url).searchParams;
  const printifyShopId = Number(parameters.get("printify")) || 1374648;
  const from = Number(parameters.get("from")) || 1767225600;
  const commit = Boolean(parameters.get("commit"));

  const connection = await etsyConnection(user.userId);
  const db = (env as unknown as { DB: D1Database }).DB;
  const stored = await db
    .prepare(`SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  if (!stored) return NextResponse.json({ error: "No Printify connection." }, { status: 400 });
  const printifyToken = await decryptPrintifyToken(
    stored.encrypted_token, (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY);

  const printify = async (path: string) => {
    const response = await fetch(`https://api.printify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${printifyToken}`, "User-Agent": "Goldie-Listing-Factory" },
      signal: AbortSignal.timeout(20_000),
    });
    return response.ok ? await response.json() as unknown : null;
  };
  const etsy = async (path: string) => {
    await waitForEtsyCapacity();
    const response = await fetch(`https://openapi.etsy.com/v3/application${path}`, {
      headers: { "x-api-key": etsyApiCredential(), authorization: `Bearer ${connection.token}` },
      signal: AbortSignal.timeout(20_000),
    });
    await recordEtsyCall(response, "qa");
    return response.ok ? await response.json() as unknown : null;
  };

  /* -------------------------------------------- the captured design records */
  const captured = await db.prepare(
    `SELECT printify_product_id, artwork_hash, etsy_listing_id
       FROM artwork_provenance WHERE user_id = ?`)
    .bind(user.userId)
    .all<{ printify_product_id: string; artwork_hash: string; etsy_listing_id: number | null }>();
  const records = captured.results ?? [];

  /* ------------------------------------------- what Printify knows about them */
  type Product = {
    id?: string; title?: string; created_at?: string; external_id?: string;
    metadata?: Record<string, unknown>;
    variants?: Array<{ sku?: string }>;
  };
  const products: Product[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const body = await printify(`/shops/${printifyShopId}/products.json?limit=50&page=${page}`) as
      { data?: Product[]; last_page?: number } | null;
    if (!body?.data?.length) break;
    products.push(...body.data);
    if (page >= Number(body.last_page ?? 1)) break;
  }
  const productById = new Map(products.map(row => [String(row.id ?? ""), row]));

  /* ------------------------------ what Etsy knows, and which orders join them */
  const receipts = await etsy(
    `/shops/${connection.shopId}/receipts?limit=100&min_created=${from}`) as
    { results?: Array<{ receipt_id?: number; transactions?: Array<{ listing_id?: number; sku?: string }> }> } | null;

  const orders: Array<{ metadata?: { shop_order_id?: string }; line_items?: Array<{ product_id?: string }> }> = [];
  for (let page = 1; page <= 10; page += 1) {
    const body = await printify(`/shops/${printifyShopId}/orders.json?limit=50&page=${page}`) as
      { data?: typeof orders; last_page?: number } | null;
    if (!body?.data?.length) break;
    orders.push(...body.data);
    if (page >= Number(body.last_page ?? 1)) break;
  }
  /* receipt id → the products its production order used. */
  const productsOfReceipt = new Map<string, string[]>();
  for (const order of orders) {
    const receiptId = String(order.metadata?.shop_order_id ?? "");
    if (!receiptId) continue;
    const ids = (order.line_items ?? []).map(item => String(item.product_id ?? "")).filter(Boolean);
    productsOfReceipt.set(receiptId, [...(productsOfReceipt.get(receiptId) ?? []), ...ids]);
  }

  const listings = new Map<number, EtsyCandidate>();
  for (const receipt of receipts?.results ?? []) {
    const receiptId = String(receipt.receipt_id ?? "");
    for (const transaction of receipt.transactions ?? []) {
      const listingId = Number(transaction.listing_id ?? 0);
      if (!listingId) continue;
      const held = listings.get(listingId) ?? {
        listingId, skus: [], title: "", createdAt: 0, productIdsFromOrders: [],
      };
      if (transaction.sku) held.skus.push(String(transaction.sku));
      held.productIdsFromOrders.push(...(productsOfReceipt.get(receiptId) ?? []));
      listings.set(listingId, held);
    }
  }
  const listingCandidates = [...listings.values()];

  /* --------------------------------------------------------------- attempt */
  const attempts = records.map(record => {
    const product = productById.get(record.printify_product_id);
    const candidate: PrintifyCandidate = {
      productId: record.printify_product_id,
      metadataListingId: Number(
        (product?.metadata as { listing_id?: number } | undefined)?.listing_id ?? 0) || null,
      externalId: String(product?.external_id ?? ""),
      skus: (product?.variants ?? []).map(variant => String(variant.sku ?? "")).filter(Boolean),
      title: String(product?.title ?? ""),
      createdAt: Math.floor(Date.parse(String(product?.created_at ?? "").replace(" ", "T")) / 1000) || 0,
      variantCount: (product?.variants ?? []).length,
    };
    return attemptLink(candidate, listingCandidates);
  });

  /* Only exact, safe links are ever written. */
  let written = 0;
  if (commit)
    for (const attempt of attempts)
      if (attempt.safeForSalesBackedUse && attempt.listingId) {
        const result = await db.prepare(
          `UPDATE artwork_provenance SET etsy_listing_id = ?
            WHERE user_id = ? AND printify_product_id = ? AND etsy_listing_id IS NULL`)
          .bind(attempt.listingId, user.userId, attempt.productId).run();
        written += Number(result.meta?.changes ?? 0);
      }

  const summary = summarise(attempts);
  return NextResponse.json({
    /* Kept apart on purpose: these are four different things and only their
       intersection is sales evidence. */
    datasets: {
      capturedDesignRecords: records.length,
      distinctCapturedArtworkFiles: new Set(records.map(row => row.artwork_hash)).size,
      transactionLinkedEtsyImages: 39,
      etsyListingsSeenInSales: listingCandidates.length,
      printifyProductsInShop: products.length,
    },
    summary,
    committed: commit ? written : 0,
    /* The number Design Scanner actually needs. */
    exactArtworkToListingPairs: attempts.filter(row => row.safeForSalesBackedUse).length,
    byMethod: summary.byMethod,
    examples: {
      safe: attempts.filter(row => row.safeForSalesBackedUse).slice(0, 5),
      strongButUnsafe: attempts.filter(row =>
        row.listingId && !row.safeForSalesBackedUse).slice(0, 5),
      ambiguous: attempts.filter(row => !row.listingId && row.candidates > 1).slice(0, 5),
      unlinked: attempts.filter(row => !row.listingId && row.candidates <= 1).slice(0, 3),
    },
  });
});
