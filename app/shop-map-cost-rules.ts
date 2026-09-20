/**
 * TWO PROFIT NUMBERS, NEVER COMPETING FOR THE SAME SPOT.
 *
 * Most of this shop's history has no production cost and never will:
 * Printify keeps 23 orders and Etsy keeps years. Refusing to show anything
 * makes Goldie useless for that history; showing an estimate as though it
 * were measured makes Goldie a liar.
 *
 * So there is exactly one headline number and it is always labelled for what
 * it is. Estimated becomes Verified on its own when coverage reaches
 * everything, and the two never appear side by side as rival figures.
 */
export type CostSource =
  | "current-exact-product"
  | "exact-product-family-rule"
  | "member-entered-adjustment"
  | "unavailable";

export type CostConfidence = "verified" | "estimated" | "none";

export const confidenceOf = (source: CostSource): CostConfidence =>
  source === "current-exact-product" ? "verified"
    : source === "unavailable" ? "none"
    : "estimated";

export type CostRule = {
  /* A family rule applies to a product family, never to a title. */
  productFamily: string;
  costMinor: number;
  shippingMinor: number;
  currency: string;
  confirmedByMember: boolean;
};

export type OrderCost = {
  receiptId: number;
  productFamily: string;
  /* Present when the Printify order survived and is matched exactly. */
  verifiedCostMinor: number | null;
  verifiedShippingMinor: number | null;
};

export type ResolvedCost = {
  receiptId: number;
  costMinor: number;
  source: CostSource;
  confidence: CostConfidence;
  why: string;
};

/**
 * Resolve one order's production cost.
 *
 * The order is strict and the fallbacks are explicit. TITLE SIMILARITY IS NOT
 * A STEP: two listings can share every word and sit on different blanks with
 * different costs, and a cost chosen that way would look exactly as
 * authoritative as a real one.
 */
export function resolveCost(
  order: OrderCost,
  { familyRules = new Map<string, CostRule>(), adjustments = new Map<number, number>() }:
  { familyRules?: Map<string, CostRule>; adjustments?: Map<number, number> } = {},
): ResolvedCost {
  /* 3. A member's own correction outranks everything: they looked. */
  const adjustment = adjustments.get(order.receiptId);
  if (adjustment !== undefined)
    return { receiptId: order.receiptId, costMinor: adjustment,
      source: "member-entered-adjustment", confidence: "estimated",
      why: "Entered by the member for this order." };

  /* 1. The surviving Printify order, which is a measurement. */
  if (order.verifiedCostMinor !== null)
    return { receiptId: order.receiptId,
      costMinor: order.verifiedCostMinor + (order.verifiedShippingMinor ?? 0),
      source: "current-exact-product", confidence: "verified",
      why: "The matched Printify order's own cost." };

  /* 2. A family rule the member confirmed. Unconfirmed rules are not used:
        an unreviewed guess is still a guess. */
  const rule = familyRules.get(order.productFamily);
  if (rule?.confirmedByMember)
    return { receiptId: order.receiptId, costMinor: rule.costMinor + rule.shippingMinor,
      source: "exact-product-family-rule", confidence: "estimated",
      why: `Confirmed ${order.productFamily} cost rule.` };

  return { receiptId: order.receiptId, costMinor: 0, source: "unavailable",
    confidence: "none", why: "No production cost is known for this order." };
}

export type ProfitState = {
  headline: "Verified profit" | "Estimated profit" | "Profit unavailable";
  profitMinor: number | null;
  /* The single accuracy line under the number. */
  accuracy: string;
  verifiedShare: number;
  estimatedShare: number;
  unavailableShare: number;
};

/**
 * One headline, chosen by coverage.
 *
 * Verified only when every order's cost was measured. One estimated order in
 * a month makes the whole month estimated, because a member reads the
 * headline as describing the month.
 */
export function profitState(
  { grossRevenueMinor, feesMinor, costs, otherComplete = true }:
  { grossRevenueMinor: number; feesMinor: number; costs: ResolvedCost[];
    otherComplete?: boolean },
): ProfitState {
  const total = costs.length;
  const verified = costs.filter(cost => cost.confidence === "verified").length;
  const estimated = costs.filter(cost => cost.confidence === "estimated").length;
  const missing = costs.filter(cost => cost.confidence === "none").length;
  const share = (count: number) => total ? count / total : 0;

  const spent = costs.reduce((sum, cost) => sum + cost.costMinor, 0);
  const profit = grossRevenueMinor + feesMinor - spent;

  /* A number is not profit if Etsy's revenue/fee import is incomplete. Hiding
     that uncertainty behind "estimated" produced a confident, inflated total
     from a partial ledger. */
  if (!otherComplete)
    return { headline: "Profit unavailable", profitMinor: null,
      accuracy: "Etsy sales or fee data is still syncing",
      verifiedShare: share(verified), estimatedShare: share(estimated),
      unavailableShare: share(missing) };

  /* An order with no cost at all cannot be estimated away. */
  if (!total || missing > 0)
    return { headline: "Profit unavailable", profitMinor: null,
      accuracy: total
        ? `Production costs missing for ${missing} of ${total} orders`
        : "No orders in this month",
      verifiedShare: share(verified), estimatedShare: share(estimated),
      unavailableShare: share(missing) };

  const allVerified = verified === total;
  return {
    headline: allVerified ? "Verified profit" : "Estimated profit",
    profitMinor: profit,
    accuracy: allVerified
      ? "Production costs verified for 100% of revenue"
      : `Production costs verified for ${Math.round(share(verified) * 100)}% of revenue`,
    verifiedShare: share(verified),
    estimatedShare: share(estimated),
    unavailableShare: 0,
  };
}
