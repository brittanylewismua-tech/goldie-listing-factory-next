import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { readFinancialMonth } from "@/app/financial-month-read";
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

  const summary=await readFinancialMonth(user.userId,shopId,month,timezone);
  if(!summary)return NextResponse.json({state:"Needs review",because:"Choose a valid month."},{status:400});
  const state=summary.completeness.complete?"Complete":"Incomplete";
  return NextResponse.json({
    state,
    shop: { shopId, shopName: shopRow.shop_name, timezone },
    month,
    ruleVersion: RULE_VERSION,
    lastRecomputedAt: summary.computedAt,
    freshness: { staleSources: summary.completeness.failures.filter(reason=>reason.startsWith("Stale")) },
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
      unmatchedEtsyReceipts: summary.coverage.receipts-summary.coverage.matchedReceipts,
      ambiguousMatches: null,
      incompleteLedgerWindows: null,
      unmappedLedgerTypes: summary.unmappedTypes,
    },
    health: await financialHealth(user.userId, shopId),
  });
});
