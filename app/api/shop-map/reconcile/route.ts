import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyConnection, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { add, format, fromEtsy, fromPrintify, money, subtract, type Money } from "@/app/shop-map-money";
import { reconcile, type EtsyLine, type PrintifyLine } from "@/app/shop-map-match";

/**
 * ONE MONTH OF REAL SALES, MATCHED TO WHAT THEY COST.
 *
 * Nothing here estimates. A production cost that cannot be tied to a specific
 * Printify line is reported as missing and the month is not called complete
 * profit — because a profit figure with an invisible hole in it is worse than
 * no profit figure at all.
 *
 * NO BUYER DATA IS READ OR RETURNED. Receipts carry names, addresses and
 * messages; this reads ids, quantities, SKUs, timestamps and money, and the
 * examples it returns carry no field that could identify a person.
 */
const shopMapEtsy = async (path: string, token: string) => {
  await waitForEtsyCapacity();
  const response = await fetch(`https://openapi.etsy.com/v3/application${path}`, {
    headers: { "x-api-key": etsyApiCredential(), authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(25_000),
  });
  await recordEtsyCall(response, "qa");
  const text = await response.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* reported below */ }
  return { status: response.status, parsed, text: parsed ? "" : text.slice(0, 300), path };
};

export const GET = withErrorLog("shop-map-reconcile", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parameters = new URL(request.url).searchParams;
  const connection = await etsyConnection(user.userId);
  const etsyShopId = Number(parameters.get("etsy")) || connection.shopId;
  const printifyShopId = Number(parameters.get("printify")) || 1374648;

  /* The current calendar month, because that is what a member opens Shop Map
     to see. Backfill is a separate, slower job. */
  const now = new Date();
  const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const from = Number(parameters.get("from")) || monthStart;
  const to = Number(parameters.get("to")) || Math.floor(Date.now() / 1000);

  /* ---------------------------------------------------------------- Etsy */
  const calls: Record<string, number> = { etsy: 0, printify: 0 };
  const receiptsAnswer = await shopMapEtsy(
    `/shops/${etsyShopId}/receipts?limit=100&min_created=${from}&max_created=${to}`, connection.token);
  calls.etsy += 1;
  if (receiptsAnswer.status !== 200)
    return NextResponse.json({
      step: "receipts", status: receiptsAnswer.status,
      said: receiptsAnswer.parsed ?? receiptsAnswer.text,
    }, { status: 502 });

  type EtsyReceipt = {
    receipt_id?: number; created_timestamp?: number; create_timestamp?: number;
    grandtotal?: unknown; subtotal?: unknown; total_price?: unknown;
    total_shipping_cost?: unknown; total_tax_cost?: unknown; total_vat_cost?: unknown;
    discount_amt?: unknown; status?: string;
    refunds?: Array<{ amount?: unknown; reason?: string; created_timestamp?: number }>;
    transactions?: Array<{
      transaction_id?: number; listing_id?: number; product_id?: number; sku?: string;
      quantity?: number; price?: unknown; shipping_cost?: unknown;
      created_timestamp?: number; create_timestamp?: number;
    }>;
  };
  const receipts = ((receiptsAnswer.parsed as { results?: EtsyReceipt[] })?.results) ?? [];

  const etsyLines: EtsyLine[] = [];
  const currency = "USD";
  let productRevenue = money(0, currency);
  let shippingCollected = money(0, currency);
  let discounts = money(0, currency);
  let refunded = money(0, currency);
  let salesTax = money(0, currency);

  for (const receipt of receipts) {
    const createdAt = Number(receipt.created_timestamp ?? receipt.create_timestamp ?? 0);
    shippingCollected = add(shippingCollected, fromEtsy(receipt.total_shipping_cost, currency));
    discounts = add(discounts, fromEtsy(receipt.discount_amt, currency));
    /* Marketplace-collected tax is not the seller's revenue and never enters
       the total. It is reported so its absence is visible rather than
       mysterious. */
    salesTax = add(salesTax, fromEtsy(receipt.total_tax_cost, currency),
      fromEtsy(receipt.total_vat_cost, currency));
    for (const refund of receipt.refunds ?? [])
      refunded = add(refunded, fromEtsy(refund.amount, currency));

    for (const transaction of receipt.transactions ?? []) {
      const line = fromEtsy(transaction.price, currency);
      productRevenue = add(productRevenue,
        money(line.minor * Number(transaction.quantity ?? 1), currency));
      etsyLines.push({
        receiptId: Number(receipt.receipt_id ?? 0),
        transactionId: Number(transaction.transaction_id ?? 0),
        listingId: Number(transaction.listing_id ?? 0),
        productId: Number(transaction.product_id ?? 0),
        sku: String(transaction.sku ?? ""),
        quantity: Number(transaction.quantity ?? 1),
        createdAt: Number(transaction.created_timestamp ?? transaction.create_timestamp ?? createdAt),
      });
    }
  }

  /* ------------------------------------------------------------ Printify */
  const db = (env as unknown as { DB: D1Database }).DB;
  const stored = await db
    .prepare(`SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  if (!stored) return NextResponse.json({ error: "No Printify connection." }, { status: 400 });
  const printifyToken = await decryptPrintifyToken(
    stored.encrypted_token, (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY);

  type PrintifyOrder = {
    id?: string; app_order_id?: string; external_id?: string; shop_order_id?: string;
    created_at?: string; status?: string; total_price?: number; total_shipping?: number;
    total_tax?: number; metadata?: { order_type?: string };
    line_items?: Array<{
      id?: string; sku?: string; variant_id?: number; product_id?: string; quantity?: number;
      cost?: number; shipping_cost?: number; status?: string;
      metadata?: { sku?: string; price?: number; title?: string };
    }>;
  };
  const printifyOrders: PrintifyOrder[] = [];
  let printifyRaw = "";
  for (let page = 1; page <= 5; page += 1) {
    const response = await fetch(
      `https://api.printify.com/v1/shops/${printifyShopId}/orders.json?limit=50&page=${page}`,
      {
        headers: { Authorization: `Bearer ${printifyToken}`, "User-Agent": "Goldie-Listing-Factory" },
        signal: AbortSignal.timeout(25_000),
      });
    calls.printify += 1;
    if (!response.ok) break;
    const text = await response.text();
    printifyRaw += text;
    const body = JSON.parse(text) as { data?: PrintifyOrder[]; last_page?: number };
    printifyOrders.push(...(body.data ?? []));
    if (!body.data?.length || page >= Number(body.last_page ?? 1)) break;
  }

  /*
    DOES AN ETSY IDENTIFIER APPEAR ANYWHERE IN THE PRINTIFY PAYLOAD?

    Rather than trusting that external_id is the only place it could be, every
    receipt and transaction id is searched for across the entire raw response.
    If one turns up in a field nobody expected, that is the exact match path
    and the SKU fallback should never be used.
  */
  const identifierHits: Array<{ kind: string; id: number }> = [];
  for (const receipt of receipts) {
    const receiptId = String(receipt.receipt_id ?? "");
    if (receiptId && printifyRaw.includes(receiptId))
      identifierHits.push({ kind: "receipt_id", id: Number(receiptId) });
    for (const transaction of receipt.transactions ?? []) {
      const transactionId = String(transaction.transaction_id ?? "");
      if (transactionId && printifyRaw.includes(transactionId))
        identifierHits.push({ kind: "transaction_id", id: Number(transactionId) });
    }
  }

  const printifyLines: PrintifyLine[] = [];
  let productionCost = money(0, currency);
  let productionShipping = money(0, currency);
  let printifyTax = money(0, currency);
  const costOf = new Map<string, { cost: Money; shipping: Money }>();

  for (const order of printifyOrders) {
    const createdAt = Math.floor(Date.parse(String(order.created_at ?? "").replace(" ", "T")) / 1000) || 0;
    printifyTax = add(printifyTax, fromPrintify(order.total_tax, currency));
    for (const item of order.line_items ?? []) {
      const cost = fromPrintify(item.cost, currency);
      const shipping = fromPrintify(item.shipping_cost, currency);
      const lineItemId = String(item.id ?? `${order.id}-${item.product_id}`);
      costOf.set(lineItemId, { cost, shipping });
      printifyLines.push({
        orderId: String(order.id ?? ""),
        appOrderId: String(order.app_order_id ?? ""),
        externalId: String(order.external_id ?? ""),
        shopOrderId: String(order.shop_order_id ?? ""),
        lineItemId,
        sku: String(item.metadata?.sku ?? item.sku ?? ""),
        variantId: Number(item.variant_id ?? 0),
        productId: String(item.product_id ?? ""),
        quantity: Number(item.quantity ?? 1),
        createdAt,
        status: String(item.status ?? order.status ?? ""),
      });
    }
  }

  const result = reconcile(etsyLines, printifyLines);

  /* Only costs actually tied to a sale count toward this month's production
     spend. A Printify order with no matching sale is reported separately. */
  const missingCost: Array<{ transactionId: number; listingId: number; sku: string }> = [];
  for (const outcome of result.outcomes) {
    if (outcome.state === "matched") {
      const held = costOf.get(outcome.printify.lineItemId);
      if (held) {
        productionCost = add(productionCost, held.cost);
        productionShipping = add(productionShipping, held.shipping);
      }
    } else if (outcome.state === "etsy_without_printify" || outcome.state === "ambiguous") {
      missingCost.push({
        transactionId: outcome.etsy.transactionId,
        listingId: outcome.etsy.listingId,
        sku: outcome.etsy.sku,
      });
    }
  }

  const revenue = add(productRevenue, shippingCollected);
  const knownCosts = add(productionCost, productionShipping, refunded);
  const profitSoFar = subtract(revenue, knownCosts);

  /* Anonymous by construction: ids, SKUs, quantities and money only. */
  const examples = result.outcomes
    .filter(outcome => outcome.state === "matched")
    .slice(0, 3)
    .map(outcome => {
      const matched = outcome as Extract<typeof outcome, { state: "matched" }>;
      const held = costOf.get(matched.printify.lineItemId);
      return {
        method: matched.method,
        etsy: {
          receiptId: matched.etsy.receiptId,
          transactionId: matched.etsy.transactionId,
          listingId: matched.etsy.listingId,
          sku: matched.etsy.sku,
          quantity: matched.etsy.quantity,
        },
        printify: {
          orderId: matched.printify.orderId,
          lineItemId: matched.printify.lineItemId,
          sku: matched.printify.sku,
          quantity: matched.printify.quantity,
        },
        productionCost: held ? format(held.cost) : null,
        productionShipping: held ? format(held.shipping) : null,
      };
    });

  return NextResponse.json({
    window: { fromUnix: from, toUnix: to },
    shops: { etsy: etsyShopId, printify: printifyShopId },
    calls,
    etsy: {
      receipts: receipts.length,
      transactions: etsyLines.length,
      productRevenue: format(productRevenue),
      shippingCollected: format(shippingCollected),
      discounts: format(discounts),
      refunds: format(refunded),
      /* Excluded from revenue on purpose. */
      marketplaceTaxExcluded: format(salesTax),
    },
    printify: {
      orders: printifyOrders.length,
      lineItems: printifyLines.length,
      productionCostMatched: format(productionCost),
      productionShippingMatched: format(productionShipping),
      taxOnAllOrders: format(printifyTax),
    },
    identifierHits,
    reconciliation: { counts: result.counts, byMethod: result.byMethod },
    ordersMissingProductionCost: missingCost.length,
    missingCostExamples: missingCost.slice(0, 5),
    /*
      NOT CALLED PROFIT WHILE ANYTHING IS MISSING.

      Etsy's own fees are not in this figure yet — the ledger call still has to
      be settled — so this is revenue minus the production costs that could be
      tied to a sale, and it is named for exactly that.
    */
    revenueMinusMatchedCosts: format(profitSoFar),
    complete: missingCost.length === 0,
    stillMissing: [
      ...(missingCost.length ? ["production cost for some sales"] : []),
      "Etsy transaction and processing fees",
      "listing and renewal fees",
      "Offsite Ads fees",
    ],
    examples,
  });
});
