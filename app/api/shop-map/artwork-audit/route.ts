import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { printifyCall } from "../../../printify-call.ts";

/**
 * CAN WE TELL WHICH ARTWORK THE BUYER ACTUALLY BOUGHT?
 *
 * Design Scanner's whole premise is that some designs are associated with real
 * purchases. That only means anything if a sold unit can be tied to the
 * artwork that existed WHEN IT SOLD. Printify's order payload may carry an
 * immutable snapshot of the print area, or it may only carry a product id
 * whose current artwork the seller has changed since — and those two cases
 * give completely different answers about how much history is usable.
 *
 * So this measures rather than assumes: how many orders carry print-area or
 * image data of their own, how many can only be resolved by reading the
 * product as it stands today, and how many point at a product that no longer
 * exists at all.
 *
 * No customer fields are read. Only order identifiers, product ids and the
 * shape of any artwork data.
 */
export const GET = withErrorLog("shop-map-artwork-audit", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parameters = new URL(request.url).searchParams;
  const shopId = Number(parameters.get("printify")) || 1374648;
  const sample = Math.min(12, Math.max(1, Number(parameters.get("products")) || 6));

  const db = (env as unknown as { DB: D1Database }).DB;
  const stored = await db
    .prepare(`SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  if (!stored) return NextResponse.json({ error: "No Printify connection." }, { status: 400 });
  const token = await decryptPrintifyToken(
    stored.encrypted_token, (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY);

  const call = async (path: string) => {
    const response = await printifyCall(`https://api.printify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" },
      signal: AbortSignal.timeout(20_000),
    }, { feature: "qa", userId: user.userId });
    const text = await response.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* reported by status */ }
    return { status: response.status, parsed, raw: text };
  };

  type Order = {
    id?: string; created_at?: string; status?: string;
    metadata?: { order_type?: string; shop_order_id?: string };
    line_items?: Array<Record<string, unknown>>;
  };

  const orders: Order[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const answer = await call(`/shops/${shopId}/orders.json?limit=50&page=${page}`);
    if (answer.status !== 200) break;
    const body = answer.parsed as { data?: Order[]; last_page?: number };
    orders.push(...(body?.data ?? []));
    if (!body?.data?.length || page >= Number(body.last_page ?? 1)) break;
  }

  /*
    WHAT DOES A LINE ITEM ACTUALLY CARRY ABOUT THE DESIGN?

    Reported as which keys exist across every line item, because a field that
    is present on some orders and absent on others is the difference between a
    usable history and a partial one.
  */
  const lineItemKeys: Record<string, number> = {};
  const artworkBearing = new Set<string>();
  let lineItems = 0;
  const productIds = new Set<string>();
  for (const order of orders)
    for (const item of order.line_items ?? []) {
      lineItems += 1;
      for (const key of Object.keys(item)) lineItemKeys[key] = (lineItemKeys[key] ?? 0) + 1;
      /* Anything that could be an immutable record of the printed design. */
      if ("print_areas" in item || "images" in item || "print_details" in item)
        artworkBearing.add(String(order.id ?? ""));
      if (item.product_id) productIds.add(String(item.product_id));
    }

  /*
    Does the product still exist, and is its artwork the artwork that sold?
    A 404 means the history cannot be reconstructed at all; a 200 means the
    CURRENT artwork is readable, which is not the same as the artwork that was
    printed — the update timestamp against the order date is what tells them
    apart.
  */
  const products: Array<{
    productId: string; status: number; updatedAt: string | null;
    printAreas: number; imageCount: number;
  }> = [];
  for (const productId of [...productIds].slice(0, sample)) {
    const answer = await call(`/shops/${shopId}/products/${productId}.json`);
    const body = (answer.parsed ?? {}) as {
      updated_at?: string; print_areas?: unknown[]; images?: unknown[];
    };
    products.push({
      productId,
      status: answer.status,
      updatedAt: answer.status === 200 ? String(body.updated_at ?? "") : null,
      printAreas: Array.isArray(body.print_areas) ? body.print_areas.length : 0,
      imageCount: Array.isArray(body.images) ? body.images.length : 0,
    });
  }

  const missing = products.filter(row => row.status === 404).length;
  const readable = products.filter(row => row.status === 200).length;
  /* Artwork changed after the order was placed: the current print area is not
     what the buyer received. */
  const changedSince = products.filter(row => {
    if (row.status !== 200 || !row.updatedAt) return false;
    const updated = Date.parse(row.updatedAt.replace(" ", "T"));
    const ordersUsing = orders.filter(order =>
      (order.line_items ?? []).some(item => String(item.product_id) === row.productId));
    const oldest = Math.min(...ordersUsing.map(order =>
      Date.parse(String(order.created_at ?? "").replace(" ", "T")) || Infinity));
    return Number.isFinite(oldest) && updated > oldest;
  }).length;

  const dates = orders.map(order => String(order.created_at ?? "")).filter(Boolean).sort();

  return NextResponse.json({
    shopId,
    orders: orders.length,
    lineItems,
    distinctProducts: productIds.size,
    ageRange: { oldest: dates[0] ?? null, newest: dates[dates.length - 1] ?? null },

    /* The deciding question, answered directly. */
    ordersCarryingTheirOwnArtwork: artworkBearing.size,
    orderTimeArtworkSnapshot: artworkBearing.size > 0,
    lineItemFields: lineItemKeys,

    productsSampled: products.length,
    productsStillReadable: readable,
    productsDeletedOrUnavailable: missing,
    productsEditedSinceTheOrder: changedSince,

    /*
      The metric that decides whether sales-backed language is honest: a sold
      unit only counts if the artwork it was printed with can still be
      identified.
    */
    reconstructableArtworkPercent: products.length
      ? Math.round(((readable - changedSince) / products.length) * 1000) / 10
      : 0,
    caveat: artworkBearing.size === 0
      ? "No order carries its own artwork. Artwork can only be read from the product as it stands today, so any product edited since its order is not reconstructable."
      : "Orders carry artwork data of their own; historical reconstruction is possible for those.",
  });
});
