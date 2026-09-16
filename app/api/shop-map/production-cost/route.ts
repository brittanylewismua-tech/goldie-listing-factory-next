import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requireFeatureApi } from "@/app/require-feature";
import { env } from "cloudflare:workers";
import {
  EXPLANATION, actionsFor, verdictFor, currencyCheck,
  type UnmatchedReason, type OrderCost, type CostBasis,
} from "@/app/production-cost";

/**
 * THE ORDERS WHOSE COST GOLDIE COULD NOT VERIFY, AND WHAT TO DO ABOUT THEM.
 *
 * NO BUYER INFORMATION. Not a name, not an address, not an email. The seller
 * already has all of that in Etsy; repeating it here would put it somewhere it
 * does not need to be, for no benefit.
 *
 * The diagnosis is evidence-led. Each reason below is reached by checking a
 * specific thing, and when none of them fits, it says `unknown` rather than
 * picking the most likely-sounding one.
 */
export const maxDuration = 120;

export const GET = withErrorLog("shop-map-production-cost", async (request: Request) => {
  const access = await requireFeatureApi("shopMap");
  if (!access.ok) return access.response;
  const user = access.user;

  const db = (env as unknown as { DB: D1Database }).DB;
  const month = (new URL(request.url).searchParams.get("month")
    ?? new Date().toISOString().slice(0, 7)).slice(0, 7);

  /* This month's orders, with whatever production evidence exists. */
  const rows = await db.prepare(
    `SELECT r.receipt_id AS receiptId, r.created_at AS createdAt,
            r.revenue_minor AS revenueMinor, r.currency AS currency,
            r.shop_id AS shopId,
            p.printify_order_id AS printifyOrderId,
            p.cost_minor AS costMinor, p.shipping_minor AS shippingMinor,
            p.status AS printifyStatus, p.canceled AS canceled,
            a.amount_minor AS adjustmentMinor, a.kind AS adjustmentKind,
            a.currency AS adjustmentCurrency
       FROM finance_receipts r
       LEFT JOIN finance_production p
         ON p.receipt_id = r.receipt_id AND p.user_id = r.user_id
       LEFT JOIN finance_adjustments a
         ON a.receipt_id = r.receipt_id AND a.user_id = r.user_id
      WHERE r.user_id = ? AND substr(r.created_at, 1, 7) = ?`)
    .bind(user.userId, month)
    .all<{ receiptId: number; createdAt: string; revenueMinor: number; currency: string;
      shopId: number; printifyOrderId: string | null; costMinor: number | null;
      shippingMinor: number | null; printifyStatus: string | null; canceled: number | null;
      adjustmentMinor: number | null; adjustmentKind: string | null;
      adjustmentCurrency: string | null }>()
    .catch(error => ({ results: [], error: error instanceof Error ? error.message : "failed" }));

  const failure = (rows as { error?: string }).error;
  if (failure) return NextResponse.json({ error: failure }, { status: 500 });

  /* Printify orders this member has that are not attached to any receipt —
     the only pool a link may be offered from. */
  const loose = await db.prepare(
    `SELECT printify_order_id AS id, cost_minor AS costMinor,
            shipping_minor AS shippingMinor, currency, status, created_at AS createdAt
       FROM finance_production
      WHERE user_id = ? AND (receipt_id IS NULL OR receipt_id = 0)`)
    .bind(user.userId)
    .all<{ id: string; costMinor: number; shippingMinor: number; currency: string;
      status: string; createdAt: string }>()
    .catch(() => ({ results: [] as Array<{ id: string; costMinor: number;
      shippingMinor: number; currency: string; status: string; createdAt: string }> }));

  const rules = await db.prepare(
    `SELECT family, base_cost_minor AS baseCostMinor FROM shop_map_cost_rules
      WHERE user_id = ?`)
    .bind(user.userId).all<{ family: string; baseCostMinor: number }>()
    .catch(() => ({ results: [] as Array<{ family: string; baseCostMinor: number }> }));
  const hasFamilyRule = (rules.results ?? []).length > 0;

  /* How far Printify ingestion has actually read, so "outside the window" is a
     fact rather than a guess. */
  const window = await db.prepare(
    `SELECT MIN(created_at) AS from_, MAX(created_at) AS to_ FROM finance_production
      WHERE user_id = ?`)
    .bind(user.userId).first<{ from_: string; to_: string }>().catch(() => null);

  const diagnose = (row: typeof rows.results[number]): UnmatchedReason => {
    if (Number(row.canceled ?? 0) === 1) return "canceled";
    if (!row.receiptId) return "receipt-id-missing";
    if (row.printifyOrderId && (row.costMinor === null || Number(row.costMinor) === 0))
      /* Printify has it and has not priced it yet. */
      return "printify-order-delayed";
    if (!row.printifyOrderId) {
      const created = row.createdAt ?? "";
      if (window?.to_ && created > String(window.to_))
        return "outside-reconciliation-window";
      if ((loose.results ?? []).length > 0) return "metadata-missing";
      return "absent-from-printify";
    }
    return "unknown";
  };

  const orders = (rows.results ?? []).map(row => {
    const adjusted = row.adjustmentMinor !== null && row.adjustmentMinor !== undefined;
    const verified = row.costMinor !== null && Number(row.costMinor) > 0;
    const basis: CostBasis = verified ? "printify-verified"
      : adjusted
        ? (row.adjustmentKind === "estimated-production-cost" ? "estimated" : "manually-confirmed")
        : "unavailable";
    const reason = basis === "unavailable" ? diagnose(row) : null;

    /* A candidate is only a candidate when the evidence is unambiguous: one
       loose Printify order in the same currency. */
    const candidates = basis === "unavailable"
      ? (loose.results ?? []).filter(order => order.currency === row.currency)
      : [];

    return {
      /* Safe for the seller: their own Etsy order number, nothing about who
         bought it. */
      receiptId: row.receiptId,
      orderDate: row.createdAt,
      revenueMinor: Number(row.revenueMinor) || 0,
      currency: row.currency || "USD",
      costBasis: basis,
      productionCostMinor: verified
        ? Number(row.costMinor) + Number(row.shippingMinor ?? 0)
        : adjusted ? Number(row.adjustmentMinor) : null,
      why: reason ? EXPLANATION[reason] : null,
      reasonCode: reason,
      actions: reason
        ? actionsFor(reason, { exactCandidates: candidates.length, hasFamilyRule })
        : [],
      /* Offered only when there is exactly one. */
      linkCandidate: candidates.length === 1
        ? { printifyOrderId: candidates[0].id,
            costMinor: Number(candidates[0].costMinor) + Number(candidates[0].shippingMinor ?? 0),
            currency: candidates[0].currency, createdAt: candidates[0].createdAt }
        : null,
      otherCandidates: candidates.length,
    };
  });

  const costs: OrderCost[] = orders.map(order => ({
    receiptId: order.receiptId, basis: order.costBasis,
    costMinor: order.productionCostMinor, currency: order.currency,
  }));

  return NextResponse.json({
    month,
    verdict: verdictFor(costs),
    currency: currencyCheck(costs),
    orders,
    /* What a member could set up to stop this recurring. */
    familyRules: rules.results ?? [],
    unmatchedPrintifyOrders: (loose.results ?? []).length,
    reconciliationWindow: window,
  });
});
