/**
 * WHY A MONTH'S PROFIT IS UNAVAILABLE, AND WHAT WOULD FIX IT.
 *
 * "Profit unavailable" is a correct answer, and it is a dead end if the member
 * is never told which order caused it or what they could do. This is the
 * missing half: the diagnosis, the basis every cost carries, and the rules for
 * what a month may be called once a member has corrected something.
 *
 * THE RULE THAT SHAPES EVERYTHING HERE: A COST NEVER CHANGES BASIS BY BEING
 * USED. A figure a member typed is `manually-confirmed` forever; a figure a
 * saved rule produced is `estimated` forever. Neither becomes `printify-verified`
 * because it was convenient, and a month containing either says so.
 */
export type CostBasis =
  | "printify-verified"   /* an exact Printify order matched this receipt */
  | "manually-confirmed"  /* the member entered the real figure */
  | "estimated"           /* a saved product-family rule produced it */
  | "unavailable";        /* nothing does */

/** Every reason an Etsy order can fail to match a Printify production order. */
export type UnmatchedReason =
  | "absent-from-printify"
  | "printify-order-delayed"
  | "manually-fulfilled"
  | "metadata-missing"
  | "receipt-id-missing"
  | "canceled"
  | "fulfilled-elsewhere"
  | "outside-reconciliation-window"
  | "unknown";

export const EXPLANATION: Record<UnmatchedReason, string> = {
  "absent-from-printify":
    "No Printify order references this Etsy order. It may have been made "
    + "somewhere else, or by hand.",
  "printify-order-delayed":
    "Printify has the order but has not reported its cost yet. This usually "
    + "resolves on its own within a day or two.",
  "manually-fulfilled":
    "This order was fulfilled outside Printify, so there is no production "
    + "cost for it.",
  "metadata-missing":
    "An unlinked Printify order is close in date and uses the same currency. "
    + "Review both orders before confirming whether they belong together.",
  "receipt-id-missing":
    "This Etsy order has no receipt number to match against.",
  canceled: "This order was cancelled, so there is no production cost.",
  "fulfilled-elsewhere":
    "Another production service made this order. Only Printify is read.",
  "outside-reconciliation-window":
    "This Etsy sale is newer than the last Printify refresh. Refresh your numbers "
    + "to check whether Printify has a matching order.",
  unknown:
    "The reason this order has no production cost could not be worked out.",
};

/** What the member can do about it. Never more than the evidence supports. */
export type CorrectionAction = "link-printify-order" | "enter-cost" | "apply-rule" | "leave";

/**
 * HOW CLOSE IN TIME A LINK CANDIDATE HAS TO BE.
 *
 * Measured against the live data: the one unmatched Printify order was created
 * 2025-11-30 and was offered as the link for a 2026-09-08 Etsy receipt —
 * nine months apart, and the only candidate, so the "exactly one" rule
 * happily proposed it. Being the only one left is not evidence of anything.
 *
 * Production starts within days of an order, so anything outside this window
 * is a different sale and linking it would silently corrupt a month.
 */
export const LINK_WINDOW_SECONDS = 14 * 86_400;

export function plausibleLink(
  { receiptAt, orderAt, receiptCurrency, orderCurrency }:
  { receiptAt: number; orderAt: number; receiptCurrency: string; orderCurrency: string },
): { ok: true } | { ok: false; because: string } {
  if (receiptCurrency !== orderCurrency)
    return { ok: false, because: "the currencies differ" };
  if (!receiptAt || !orderAt)
    return { ok: false, because: "one of them has no date" };
  const gap = Math.abs(receiptAt - orderAt);
  if (gap > LINK_WINDOW_SECONDS)
    return { ok: false,
      because: `they are ${Math.round(gap / 86_400)} days apart` };
  return { ok: true };
}

export function actionsFor(
  reason: UnmatchedReason, { exactCandidates, hasFamilyRule }:
  { exactCandidates: number; hasFamilyRule: boolean },
): CorrectionAction[] {
  if (reason === "canceled") return ["leave"];
  const actions: CorrectionAction[] = [];
  /*
    ONE CANDIDATE, OR NONE.

    Offering a choice between three possible Printify orders asks the member to
    guess at Goldie's job, and a wrong link silently corrupts a month. Linking
    is offered only when exactly one order is supported by evidence.
  */
  if (exactCandidates === 1) actions.push("link-printify-order");
  actions.push("enter-cost");
  if (hasFamilyRule) actions.push("apply-rule");
  actions.push("leave");
  return actions;
}

export type OrderCost = {
  receiptId: number;
  basis: CostBasis;
  costMinor: number | null;
  currency: string;
};

export type MonthVerdict = {
  label: "verified" | "estimated" | "unavailable";
  headline: string;
  accuracy: string;
  profitAvailable: boolean;
};

/**
 * What a month may be called, given the basis of every cost in it.
 *
 * Deliberately pessimistic: one unavailable cost makes the month unavailable,
 * and one estimate makes the month estimated. A month is only verified when
 * every figure in it came from an exact record.
 */
export function verdictFor(costs: OrderCost[]): MonthVerdict {
  if (!costs.length)
    return { label: "unavailable", headline: "Profit unavailable",
      accuracy: "No orders this month.", profitAvailable: false };

  const missing = costs.filter(row => row.basis === "unavailable");
  if (missing.length)
    return {
      label: "unavailable", headline: "Profit unavailable",
      accuracy: `Production costs missing for ${missing.length} of ${costs.length} `
        + `order${costs.length === 1 ? "" : "s"}`,
      profitAvailable: false,
    };

  const estimated = costs.filter(row => row.basis === "estimated");
  const manual = costs.filter(row => row.basis === "manually-confirmed");
  if (estimated.length)
    return {
      label: "estimated", headline: "Estimated profit",
      accuracy: `${estimated.length} of ${costs.length} production costs come from `
        + `your saved estimates, so this is an estimate.`,
      profitAvailable: true,
    };
  if (manual.length)
    return {
      label: "verified", headline: "Profit",
      accuracy: `${manual.length} of ${costs.length} production costs were entered `
        + `by you; the rest came from Printify.`,
      profitAvailable: true,
    };
  return { label: "verified", headline: "Profit",
    accuracy: "Every production cost came from Printify.", profitAvailable: true };
}

/**
 * Currencies are never added together.
 *
 * A month holding two currencies has no single profit figure, and inventing
 * one by picking a rate would be a number nobody could check.
 */
export function currencyCheck(costs: OrderCost[]):
  { ok: true; currency: string } | { ok: false; because: string } {
  const currencies = [...new Set(costs.map(row => row.currency).filter(Boolean))];
  if (currencies.length > 1)
    return { ok: false,
      because: `This month mixes ${currencies.join(" and ")}. They will not be added `
        + `together, because the result would depend on an exchange rate nobody chose.` };
  return { ok: true, currency: currencies[0] ?? "USD" };
}

export type FamilyRule = {
  family: string;
  baseCostMinor: number;
  shippingMinor: number;
  currency: string;
  effectiveFrom: number;
};

/** The rule in force for a family on a date. Later rules never rewrite history. */
export function ruleFor(rules: FamilyRule[], family: string, at: number): FamilyRule | null {
  const applicable = rules
    .filter(rule => rule.family === family && rule.effectiveFrom <= at)
    .sort((a, b) => b.effectiveFrom - a.effectiveFrom);
  return applicable[0] ?? null;
}

/** An adjustment records what it is; it never overwrites the evidence. */
export const ADJUSTMENT_KINDS = {
  manualProduction: "manual-production-cost",
  estimatedProduction: "estimated-production-cost",
  linkedPrintify: "linked-printify-order",
} as const;
