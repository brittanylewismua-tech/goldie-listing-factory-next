import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyConnection, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { addMoney, formatMoney, fromEtsy, fromPrintify, minorUnits, subtractMoney, type Money } from "@/app/shop-map-money";
import { reconcile, type EtsyLine, type PrintifyLine } from "@/app/shop-map-match";
import { printifyCall } from "../../../printify-call.ts";

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
  let productRevenue = minorUnits(0, currency);
  let shippingCollected = minorUnits(0, currency);
  let discounts = minorUnits(0, currency);
  let refunded = minorUnits(0, currency);
  let salesTax = minorUnits(0, currency);

  for (const receipt of receipts) {
    const createdAt = Number(receipt.created_timestamp ?? receipt.create_timestamp ?? 0);
    shippingCollected = addMoney(shippingCollected, fromEtsy(receipt.total_shipping_cost, currency));
    discounts = addMoney(discounts, fromEtsy(receipt.discount_amt, currency));
    /* Marketplace-collected tax is not the seller's revenue and never enters
       the total. It is reported so its absence is visible rather than
       mysterious. */
    salesTax = addMoney(salesTax, fromEtsy(receipt.total_tax_cost, currency),
      fromEtsy(receipt.total_vat_cost, currency));
    for (const refund of receipt.refunds ?? [])
      refunded = addMoney(refunded, fromEtsy(refund.amount, currency));

    for (const transaction of receipt.transactions ?? []) {
      const line = fromEtsy(transaction.price, currency);
      productRevenue = addMoney(productRevenue,
        minorUnits(line.minor * Number(transaction.quantity ?? 1), currency));
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
    total_tax?: number;
    /*
      THE ETSY RECEIPT ID LIVES HERE, not at the top level.

      Measured: top-level external_id and shop_order_id are empty on all
      twenty-three of this shop's orders, and a search of the raw payload found
      fourteen Etsy receipt ids inside metadata.shop_order_id and
      metadata.shop_order_label. Reading only the top level is what made SKU
      look like the strongest available match; it is not.
    */
    metadata?: { order_type?: string; shop_order_id?: string; shop_order_label?: string };
    line_items?: Array<{
      id?: string; sku?: string; variant_id?: number; product_id?: string; quantity?: number;
      cost?: number; shipping_cost?: number; status?: string;
      metadata?: { sku?: string; price?: number; title?: string };
    }>;
  };
  const printifyOrders: PrintifyOrder[] = [];
  let printifyRaw = "";
  let printifyPages = 0;
  let printifyLastPage = 0;
  let printifyTotal = 0;
  /* Deep enough to reach the start of the Etsy window. Printify pages with
     ?page=, reports last_page, and returns newest first. */
  for (let page = 1; page <= 40; page += 1) {
    const response = await printifyCall(
      `https://api.printify.com/v1/shops/${printifyShopId}/orders.json?limit=50&page=${page}`,
      {
        headers: { Authorization: `Bearer ${printifyToken}`, "User-Agent": "Goldie-Listing-Factory" },
        signal: AbortSignal.timeout(25_000),
      }, { feature: "finance", userId: user.userId });
    calls.printify += 1;
    if (!response.ok) break;
    const text = await response.text();
    printifyRaw += text;
    const body = JSON.parse(text) as { data?: PrintifyOrder[]; last_page?: number; total?: number };
    printifyPages += 1;
    printifyLastPage = Number(body.last_page ?? printifyLastPage);
    printifyTotal = Number(body.total ?? printifyTotal);
    printifyOrders.push(...(body.data ?? []));
    if (!body.data?.length || page >= Number(body.last_page ?? 1)) break;
    /* Stop once a page's oldest order predates the window: everything beyond
       it is older still, and paging on would spend calls for nothing. */
    const oldest = Math.min(...(body.data ?? []).map(row =>
      Math.floor(Date.parse(String(row.created_at ?? "").replace(" ", "T")) / 1000) || Infinity));
    if (Number.isFinite(oldest) && oldest < from) break;
  }

  /*
    DOES AN ETSY IDENTIFIER APPEAR ANYWHERE IN THE PRINTIFY PAYLOAD?

    Rather than trusting that external_id is the only place it could be, every
    receipt and transaction id is searched for across the entire raw response.
    If one turns up in a field nobody expected, that is the exact match path
    and the SKU fallback should never be used.
  */
  /*
    WHERE, EXACTLY.

    Knowing an Etsy id appears somewhere in the payload is not enough to match
    on — the field it lives in is the match path, and a substring hit could be
    coincidence. This walks the parsed orders and reports the key path of any
    value equal to an Etsy id, so the matcher can be built on a field rather
    than on a text search.
  */
  const locate = (value: unknown, needle: string, path: string, found: string[]) => {
    if (found.length > 4) return;
    if (value === null || value === undefined) return;
    if (typeof value === "object") {
      if (Array.isArray(value)) value.forEach((item, index) => locate(item, needle, `${path}[${index}]`, found));
      else for (const [key, inner] of Object.entries(value as Record<string, unknown>))
        locate(inner, needle, path ? `${path}.${key}` : key, found);
      return;
    }
    if (String(value) === needle) found.push(path);
  };

  const identifierPaths = new Map<string, number>();
  const identifierHits: Array<{ kind: string; id: number }> = [];
  for (const receipt of receipts) {
    const receiptId = String(receipt.receipt_id ?? "");
    if (receiptId && printifyRaw.includes(receiptId)) {
      identifierHits.push({ kind: "receipt_id", id: Number(receiptId) });
      const where: string[] = [];
      for (const order of printifyOrders) locate(order, receiptId, "", where);
      for (const path of where)
        identifierPaths.set(
          /* Array indexes vary per order; the shape is what matters. */
          path.replace(/\[\d+\]/g, "[]"),
          (identifierPaths.get(path.replace(/\[\d+\]/g, "[]")) ?? 0) + 1);
    }
    for (const transaction of receipt.transactions ?? []) {
      const transactionId = String(transaction.transaction_id ?? "");
      if (transactionId && printifyRaw.includes(transactionId))
        identifierHits.push({ kind: "transaction_id", id: Number(transactionId) });
    }
  }

  const printifyLines: PrintifyLine[] = [];
  let productionCost = minorUnits(0, currency);
  let productionShipping = minorUnits(0, currency);
  let printifyTax = minorUnits(0, currency);
  const costOf = new Map<string, { cost: Money; shipping: Money }>();

  for (const order of printifyOrders) {
    const createdAt = Math.floor(Date.parse(String(order.created_at ?? "").replace(" ", "T")) / 1000) || 0;
    printifyTax = addMoney(printifyTax, fromPrintify(order.total_tax, currency));
    for (const item of order.line_items ?? []) {
      const cost = fromPrintify(item.cost, currency);
      const shipping = fromPrintify(item.shipping_cost, currency);
      const lineItemId = String(item.id ?? `${order.id}-${item.product_id}`);
      costOf.set(lineItemId, { cost, shipping });
      printifyLines.push({
        orderId: String(order.id ?? ""),
        appOrderId: String(order.app_order_id ?? ""),
        externalId: String(order.external_id ?? ""),
        shopOrderId: String(order.shop_order_id ?? order.metadata?.shop_order_id
          ?? order.metadata?.shop_order_label ?? ""),
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

  /*
    COHORTS MUST NOT BE MIXED.

    The first version of this report subtracted the production costs of
    fourteen matched orders from the revenue of all thirty-five receipts and
    called the difference "revenue minus matched costs". Anybody can do that
    arithmetic and it means nothing — it flatters the figure by counting
    revenue whose costs are simply unknown. Every number below is computed
    over one named cohort.
  */
  const matchedPairs = result.outcomes.filter(
    (outcome): outcome is Extract<typeof outcome, { state: "matched" }> =>
      outcome.state === "matched");

  /* A receipt counts as matched only when EVERY transaction on it matched.
     One matched line and one unmatched line makes the receipt partial, and
     its revenue belongs to neither cohort until the rest is found. */
  const linesByReceipt = new Map<number, EtsyLine[]>();
  for (const line of etsyLines) {
    const held = linesByReceipt.get(line.receiptId) ?? [];
    held.push(line);
    linesByReceipt.set(line.receiptId, held);
  }
  const matchedTransactionIds = new Set(matchedPairs.map(pair => pair.etsy.transactionId));
  const fullyMatched = new Set<number>();
  const partiallyMatched = new Set<number>();
  for (const [receiptId, lines] of linesByReceipt) {
    const hits = lines.filter(line => matchedTransactionIds.has(line.transactionId)).length;
    if (hits === lines.length) fullyMatched.add(receiptId);
    else if (hits > 0) partiallyMatched.add(receiptId);
  }

  const cohort = (keep: (receiptId: number) => boolean) => {
    let product = minorUnits(0, currency);
    let shipping = minorUnits(0, currency);
    let discount = minorUnits(0, currency);
    let refund = minorUnits(0, currency);
    let count = 0;
    for (const receipt of receipts) {
      const receiptId = Number(receipt.receipt_id ?? 0);
      if (!keep(receiptId)) continue;
      count += 1;
      shipping = addMoney(shipping, fromEtsy(receipt.total_shipping_cost, currency));
      discount = addMoney(discount, fromEtsy(receipt.discount_amt, currency));
      for (const row of receipt.refunds ?? [])
        refund = addMoney(refund, fromEtsy(row.amount, currency));
      for (const transaction of receipt.transactions ?? [])
        product = addMoney(product, minorUnits(
          fromEtsy(transaction.price, currency).minor * Number(transaction.quantity ?? 1), currency));
    }
    return { count, product, shipping, discount, refund };
  };

  const matchedCohort = cohort(id => fullyMatched.has(id));
  const partialCohort = cohort(id => partiallyMatched.has(id));
  const unmatchedCohort = cohort(id => !fullyMatched.has(id) && !partiallyMatched.has(id));

  let matchedProduction = minorUnits(0, currency);
  let matchedProductionShipping = minorUnits(0, currency);
  for (const pair of matchedPairs) {
    if (!fullyMatched.has(pair.etsy.receiptId)) continue;
    const held = costOf.get(pair.printify.lineItemId);
    if (!held) continue;
    matchedProduction = addMoney(matchedProduction, held.cost);
    matchedProductionShipping = addMoney(matchedProductionShipping, held.shipping);
  }

  /*
    LINE-ITEM PAIRING IS A SEPARATE CLAIM FROM RECEIPT PAIRING.

    An exact receipt-to-order match proves what the ORDER cost. It proves what
    a LISTING cost only when both sides carry exactly one line; otherwise the
    split between lines is unproven and allocating it would be invention.
  */
  const printifyLinesPerReceipt = new Map<string, number>();
  for (const row of printifyLines)
    if (row.shopOrderId)
      printifyLinesPerReceipt.set(row.shopOrderId,
        (printifyLinesPerReceipt.get(row.shopOrderId) ?? 0) + 1);
  const lineLevelProven = matchedPairs.filter(pair =>
    (linesByReceipt.get(pair.etsy.receiptId)?.length ?? 0) === 1 &&
    (printifyLinesPerReceipt.get(String(pair.etsy.receiptId)) ?? 0) === 1).length;

  const missingCost: Array<{ receiptId: number; transactionId: number; listingId: number; sku: string }> = [];
  for (const outcome of result.outcomes)
    if (outcome.state === "etsy_without_printify" || outcome.state === "ambiguous")
      missingCost.push({
        receiptId: outcome.etsy.receiptId, transactionId: outcome.etsy.transactionId,
        listingId: outcome.etsy.listingId, sku: outcome.etsy.sku,
      });

  /* Why a Printify record has no Etsy sale. A sample or a manual order never
     had a buyer, which is not a matching failure. */
  const unmatchedOrders = new Map<string, string>();
  for (const outcome of result.outcomes)
    if (outcome.state === "printify_without_etsy") {
      const order = printifyOrders.find(row => String(row.id ?? "") === outcome.printify.orderId);
      unmatchedOrders.set(outcome.printify.orderId,
        `${String(order?.metadata?.order_type ?? "unknown")}/${String(order?.status ?? outcome.printify.status)}`);
    }
  const unmatchedPrintifyReasons: Record<string, number> = {};
  for (const reason of unmatchedOrders.values())
    unmatchedPrintifyReasons[reason] = (unmatchedPrintifyReasons[reason] ?? 0) + 1;

  const matchedRevenue = addMoney(matchedCohort.product, matchedCohort.shipping);
  const matchedCosts = addMoney(matchedProduction, matchedProductionShipping, matchedCohort.refund);
  const allRevenue = addMoney(productRevenue, shippingCollected);
  const oldestPrintify = printifyOrders.length
    ? Math.min(...printifyOrders.map(row =>
      Math.floor(Date.parse(String(row.created_at ?? "").replace(" ", "T")) / 1000) || Infinity))
    : Infinity;

  const examples = matchedPairs.slice(0, 3).map(pair => {
    const held = costOf.get(pair.printify.lineItemId);
    return {
      method: pair.method,
      etsy: {
        receiptId: pair.etsy.receiptId, transactionId: pair.etsy.transactionId,
        listingId: pair.etsy.listingId, sku: pair.etsy.sku, quantity: pair.etsy.quantity,
      },
      printify: {
        orderId: pair.printify.orderId, lineItemId: pair.printify.lineItemId,
        sku: pair.printify.sku, quantity: pair.printify.quantity,
      },
      productionCost: held ? formatMoney(held.cost) : null,
      productionShipping: held ? formatMoney(held.shipping) : null,
      lineLevelProven: (linesByReceipt.get(pair.etsy.receiptId)?.length ?? 0) === 1 &&
        (printifyLinesPerReceipt.get(String(pair.etsy.receiptId)) ?? 0) === 1,
    };
  });

  return NextResponse.json({
    window: { fromUnix: from, toUnix: to },
    shops: { etsy: etsyShopId, printify: printifyShopId },
    calls,

    /* Named entities, each counted once, so no total has to be inferred from
       a number that turns out to be line items rather than orders. */
    entities: {
      etsyReceipts: receipts.length,
      etsyTransactions: etsyLines.length,
      printifyOrders: printifyOrders.length,
      printifyLineItems: printifyLines.length,
      matchedReceiptToOrderPairs: matchedPairs.length,
      fullyMatchedEtsyReceipts: fullyMatched.size,
      partiallyMatchedEtsyReceipts: partiallyMatched.size,
      unmatchedEtsyReceipts: unmatchedCohort.count,
      unmatchedPrintifyOrders: unmatchedOrders.size,
      unmatchedPrintifyLineItems: result.counts.printify_without_etsy ?? 0,
    },

    printifyPagination: {
      pagesRead: printifyPages,
      lastPageReported: printifyLastPage,
      ordersReportedByPrintify: printifyTotal,
      pageSize: 50,
      mechanism: "?page= with last_page; newest first",
      oldestOrderReached: Number.isFinite(oldestPrintify)
        ? new Date(oldestPrintify * 1000).toISOString() : null,
      reachedStartOfWindow: Number.isFinite(oldestPrintify) && oldestPrintify <= from,
    },

    identifierPaths: Object.fromEntries(identifierPaths),
    matchMethods: result.byMethod,

    matchedCohort: {
      receipts: matchedCohort.count,
      productRevenue: formatMoney(matchedCohort.product),
      shippingCollected: formatMoney(matchedCohort.shipping),
      discounts: formatMoney(matchedCohort.discount),
      refunds: formatMoney(matchedCohort.refund),
      productionCost: formatMoney(matchedProduction),
      productionShipping: formatMoney(matchedProductionShipping),
      /* NOT profit: Etsy's own fees are not in it yet. */
      revenueMinusProductionCosts: formatMoney(subtractMoney(matchedRevenue, matchedCosts)),
      lineLevelPairingProven: lineLevelProven,
      lineLevelPairingUnproven: matchedPairs.length - lineLevelProven,
    },

    unmatchedCohort: {
      receipts: unmatchedCohort.count,
      productRevenue: formatMoney(unmatchedCohort.product),
      shippingCollected: formatMoney(unmatchedCohort.shipping),
      profit: null,
      why: "No Printify order carries these receipt ids, so production cost is unknown.",
    },

    partiallyMatchedCohort: {
      receipts: partialCohort.count,
      productRevenue: formatMoney(partialCohort.product),
      profit: null,
      why: "Some transactions on these receipts matched and some did not, so the receipt cannot be split.",
    },

    unmatchedPrintifyReasons,

    coverage: {
      etsyRevenueWithKnownProductionCostPercent: allRevenue.minor > 0
        ? Math.round((matchedRevenue.minor / allRevenue.minor) * 1000) / 10 : 0,
      allEtsyRevenue: formatMoney(allRevenue),
      matchedEtsyRevenue: formatMoney(matchedRevenue),
      marketplaceTaxExcluded: formatMoney(salesTax),
    },

    stillMissing: [
      ...(missingCost.length ? [`production cost for ${missingCost.length} Etsy transactions`] : []),
      "Etsy transaction and processing fees",
      "listing and renewal fees",
      "Offsite Ads and regulatory fees",
    ],
    missingCostExamples: missingCost.slice(0, 5),
    /* Nothing here is profit, and the flag says so rather than relying on
       whoever reads it to notice. */
    profitAvailable: false,
    examples,
  });
});
