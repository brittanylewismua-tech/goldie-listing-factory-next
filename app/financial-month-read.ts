import { env } from "cloudflare:workers";
import { STALE_AFTER_SECONDS, REQUIRED_FINANCIAL_SOURCES } from "@/app/finance-freshness";
import { rollUp } from "@/app/finance-rollup";
import { classifyLedgerType } from "@/app/finance-classify";
import { monthWindow } from "@/app/finance-month";
import { ensureFinanceTables } from "@/app/finance-store";

export async function readFinancialMonth(userId:string,shopId:number,month:string,timezone:string){
  await ensureFinanceTables();
  const db=(env as unknown as {DB:D1Database}).DB;
  const window=monthWindow(month,timezone);
  if(!window)return null;
  const rows = await db.prepare(
    `SELECT source_id, raw_type, amount_minor, currency, source_created_at, receipt_id
       FROM finance_ledger
      WHERE user_id = ? AND shop_id = ?
        AND source_created_at BETWEEN ? AND ?`)
    .bind(userId, shopId, window.from, window.to)
    .all<{ source_id: string; raw_type: string; amount_minor: number; currency: string;
      source_created_at: number; receipt_id: number | null }>();

  const production = await db.prepare(
    `SELECT receipt_id, cost_minor, shipping_minor, currency, canceled, counts_as_etsy_cost
       FROM finance_production
      WHERE user_id = ? AND shop_id = ? AND (receipt_id IN (SELECT receipt_id FROM finance_receipts WHERE user_id=? AND shop_id=? AND source_created_at BETWEEN ? AND ?)
        OR (receipt_id IS NULL AND fulfilled_at BETWEEN ? AND ?))`)
    .bind(userId, shopId, userId, shopId, window.from, window.to, window.from, window.to)
    .all<{ receipt_id: number | null; cost_minor: number; shipping_minor: number;
      currency: string; canceled: number; counts_as_etsy_cost: number }>();

  const adjustments = await db.prepare(
    `SELECT id, month, amount_minor, currency, kind, estimated, reversed_by
       FROM finance_adjustments
      WHERE user_id = ? AND shop_id = ? AND month = ?`)
    .bind(userId, shopId, month)
    .all<{ id: string; month: string; amount_minor: number; currency: string;
      kind: string; estimated: number; reversed_by: string | null }>();

  const receiptRow = await db.prepare(
    `SELECT COUNT(*) AS receipts,
            COALESCE(SUM(subtotal_minor), 0) AS subtotal,
            COALESCE(SUM(shipping_minor), 0) AS shipping,
            COALESCE(SUM(tax_minor), 0) AS tax,
            COALESCE(SUM(seller_discount_minor), 0) AS discount,
            COALESCE(SUM(refunded), 0) AS refunded,
            GROUP_CONCAT(DISTINCT currency) AS currencies,
            SUM(CASE WHEN match_status IN ('fully-matched','canceled','refunded') THEN 1 ELSE 0 END) AS matched,
            SUM(CASE WHEN match_status = 'ambiguous' THEN 1 ELSE 0 END) AS ambiguous,
            SUM(CASE WHEN match_status = 'unmatched' THEN 1 ELSE 0 END) AS unmatched
       FROM finance_receipts
      WHERE user_id = ? AND shop_id = ? AND source_created_at BETWEEN ? AND ?`)
    .bind(userId, shopId, window.from, window.to)
    .first<{ receipts: number; matched: number; ambiguous: number; unmatched: number;
      subtotal: number; shipping: number; tax: number; discount: number; refunded: number; currencies:string }>();

  const windowsRow = await db.prepare(
    `SELECT COUNT(*) AS incomplete FROM finance_windows
      WHERE user_id = ? AND shop_id = ? AND state IN ('pending', 'failed')
        AND window_from <= ? AND window_to >= ?`)
    .bind(userId, shopId, window.to, window.from)
    .first<{ incomplete: number }>();

  const ledgerRows = rows.results ?? [];
  const currencies = new Set(ledgerRows.map(entry => String(entry.currency ?? "")).filter(Boolean));
  const sources = await db.prepare(`SELECT source,refreshed_at,last_error FROM finance_sources WHERE user_id=? AND shop_id=?`)
    .bind(userId,shopId).all<{source:string;refreshed_at:number;last_error:string}>();
  const required=REQUIRED_FINANCIAL_SOURCES;
  const now=Math.floor(Date.now()/1000);
  const staleSources=required.filter(name=>!sources.results?.some(row=>row.source===name&&!row.last_error&&now-Number(row.refreshed_at)<=STALE_AFTER_SECONDS));
  const ledgerWindows=await db.prepare(`SELECT window_from AS start,window_to AS end,state FROM finance_windows
    WHERE user_id=? AND shop_id=? AND window_from<=? AND window_to>=?`)
    .bind(userId,shopId,window.to,window.from).all<{start:number;end:number;state:string}>();
  let coveredThrough=window.from-1;
  for(const range of (ledgerWindows.results??[]).filter(row=>row.state==="complete").sort((a,b)=>a.start-b.start)){
    if(range.start>coveredThrough+1)break;
    coveredThrough=Math.max(coveredThrough,range.end);
  }
  const missingCoverage=coveredThrough<Math.min(window.to,now);
  const currenciesAll=[...(receiptRow?.currencies??"").split(","),...currencies,...(production.results??[]).map(row=>row.currency),...(adjustments.results??[]).map(row=>row.currency)];
  const refunded=Number(receiptRow?.refunded??0);
  const refundReceipts=new Set(ledgerRows.filter(row=>classifyLedgerType(row.raw_type).normalized==="refund"&&row.receipt_id).map(row=>row.receipt_id));
  const unresolvedRefunds=refunded>refundReceipts.size;


  const summary = rollUp({
    month, currency: String(currenciesAll.find(Boolean) ?? "USD"),
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
    incompleteWindows: Math.max(Number(windowsRow?.incomplete??0),missingCoverage?1:0),
    currencyConflict: new Set(currenciesAll.filter(Boolean)).size > 1,
    unresolvedAmbiguity: receiptRow?.ambiguous ?? 0,
    receiptTotals:{subtotalMinor:Number(receiptRow?.subtotal??0),shippingMinor:Number(receiptRow?.shipping??0),taxMinor:Number(receiptRow?.tax??0),discountMinor:Number(receiptRow?.discount??0),refundedReceipts:refunded},
    additionalFailures: [
      ...(unresolvedRefunds?["Refund amounts have not been reconciled for every refunded order."]:[]),
      ...(!sources.results?.some(row=>row.source==="receipts-complete"&&!row.last_error&&Number(row.refreshed_at)>=now-STALE_AFTER_SECONDS)?["The sales import has not been verified as complete."]:[]),
    ],
  });

  return summary;
}
