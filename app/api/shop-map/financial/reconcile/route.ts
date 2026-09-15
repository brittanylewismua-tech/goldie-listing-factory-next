import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { classifyReceipt, classifyOrphan } from "@/app/finance-reconcile";
import { periodsFor, periodOf, partialReason } from "@/app/finance-periods";
import { monthOf, monthWindow } from "@/app/finance-month";
import { rollUp } from "@/app/finance-rollup";
import { ensureFinanceTables, shopTimezone } from "@/app/finance-store";

/**
 * RECONCILE, THEN RECOMPUTE EVERY MONTH.
 *
 * Coverage is only quoted inside the period where both sources could agree.
 * Comparing 23 Printify orders against years of Etsy receipts and calling the
 * ratio "reconciliation coverage" would describe a limit of Printify's
 * retention as a failure of the matcher.
 *
 * Nothing is written to the source tables except the match result, and no
 * manual adjustment is created.
 */
export const GET = withErrorLog("shop-map-financial-reconcile", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureFinanceTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1_000);

  const shopRow = await db.prepare(
    `SELECT shop_id FROM etsy_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`)
    .bind(user.userId).first<{ shop_id: number }>();
  if (!shopRow) return NextResponse.json({ error: "No connected shop." }, { status: 400 });
  const shopId = Number(shopRow.shop_id);
  const timezone = await shopTimezone(user.userId, shopId);
  if (!timezone) return NextResponse.json({ error: "No shop timezone." }, { status: 400 });

  /* ------------------------------------------- the real coverage boundary */
  const boundary = await db.prepare(
    `SELECT MIN(fulfilled_at) AS earliest, MAX(fulfilled_at) AS latest, COUNT(*) AS orders
       FROM finance_production WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId).first<{ earliest: number; latest: number; orders: number }>();
  const periods = periodsFor({
    earliestPrintifyOrder: Number(boundary?.earliest ?? 0) || null, now });

  /* ------------------------------------------------ classify every order */
  const orders = await db.prepare(
    `SELECT printify_order_id, receipt_id, orphan_kind, status, canceled,
            cost_minor, shipping_minor, quantity, fulfilled_at
       FROM finance_production WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId)
    .all<{ printify_order_id: string; receipt_id: number | null; orphan_kind: string;
      status: string; canceled: number; cost_minor: number; shipping_minor: number;
      quantity: number; fulfilled_at: number }>();

  const orderReport = { total: 0, withShopOrderId: 0, exactReceiptMatch: 0,
    apiOrSample: 0, manual: 0, orphan: 0, canceled: 0, costsUsable: 0 };
  const matchedReceiptIds = new Set<number>();

  for (const order of orders.results ?? []) {
    orderReport.total += 1;
    if (order.receipt_id) {
      orderReport.withShopOrderId += 1;
      /* An exact match requires the receipt to actually exist on our side. */
      const receipt = await db.prepare(
        `SELECT receipt_id FROM finance_receipts
          WHERE user_id = ? AND shop_id = ? AND receipt_id = ?`)
        .bind(user.userId, shopId, order.receipt_id).first<{ receipt_id: number }>();
      if (receipt) {
        orderReport.exactReceiptMatch += 1;
        matchedReceiptIds.add(Number(order.receipt_id));
      }
    } else {
      const kind = classifyOrphan({ orderType: order.orphan_kind, shopOrderId: "" });
      if (kind.kind === "api-sample") orderReport.apiOrSample += 1;
      else if (kind.kind === "manual-order") orderReport.manual += 1;
      else orderReport.orphan += 1;
    }
    if (order.canceled) orderReport.canceled += 1;
    /* A cost is usable when it exists and the order was not canceled. */
    if (!order.canceled && order.cost_minor > 0) orderReport.costsUsable += 1;
  }

  /* Write the match status back so the monthly view can read it. */
  for (const receiptId of matchedReceiptIds)
    await db.prepare(
      `UPDATE finance_receipts SET match_status = 'fully-matched',
              match_method = 'exact-receipt-id', safe_for_profit = 1
        WHERE user_id = ? AND shop_id = ? AND receipt_id = ?`)
      .bind(user.userId, shopId, receiptId).run();

  /* ------------------------------------------------- recompute every month */
  const months = await db.prepare(
    `SELECT DISTINCT source_created_at FROM finance_receipts
      WHERE user_id = ? AND shop_id = ? ORDER BY source_created_at ASC`)
    .bind(user.userId, shopId).all<{ source_created_at: number }>();
  const monthKeys = [...new Set((months.results ?? [])
    .map(row => monthOf(Number(row.source_created_at), String(timezone)))
    .filter((key): key is string => Boolean(key)))];

  const monthReports = [];
  for (const month of monthKeys) {
    const window = monthWindow(String(month), String(timezone));
    if (!window) continue;
    const period = periodOf(window.from, periods);

    const rows = await db.prepare(
      `SELECT source_id, raw_type, amount_minor, currency, source_created_at, receipt_id
         FROM finance_ledger WHERE user_id = ? AND shop_id = ?
           AND source_created_at BETWEEN ? AND ?`)
      .bind(user.userId, shopId, window.from, window.to)
      .all<{ source_id: string; raw_type: string; amount_minor: number; currency: string;
        source_created_at: number; receipt_id: number | null }>();

    const receiptRow = await db.prepare(
      `SELECT COUNT(*) AS receipts,
              COALESCE(SUM(subtotal_minor), 0) AS subtotal,
              COALESCE(SUM(shipping_minor), 0) AS shipping,
              COALESCE(SUM(tax_minor), 0) AS tax,
              COALESCE(SUM(seller_discount_minor), 0) AS discount,
              COALESCE(SUM(refunded), 0) AS refunded,
              SUM(CASE WHEN match_status = 'fully-matched' THEN 1 ELSE 0 END) AS matched
         FROM finance_receipts WHERE user_id = ? AND shop_id = ?
           AND source_created_at BETWEEN ? AND ?`)
      .bind(user.userId, shopId, window.from, window.to)
      .first<{ receipts: number; matched: number; subtotal: number; shipping: number;
        tax: number; discount: number; refunded: number }>();

    const production = await db.prepare(
      `SELECT receipt_id, cost_minor, shipping_minor, currency, canceled, counts_as_etsy_cost
         FROM finance_production WHERE user_id = ? AND shop_id = ?
           AND fulfilled_at BETWEEN ? AND ?`)
      .bind(user.userId, shopId, window.from, window.to)
      .all<{ receipt_id: number | null; cost_minor: number; shipping_minor: number;
        currency: string; canceled: number; counts_as_etsy_cost: number }>();

    const ledgerRows = rows.results ?? [];
    const currencies = new Set(ledgerRows.map(row => String(row.currency ?? "")).filter(Boolean));

    const summary = rollUp({
      month: String(month), currency: String([...currencies][0] ?? "USD"),
      rows: ledgerRows.map(row => ({
        sourceId: String(row.source_id), rawType: String(row.raw_type),
        amountMinor: Number(row.amount_minor), currency: String(row.currency),
        atSeconds: Number(row.source_created_at), receiptId: row.receipt_id })),
      production: (production.results ?? []).map(row => ({
        receiptId: row.receipt_id, costMinor: row.cost_minor, shippingMinor: row.shipping_minor,
        currency: String(row.currency), canceled: Boolean(row.canceled),
        countsAsEtsyCost: Boolean(row.counts_as_etsy_cost) })),
      adjustments: [],
      receipts: receiptRow?.receipts ?? 0,
      matchedReceipts: receiptRow?.matched ?? 0,
      staleSources: [],
      incompleteWindows: 0,
      /* Revenue comes from the receipts, never from the fee ledger. */
      receiptTotals: {
        subtotalMinor: Number(receiptRow?.subtotal ?? 0),
        shippingMinor: Number(receiptRow?.shipping ?? 0),
        taxMinor: Number(receiptRow?.tax ?? 0),
        discountMinor: Number(receiptRow?.discount ?? 0),
        refundedReceipts: Number(receiptRow?.refunded ?? 0),
      },
      currencyConflict: currencies.size > 1,
      unresolvedAmbiguity: 0,
    });

    const partial = partialReason({ month: String(month), monthFrom: window.from, monthTo: window.to,
      now, periodFrom: period?.from ?? 0 });

    await db.prepare(
      `INSERT INTO finance_rollups (user_id, shop_id, month, payload_json, rule_version, computed_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(user_id, shop_id, month) DO UPDATE SET
         payload_json = excluded.payload_json, rule_version = excluded.rule_version,
         computed_at = excluded.computed_at`)
      .bind(user.userId, shopId, month, JSON.stringify(summary), summary.ruleVersion, now).run();

    monthReports.push({
      month: String(month),
      period: period?.kind ?? "unknown",
      partial: partial || undefined,
      receipts: receiptRow?.receipts ?? 0,
      matchedReceipts: receiptRow?.matched ?? 0,
      grossSellerRevenueMinor: summary.grossSellerRevenueMinor,
      marketplaceTaxMinor: summary.marketplaceTaxMinor,
      etsyFeesMinor: summary.etsyTransactionFeesMinor + summary.etsyProcessingFeesMinor
        + summary.etsyListingFeesMinor + summary.etsyAdvertisingFeesMinor + summary.etsyOtherFeesMinor,
      productionCostMinor: summary.productionCostMinor,
      completeProfit: summary.knownOperatingProfitMinor,
      state: summary.completeness.complete ? "Complete"
        : period?.productionCostPossible === false ? "Production cost unavailable"
        : partial ? "Partial" : "Incomplete",
      missing: summary.completeness.failures,
      unmappedTypes: summary.unmappedTypes,
    });
  }

  return NextResponse.json({
    timezone,
    periods: periods.map(period => ({ ...period,
      fromISO: new Date(period.from * 1_000).toISOString().slice(0, 10),
      toISO: new Date(period.to * 1_000).toISOString().slice(0, 10) })),
    printify: { ...orderReport,
      earliestOrderISO: boundary?.earliest
        ? new Date(Number(boundary.earliest) * 1_000).toISOString().slice(0, 10) : null },
    monthsRecomputed: monthReports.length,
    monthsWithCompleteProfit: monthReports.filter(row => row.state === "Complete").length,
    months: monthReports,
    reminder: "Coverage is only quoted where both sources could agree. No manual adjustment was created.",
  });
});
