import { classifyLedgerType, isUnmapped, type Bucket } from "./finance-classify.ts";

/**
 * THE MONTHLY TRUTH, AND THE CONDITIONS IT DEPENDS ON.
 *
 * Profit is not a calculation, it is a claim — and the claim is only as good
 * as the completeness of what went into it. A month missing one production
 * cost still produces a number; that number is just wrong, and nothing about
 * its appearance says so.
 *
 * So completeness is checked FIRST and explicitly, and the profit figure only
 * exists when every condition holds. When it does not, the reasons are
 * returned rather than a smaller number.
 *
 * ROLLUPS ARE RECOMPUTABLE, ALWAYS. Late refunds, fee reversals, newly
 * matched orders and manual adjustments all change a month that was already
 * shown. A profit calculated once and frozen is a profit that quietly stops
 * being true.
 */
export const RULE_VERSION = 1;

export type Row = {
  sourceId: string;
  rawType: string;
  amountMinor: number;
  currency: string;
  atSeconds: number;
  receiptId?: number | null;
};

export type ProductionRow = {
  receiptId: number | null;
  costMinor: number;
  shippingMinor: number;
  currency: string;
  canceled: boolean;
  countsAsEtsyCost: boolean;
};

export type Adjustment = {
  id: string;
  month: string;
  amountMinor: number;
  currency: string;
  kind: "production-cost" | "production-shipping" | "refund-correction"
    | "exclude-order" | "no-production-cost" | "resolve-ambiguity";
  /* An estimate can inform a figure but can never make a month complete. */
  estimated: boolean;
  reversedBy?: string | null;
};

export type Completeness = {
  complete: boolean;
  failures: string[];
};

export type Rollup = {
  month: string;
  currency: string;
  ruleVersion: number;
  computedAt: number;
  byBucket: Record<Bucket, number>;
  productRevenueMinor: number;
  shippingCollectedMinor: number;
  discountsMinor: number;
  refundsMinor: number;
  marketplaceTaxMinor: number;
  grossSellerRevenueMinor: number;
  etsyTransactionFeesMinor: number;
  etsyProcessingFeesMinor: number;
  etsyListingFeesMinor: number;
  etsyAdvertisingFeesMinor: number;
  etsyOtherFeesMinor: number;
  productionCostMinor: number;
  productionShippingMinor: number;
  adjustmentsMinor: number;
  coverage: {
    receipts: number; matchedReceipts: number;
    revenueCoverage: number; feeCoverage: number; productionCoverage: number;
    costCompleteRevenueMinor: number; incompleteRevenueMinor: number;
  };
  completeness: Completeness;
  knownOperatingProfitMinor: number | null;
  profitMarginPercent: number | null;
  /* Always available, always labelled with its coverage. Never the headline. */
  knownOrderMargin: { minor: number; coveragePercent: number; label: string } | null;
  unmappedTypes: string[];
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function rollUp(
  { month, currency, rows, production, adjustments, receipts, matchedReceipts,
    staleSources, incompleteWindows, currencyConflict, unresolvedAmbiguity }:
  { month: string; currency: string; rows: Row[]; production: ProductionRow[];
    adjustments: Adjustment[]; receipts: number; matchedReceipts: number;
    staleSources: string[]; incompleteWindows: number;
    currencyConflict: boolean; unresolvedAmbiguity: number },
): Rollup {
  const classified = rows.map(row => ({ row, kind: classifyLedgerType(row.rawType) }));
  const unmappedTypes = [...new Set(classified.filter(entry => isUnmapped(entry.kind))
    .map(entry => entry.row.rawType))];

  const total = (normalized: string) =>
    sum(classified.filter(entry => entry.kind.normalized === normalized)
      .map(entry => entry.row.amountMinor));

  const byBucket = { revenue: 0, cost: 0, tax: 0, payout: 0, neither: 0 } as Record<Bucket, number>;
  for (const entry of classified) byBucket[entry.kind.bucket] += entry.row.amountMinor;

  const productRevenue = total("product-revenue");
  const shipping = total("shipping-collected");
  const refunds = total("refund");
  const tax = total("marketplace-tax");
  /* Tax never enters seller revenue. It was Etsy's to collect and remit. */
  const grossSellerRevenue = productRevenue + shipping + refunds;

  const live = production.filter(entry => !entry.canceled && entry.countsAsEtsyCost);
  const productionCost = sum(live.map(entry => entry.costMinor));
  const productionShipping = sum(live.map(entry => entry.shippingMinor));

  const active = adjustments.filter(entry => !entry.reversedBy);
  const adjustmentsTotal = sum(active.map(entry => entry.amountMinor));
  const estimatedAdjustments = active.filter(entry => entry.estimated);

  const withProduction = production.filter(entry =>
    entry.canceled || !entry.countsAsEtsyCost || entry.costMinor > 0).length;
  const productionCoverage = production.length ? withProduction / production.length : 0;
  const revenueCoverage = receipts ? matchedReceipts / receipts : 0;
  const feeRows = classified.filter(entry => entry.kind.bucket === "cost").length;
  const feeCoverage = receipts ? Math.min(1, feeRows / Math.max(1, receipts)) : 0;

  /*
    Each condition names itself when it fails, so "incomplete" is actionable
    instead of mysterious.
  */
  const failures: string[] = [];
  if (currencyConflict) failures.push("This month holds more than one currency.");
  if (incompleteWindows > 0)
    failures.push(`${incompleteWindows} ledger window${incompleteWindows === 1 ? "" : "s"} did not complete.`);
  if (staleSources.length) failures.push(`Stale sources: ${staleSources.join(", ")}.`);
  if (receipts > 0 && matchedReceipts < receipts)
    failures.push(`${receipts - matchedReceipts} of ${receipts} receipts have no matched production order.`);
  if (productionCoverage < 1)
    failures.push("Some non-canceled production orders have no known cost.");
  if (unresolvedAmbiguity > 0)
    failures.push(`${unresolvedAmbiguity} ambiguous match${unresolvedAmbiguity === 1 ? "" : "es"} unresolved.`);
  if (estimatedAdjustments.length)
    failures.push(`${estimatedAdjustments.length} adjustment${estimatedAdjustments.length === 1 ? " is" : "s are"} estimated. An estimate cannot complete a month.`);
  if (!receipts) failures.push("No receipts ingested for this month.");

  const complete = failures.length === 0;
  const costs = total("etsy-transaction-fee") + total("etsy-processing-fee")
    + total("etsy-listing-fee") + total("etsy-renewal-fee")
    + total("etsy-advertising-fee") + total("etsy-offsite-ads-fee")
    + total("etsy-operating-fee") + total("fee-credit");
  const operatingProfit = grossSellerRevenue + costs - productionCost - productionShipping
    + adjustmentsTotal;

  /*
    The known-order margin exists so a shop with gaps is not useless — but it
    is returned as its own field, carrying its coverage in its own label, so
    it cannot be mistaken for the month.
  */
  const coveragePercent = Math.round(revenueCoverage * 100);
  const knownOrderMargin = matchedReceipts > 0 && !complete
    ? { minor: operatingProfit, coveragePercent,
        label: `Known-order margin across ${coveragePercent}% of revenue` }
    : null;

  return {
    month, currency, ruleVersion: RULE_VERSION, computedAt: Math.floor(Date.now() / 1_000),
    byBucket,
    productRevenueMinor: productRevenue,
    shippingCollectedMinor: shipping,
    discountsMinor: total("seller-discount"),
    refundsMinor: refunds,
    marketplaceTaxMinor: tax,
    grossSellerRevenueMinor: grossSellerRevenue,
    etsyTransactionFeesMinor: total("etsy-transaction-fee"),
    etsyProcessingFeesMinor: total("etsy-processing-fee"),
    etsyListingFeesMinor: total("etsy-listing-fee") + total("etsy-renewal-fee"),
    etsyAdvertisingFeesMinor: total("etsy-advertising-fee") + total("etsy-offsite-ads-fee"),
    etsyOtherFeesMinor: total("etsy-operating-fee") + total("fee-credit"),
    productionCostMinor: productionCost,
    productionShippingMinor: productionShipping,
    adjustmentsMinor: adjustmentsTotal,
    coverage: {
      receipts, matchedReceipts,
      revenueCoverage, feeCoverage, productionCoverage,
      costCompleteRevenueMinor: Math.round(grossSellerRevenue * revenueCoverage),
      incompleteRevenueMinor: grossSellerRevenue - Math.round(grossSellerRevenue * revenueCoverage),
    },
    completeness: { complete, failures },
    /* Null unless every condition held. This is the whole point. */
    knownOperatingProfitMinor: complete ? operatingProfit : null,
    profitMarginPercent: complete && grossSellerRevenue > 0
      ? Math.round((operatingProfit / grossSellerRevenue) * 1_000) / 10 : null,
    knownOrderMargin,
    unmappedTypes,
  };
}

/** Anything that should force a month to be computed again. */
export const RECOMPUTE_TRIGGERS = [
  "late-refund", "fee-reversal", "newly-matched-order", "adjustment-entered",
  "adjustment-reversed", "currency-correction", "divisor-correction",
  "reconciliation-rules-changed", "source-refreshed",
] as const;

export const needsRecompute = (
  { storedRuleVersion, trigger }: { storedRuleVersion: number; trigger?: string },
) => storedRuleVersion !== RULE_VERSION
  || (Boolean(trigger) && (RECOMPUTE_TRIGGERS as readonly string[]).includes(trigger!));
