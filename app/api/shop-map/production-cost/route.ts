import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requireFeatureApi } from "@/app/require-feature";
import { env } from "cloudflare:workers";
import {
  EXPLANATION, actionsFor, verdictFor, currencyCheck,
  plausibleLink,
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

  /*
    THE COLUMNS THE FINANCE TABLES ACTUALLY HAVE.

    Receipts carry `source_created_at` as an epoch integer and `grand_total_minor`,
    not `created_at` and `revenue_minor`. A first draft of this used the names
    that read well rather than the names that exist, D1 threw, and the member
    would have seen a broken screen. There is now a test comparing every column
    this route reads against the CREATE statements.
  */
  const monthStart = Math.floor(Date.parse(`${month}-01T00:00:00Z`) / 1000);
  const monthEnd = Math.floor(Date.parse(
    `${month}-01T00:00:00Z`) / 1000) + 32 * 86_400;
  const rows = await db.prepare(
    /*
      SELLER REVENUE, THE SAME NUMBER SHOP MAP AND HOME SHOW.

      This used `grand_total_minor`, which is what the BUYER paid — it includes
      marketplace tax the seller never receives. So the month read "$25.00"
      on two screens and the order inside it read "$26.49" on a third. Two
      member-facing screens calling different numbers "revenue" is the kind of
      contradiction that makes somebody distrust all three.
    */
    `SELECT r.receipt_id AS receiptId, r.source_created_at AS createdAt,
            (r.subtotal_minor + r.shipping_minor - r.seller_discount_minor)
              AS revenueMinor,
            r.currency AS currency,
            r.shop_id AS shopId, r.canceled AS receiptCanceled,
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
      WHERE r.user_id = ? AND r.source_created_at >= ? AND r.source_created_at < ?`)
    .bind(user.userId, monthStart, monthEnd)
    .all<{ receiptId: number; createdAt: number; revenueMinor: number; currency: string;
      shopId: number; receiptCanceled: number | null;
      printifyOrderId: string | null; costMinor: number | null;
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
            shipping_minor AS shippingMinor, currency, status,
            COALESCE(fulfilled_at, ingested_at) AS createdAt
       FROM finance_production
      WHERE user_id = ? AND (receipt_id IS NULL OR receipt_id = 0)`)
    .bind(user.userId)
    .all<{ id: string; costMinor: number; shippingMinor: number; currency: string;
      status: string; createdAt: number }>()
    .catch(() => ({ results: [] as Array<{ id: string; costMinor: number;
      shippingMinor: number; currency: string; status: string; createdAt: number }> }));

  const rules = await db.prepare(
    `SELECT product_family AS family, cost_minor AS baseCostMinor,
            shipping_minor AS shippingMinor, currency, confirmed
       FROM shop_map_cost_rules WHERE user_id = ?`)
    .bind(user.userId)
    .all<{ family: string; baseCostMinor: number; shippingMinor: number;
      currency: string; confirmed: number }>()
    .catch(() => ({ results: [] as Array<{ family: string; baseCostMinor: number;
      shippingMinor: number; currency: string; confirmed: number }> }));
  const hasFamilyRule = (rules.results ?? []).length > 0;

  /* How far Printify ingestion has actually read, so "outside the window" is a
     fact rather than a guess. */
  const window = await db.prepare(
    `SELECT MIN(COALESCE(fulfilled_at, ingested_at)) AS from_,
            MAX(COALESCE(fulfilled_at, ingested_at)) AS to_
       FROM finance_production WHERE user_id = ?`)
    .bind(user.userId).first<{ from_: number; to_: number }>().catch(() => null);

  const diagnose = (row: typeof rows.results[number]): UnmatchedReason => {
    if (Number(row.canceled ?? 0) === 1 || Number(row.receiptCanceled ?? 0) === 1)
      return "canceled";
    if (!row.receiptId) return "receipt-id-missing";
    if (row.printifyOrderId && (row.costMinor === null || Number(row.costMinor) === 0))
      /* Printify has it and has not priced it yet. */
      return "printify-order-delayed";
    if (!row.printifyOrderId) {
      const created = Number(row.createdAt) || 0;
      if (window?.to_ && created > Number(window.to_))
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

    /*
      A CANDIDATE NEEDS EVIDENCE, NOT JUST SCARCITY.

      Same currency AND close enough in time to be the same sale. Being the
      only unmatched order left is not evidence: the live data offered a
      2025-11-30 Printify order as the link for a 2026-09-08 receipt purely
      because nothing else was unmatched.
    */
    const candidates = basis === "unavailable"
      ? (loose.results ?? []).filter(order => plausibleLink({
          receiptAt: Number(row.createdAt) || 0,
          orderAt: Number(order.createdAt) || 0,
          receiptCurrency: row.currency, orderCurrency: order.currency,
        }).ok)
      : [];

    return {
      /* Safe for the seller: their own Etsy order number, nothing about who
         bought it. */
      receiptId: row.receiptId,
      orderDate: Number(row.createdAt) || 0,
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


/**
 * RECORD A CORRECTION.
 *
 * Written as an ADJUSTMENT, never over the Printify or Etsy evidence. The
 * original rows stay exactly as ingested, so a correction can be reviewed,
 * reversed, or recomputed under a different rule later.
 *
 * The basis is decided here and is permanent: a figure the member typed is
 * `manually-confirmed` and a linked Printify order is `printify-verified`
 * because it IS an exact record. Nothing promotes an estimate.
 */
export const POST = withErrorLog("shop-map-production-cost-save", async (request: Request) => {
  const access = await requireFeatureApi("shopMap");
  if (!access.ok) return access.response;
  const user = access.user;

  const db = (env as unknown as { DB: D1Database }).DB;
  const body = await request.json().catch(() => null) as
    { receiptId?: number; kind?: string; amount?: string; currency?: string } | null;
  const receiptId = Number(body?.receiptId ?? 0);
  if (!receiptId) return NextResponse.json({ error: "Which order?" }, { status: 400 });

  const receipt = await db.prepare(
    `SELECT shop_id AS shopId, currency, source_created_at AS createdAt
       FROM finance_receipts WHERE user_id = ? AND receipt_id = ?`)
    .bind(user.userId, receiptId)
    .first<{ shopId: number; currency: string; createdAt: number }>().catch(() => null);
  if (!receipt) return NextResponse.json({ error: "That order was not found." }, { status: 404 });

  const month = new Date(Number(receipt.createdAt) * 1000).toISOString().slice(0, 7);
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  if (body?.kind === "manual") {
    const amount = Number(String(body.amount ?? "").replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0)
      return NextResponse.json({ error: "Enter the amount as a number." }, { status: 400 });
    const currency = String(body.currency ?? "").toUpperCase().slice(0, 3) || "USD";
    /* Currencies are never mixed inside a month. */
    if (receipt.currency && currency !== receipt.currency)
      return NextResponse.json({
        error: `That order was paid in ${receipt.currency}. Enter the cost in `
          + `${receipt.currency} so the month adds up.` }, { status: 400 });

    await db.prepare(
      `INSERT INTO finance_adjustments
         (id, user_id, shop_id, month, receipt_id, printify_order_id, kind,
          amount_minor, currency, estimated, reason)
       VALUES (?,?,?,?,?,'', 'manual-production-cost', ?,?,0,?)`)
      .bind(id, user.userId, receipt.shopId, month, receiptId,
        Math.round(amount * 100), currency,
        "entered by the member because no Printify order matched")
      .run();
    return NextResponse.json({ ok: true, basis: "manually-confirmed", month, id });
  }

  if (body?.kind === "link") {
    /* Re-derive the candidate server-side. A browser must never choose which
       Printify order a receipt belongs to. */
    const loose = await db.prepare(
      `SELECT printify_order_id AS id, cost_minor AS costMinor,
              shipping_minor AS shippingMinor, currency,
              COALESCE(fulfilled_at, ingested_at) AS createdAt
         FROM finance_production
        WHERE user_id = ? AND (receipt_id IS NULL OR receipt_id = 0)`)
      .bind(user.userId)
      .all<{ id: string; costMinor: number; shippingMinor: number;
        currency: string; createdAt: number }>()
      .catch(() => ({ results: [] as Array<{ id: string; costMinor: number;
        shippingMinor: number; currency: string; createdAt: number }> }));
    const candidates = (loose.results ?? []).filter(order => plausibleLink({
      receiptAt: Number(receipt.createdAt) || 0, orderAt: Number(order.createdAt) || 0,
      receiptCurrency: receipt.currency, orderCurrency: order.currency,
    }).ok);
    if (candidates.length !== 1)
      return NextResponse.json({
        error: "There is no single Printify order Goldie can be sure about for "
          + "this sale." }, { status: 409 });

    await db.prepare(
      `UPDATE finance_production SET receipt_id = ?
        WHERE user_id = ? AND printify_order_id = ?`)
      .bind(receiptId, user.userId, candidates[0].id).run();
    await db.prepare(
      `INSERT INTO finance_adjustments
         (id, user_id, shop_id, month, receipt_id, printify_order_id, kind,
          amount_minor, currency, estimated, reason)
       VALUES (?,?,?,?,?,?, 'linked-printify-order', 0, ?, 0, ?)`)
      .bind(id, user.userId, receipt.shopId, month, receiptId, candidates[0].id,
        receipt.currency, "linked by the member to the one plausible Printify order")
      .run();
    return NextResponse.json({ ok: true, basis: "printify-verified", month, id });
  }

  return NextResponse.json({ error: "Unknown correction." }, { status: 400 });
});
