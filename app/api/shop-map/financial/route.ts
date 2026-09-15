import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { rollUp, RULE_VERSION } from "@/app/finance-rollup";
import { monthWindow, monthOf, MISSING_TIMEZONE } from "@/app/finance-month";
import { ensureFinanceTables, shopTimezone, financialHealth } from "@/app/finance-store";

/**
 * THE OWNER-ONLY FINANCIAL VIEW.
 *
 * Built before any member-facing polish, deliberately: the arithmetic has to
 * be defensible before it is made attractive, and a beautiful wrong number is
 * harder to disbelieve than an ugly one.
 *
 * The state is the first thing returned, because a figure read without its
 * state is the failure this whole design exists to prevent.
 *
 * NO BUYER DATA. Names, addresses and messages are never read, stored or
 * returned. Nothing here needs them.
 */
export const GET = withErrorLog("shop-map-financial", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureFinanceTables();
  const parameters = new URL(request.url).searchParams;
  const db = (env as unknown as { DB: D1Database }).DB;

  const shopRow = await db.prepare(
    `SELECT shop_id, shop_name FROM etsy_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`)
    .bind(user.userId).first<{ shop_id: number; shop_name: string }>();
  if (!shopRow) return NextResponse.json({ error: "No connected shop." }, { status: 400 });
  const shopId = Number(shopRow.shop_id);

  /* Without a timezone there is no month, so there is no figure. */
  const timezone = await shopTimezone(user.userId, shopId);
  if (!timezone)
    return NextResponse.json({ state: "Needs review", because: MISSING_TIMEZONE },
      { status: 200 });

  const month = parameters.get("month")
    ?? monthOf(Math.floor(Date.now() / 1_000), timezone)
    ?? "";
  const window = monthWindow(month, timezone);
  if (!window)
    return NextResponse.json({ state: "Needs review", because: MISSING_TIMEZONE });

  const rows = await db.prepare(
    `SELECT source_id, raw_type, amount_minor, currency, source_created_at, receipt_id
       FROM finance_ledger
      WHERE user_id = ? AND shop_id = ?
        AND source_created_at BETWEEN ? AND ?`)
    .bind(user.userId, shopId, window.from, window.to)
    .all<{ source_id: string; raw_type: string; amount_minor: number; currency: string;
      source_created_at: number; receipt_id: number | null }>();

  const production = await db.prepare(
    `SELECT receipt_id, cost_minor, shipping_minor, currency, canceled, counts_as_etsy_cost
       FROM finance_production
      WHERE user_id = ? AND shop_id = ? AND fulfilled_at BETWEEN ? AND ?`)
    .bind(user.userId, shopId, window.from, window.to)
    .all<{ receipt_id: number | null; cost_minor: number; shipping_minor: number;
      currency: string; canceled: number; counts_as_etsy_cost: number }>();

  const adjustments = await db.prepare(
    `SELECT id, month, amount_minor, currency, kind, estimated, reversed_by
       FROM finance_adjustments
      WHERE user_id = ? AND shop_id = ? AND month = ?`)
    .bind(user.userId, shopId, month)
    .all<{ id: string; month: string; amount_minor: number; currency: string;
      kind: string; estimated: number; reversed_by: string | null }>();

  const receiptRow = await db.prepare(
    `SELECT COUNT(*) AS receipts,
            SUM(CASE WHEN match_status IN ('fully-matched','canceled','refunded') THEN 1 ELSE 0 END) AS matched,
            SUM(CASE WHEN match_status = 'ambiguous' THEN 1 ELSE 0 END) AS ambiguous,
            SUM(CASE WHEN match_status = 'unmatched' THEN 1 ELSE 0 END) AS unmatched
       FROM finance_receipts
      WHERE user_id = ? AND shop_id = ? AND source_created_at BETWEEN ? AND ?`)
    .bind(user.userId, shopId, window.from, window.to)
    .first<{ receipts: number; matched: number; ambiguous: number; unmatched: number }>();

  const windowsRow = await db.prepare(
    `SELECT COUNT(*) AS incomplete FROM finance_windows
      WHERE user_id = ? AND shop_id = ? AND state <> 'complete'
        AND window_from <= ? AND window_to >= ?`)
    .bind(user.userId, shopId, window.to, window.from)
    .first<{ incomplete: number }>();

  const ledgerRows = rows.results ?? [];
  const currencies = new Set(ledgerRows.map(entry => String(entry.currency ?? "")).filter(Boolean));
  const staleSources = await staleList(user.userId, shopId);

  const summary = rollUp({
    month, currency: String([...currencies][0] ?? "USD"),
    rows: ledgerRows.map(entry => ({
      sourceId: entry.source_id, rawType: entry.raw_type,
      amountMinor: entry.amount_minor, currency: entry.currency,
      atSeconds: entry.source_created_at, receiptId: entry.receipt_id,
    })),
    production: (production.results ?? []).map(entry => ({
      receiptId: entry.receipt_id, costMinor: entry.cost_minor,
      shippingMinor: entry.shipping_minor, currency: entry.currency,
      canceled: Boolean(entry.canceled), countsAsEtsyCost: Boolean(entry.counts_as_etsy_cost),
    })),
    adjustments: (adjustments.results ?? []).map(entry => ({
      id: entry.id, month: entry.month, amountMinor: entry.amount_minor,
      currency: entry.currency, kind: entry.kind as never,
      estimated: Boolean(entry.estimated), reversedBy: entry.reversed_by,
    })),
    receipts: receiptRow?.receipts ?? 0,
    matchedReceipts: receiptRow?.matched ?? 0,
    staleSources,
    incompleteWindows: windowsRow?.incomplete ?? 0,
    currencyConflict: currencies.size > 1,
    unresolvedAmbiguity: receiptRow?.ambiguous ?? 0,
  });

  /* The banner. One word, decided before any figure is read. */
  const state = currencies.size > 1 ? "Mixed currency"
    : staleSources.length ? "Stale"
    : summary.completeness.complete ? "Complete"
    : (receiptRow?.ambiguous ?? 0) > 0 ? "Needs review"
    : "Incomplete";

  return NextResponse.json({
    state,
    shop: { shopId, shopName: shopRow.shop_name, timezone },
    month,
    ruleVersion: RULE_VERSION,
    lastRecomputedAt: summary.computedAt,
    freshness: { staleSources },
    /*
      A complete profit and an incomplete margin are returned under DIFFERENT
      keys, never the same one with a flag. A caller cannot accidentally
      render an incomplete figure where a complete one belongs.
    */
    completeProfit: summary.knownOperatingProfitMinor === null ? null : {
      minor: summary.knownOperatingProfitMinor,
      marginPercent: summary.profitMarginPercent,
      currency: summary.currency,
    },
    knownOrderMargin: summary.knownOrderMargin,
    profitUnavailableBecause: summary.completeness.failures,
    revenue: {
      productRevenueMinor: summary.productRevenueMinor,
      shippingCollectedMinor: summary.shippingCollectedMinor,
      discountsMinor: summary.discountsMinor,
      refundsMinor: summary.refundsMinor,
      marketplaceTaxMinor: summary.marketplaceTaxMinor,
      grossSellerRevenueMinor: summary.grossSellerRevenueMinor,
    },
    etsyFees: {
      transactionMinor: summary.etsyTransactionFeesMinor,
      processingMinor: summary.etsyProcessingFeesMinor,
      listingAndRenewalMinor: summary.etsyListingFeesMinor,
      advertisingMinor: summary.etsyAdvertisingFeesMinor,
      otherMinor: summary.etsyOtherFeesMinor,
    },
    production: {
      costMinor: summary.productionCostMinor,
      shippingMinor: summary.productionShippingMinor,
    },
    adjustments: summary.adjustmentsMinor,
    coverage: summary.coverage,
    review: {
      unmatchedEtsyReceipts: receiptRow?.unmatched ?? 0,
      ambiguousMatches: receiptRow?.ambiguous ?? 0,
      incompleteLedgerWindows: windowsRow?.incomplete ?? 0,
      unmappedLedgerTypes: summary.unmappedTypes,
    },
    health: await financialHealth(user.userId, shopId),
  });
});

async function staleList(userId: string, shopId: number): Promise<string[]> {
  const db = (env as unknown as { DB: D1Database }).DB;
  const row = await db.prepare(
    `SELECT source, refreshed_at FROM finance_sources WHERE user_id = ? AND shop_id = ?`)
    .bind(userId, shopId).all<{ source: string; refreshed_at: number }>()
    .catch(() => ({ results: [] as Array<{ source: string; refreshed_at: number }> }));
  const now = Math.floor(Date.now() / 1_000);
  /* Financial data refreshes less often than competitor watching, but being
     out of date matters more, so a day is the limit rather than six hours. */
  return ((row.results ?? []) as Array<{ source: string; refreshed_at: number }>)
    .filter(entry => now - Number(entry.refreshed_at) > 86_400)
    .map(entry => String(entry.source));
}
