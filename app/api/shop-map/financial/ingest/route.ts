import { crossSiteWrite, CROSS_SITE_REFUSAL } from "@/app/same-site-only";
import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyConnection, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { classifyLedgerType } from "@/app/finance-classify";
import { windowsFor, incrementalFrom, outstanding, WINDOW_SECONDS } from "@/app/finance-windows";
import { classifyOrphan } from "@/app/finance-reconcile";
import { ensureFinanceTables } from "@/app/finance-store";
import { printifyCall } from "../../../../printify-call.ts";

/**
 * INCREMENTAL FINANCIAL INGESTION.
 *
 * The ledger is walked in 30-day windows because Etsy refuses anything over
 * 31, and each window is recorded as it completes. A run that dies halfway
 * leaves the finished windows marked complete and the rest pending, so the
 * next run repeats only what actually failed.
 *
 * Incremental reads reach back two weeks behind the high-water mark. Refunds
 * and fee reversals are written against their ORIGINAL date days later, so
 * reading strictly forward would miss every one and leave a month looking
 * settled while it was still moving.
 *
 * NO BUYER DATA IS READ OR STORED. Not names, not addresses, not messages.
 */
const EARLIEST = Math.floor(Date.parse("2023-01-01T00:00:00Z") / 1_000);

/*
  D1716 · THIS WAS A GET, AND IT DOES WORK.

  A GET is meant to be safe to repeat and safe to follow: a bookmark, a
  crawler, a browser prefetch, a copied link, a click. This one writes, so
  it is a POST now. The GET below refuses without doing anything, so an old
  link fails loudly rather than quietly running the job again.
*/
export async function GET() {
  return NextResponse.json(
    { error: "This does work, so it is a POST now. Nothing was run." },
    { status: 405, headers: { Allow: "POST" } });
}

export const POST = withErrorLog("shop-map-financial-ingest", async (request: Request) => {
  if (crossSiteWrite(request)) return NextResponse.json(CROSS_SITE_REFUSAL, { status: 403 });
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureFinanceTables();
  const parameters = new URL(request.url).searchParams;
  const maxWindows = Math.min(25, Math.max(1, Number(parameters.get("windows")) || 3));
  const maxOrderPages = Math.min(10, Math.max(1, Number(parameters.get("orders")) || 3));
  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1_000);

  const connection = await etsyConnection(user.userId);
  const shopId = Number(connection.shopId);
  let calls = 0;

  const etsy = async (path: string) => {
    await waitForEtsyCapacity();
    const response = await fetch(`https://openapi.etsy.com/v3/application${path}`, {
      headers: { "x-api-key": etsyApiCredential(), authorization: `Bearer ${connection.token}` },
      signal: AbortSignal.timeout(25_000),
    });
    await recordEtsyCall(response, "finance");
    calls += 1;
    return { status: response.status, body: response.ok ? await response.json() as unknown : null };
  };

  /* ------------------------------------------------------------- ledger */
  const state = await db.prepare(
    `SELECT high_water FROM finance_sources WHERE user_id = ? AND shop_id = ? AND source = 'ledger'`)
    .bind(user.userId, shopId).first<{ high_water: number }>();
  const from = incrementalFrom(Number(state?.high_water ?? 0), now, EARLIEST);

  /* Record every window first, so a crash cannot lose the plan. */
  /* Anchored at EARLIEST so the grid never shifts between runs. */
  const planned = windowsFor(from, now, undefined, EARLIEST);
  for (const window of planned)
    await db.prepare(
      `INSERT INTO finance_windows (user_id, shop_id, window_from, window_to, state, updated_at)
       VALUES (?,?,?,?,'pending',?)
       ON CONFLICT(user_id, shop_id, window_from, window_to) DO NOTHING`)
      .bind(user.userId, shopId, window.from, window.to, now).run();

  /*
    WINDOWS FROM AN OLDER GRID CAN NEVER BE COMPLETED.

    Earlier runs planned boundaries from a moving start, so the table holds
    rows no current plan will ever revisit. They are marked superseded rather
    than deleted - the record of what was attempted is worth keeping, and
    nothing that actually completed is touched - otherwise they would count
    as incomplete forever and block complete profit permanently.
  */
  const aligned = new Set(planned.map(window => window.from));
  const stale = await db.prepare(
    `SELECT window_from FROM finance_windows
      WHERE user_id = ? AND shop_id = ? AND state IN ('pending', 'failed')`)
    .bind(user.userId, shopId).all<{ window_from: number }>();
  let superseded = 0;
  for (const row of (stale.results ?? [])) {
    if (aligned.has(Number(row.window_from))) continue;
    /* Only if it sits off the current grid AND never completed. */
    if (Number(row.window_from) % WINDOW_SECONDS === EARLIEST % WINDOW_SECONDS) continue;
    await db.prepare(
      `UPDATE finance_windows SET state = 'superseded', updated_at = ?
        WHERE user_id = ? AND shop_id = ? AND window_from = ? AND state IN ('pending','failed')`)
      .bind(now, user.userId, shopId, row.window_from).run();
    superseded += 1;
  }

  /*
    Re-read completed windows once, to correct rows stored under a misparse.
    The windows themselves are bookkeeping, not financial source data, and
    nothing about an Etsy row changes except how Goldie labels it.
  */
  if (parameters.get("reparse") === "1")
    await db.prepare(
      `UPDATE finance_windows SET state = 'pending', updated_at = ?
        WHERE user_id = ? AND shop_id = ? AND state = 'complete'`)
      .bind(now, user.userId, shopId).run();

  const pending = await db.prepare(
    `SELECT window_from, window_to, state FROM finance_windows
      WHERE user_id = ? AND shop_id = ? AND state IN ('pending', 'failed')
      ORDER BY window_from ASC LIMIT ?`)
    .bind(user.userId, shopId, maxWindows)
    .all<{ window_from: number; window_to: number; state: string }>();

  let ledgerRows = 0;
  let windowsDone = 0;
  const windowErrors: string[] = [];

  for (const window of pending.results ?? []) {
    let offset = 0;
    let stored = 0;
    let failed = "";
    /* Paginate the window completely; a partial window is a wrong month. */
    for (let page = 0; page < 20; page += 1) {
      const answer = await etsy(
        `/shops/${shopId}/payment-account/ledger-entries`
        + `?limit=100&offset=${offset}&min_created=${window.window_from}&max_created=${window.window_to}`);
      if (answer.status !== 200) {
        failed = `status ${answer.status}`;
        break;
      }
      const entries = ((answer.body as { results?: Array<Record<string, unknown>> })?.results) ?? [];
      for (const entry of entries) {
        /* ledger_type is the real field. description repeats it. */
        const rawType = String(entry.ledger_type ?? entry.description ?? "");
        const kind = classifyLedgerType(rawType);
        const amount = Number(entry.amount ?? 0);
        const divisor = Number(entry.currency_divisor ?? 100) || 100;
        await db.prepare(
          `INSERT INTO finance_ledger
             (user_id, shop_id, source_id, receipt_id, transaction_id, raw_type,
              normalized_type, bucket, attribution, amount_minor, divisor, currency,
              source_created_at, source_updated_at, ingested_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(user_id, shop_id, source_id) DO UPDATE SET
             amount_minor = excluded.amount_minor,
             source_updated_at = excluded.source_updated_at,
             /* Classification is derived from the source, so re-reading the
                source is allowed to correct a misparse. The amounts and
                identifiers still come only from Etsy. */
             raw_type = excluded.raw_type,
             normalized_type = excluded.normalized_type,
             bucket = excluded.bucket,
             attribution = excluded.attribution`)
          .bind(user.userId, shopId, String(entry.entry_id ?? entry.ledger_entry_id ?? ""),
            /* reference_type says what reference_id points at. */
            String(entry.reference_type ?? "") === "receipt" ? Number(entry.reference_id ?? 0) || null : null,
            String(entry.reference_type ?? "") === "transaction" ? Number(entry.reference_id ?? 0) || null : null,
            rawType, kind.normalized, kind.bucket, kind.attribution,
            Math.round(amount), divisor, String(entry.currency ?? "USD"),
            Number(entry.create_date ?? entry.created_timestamp ?? window.window_from),
            Number(entry.update_date ?? 0) || null, now)
          .run();
        stored += 1;
      }
      if (entries.length < 100) break;
      offset += 100;
    }

    await db.prepare(
      `UPDATE finance_windows SET state = ?, rows_ingested = ?, last_error = ?, updated_at = ?
        WHERE user_id = ? AND shop_id = ? AND window_from = ? AND window_to = ?`)
      .bind(failed ? "failed" : "complete", stored, failed, now,
        user.userId, shopId, window.window_from, window.window_to).run();
    if (failed) windowErrors.push(`${window.window_from}: ${failed}`);
    else windowsDone += 1;
    ledgerRows += stored;
  }

  /* Advance the high-water mark only across windows that actually finished. */
  const completeTo = await db.prepare(
    `SELECT MAX(window_to) AS n FROM finance_windows
      WHERE user_id = ? AND shop_id = ? AND state = 'complete'`)
    .bind(user.userId, shopId).first<{ n: number }>();
  await db.prepare(
    `INSERT INTO finance_sources (user_id, shop_id, source, refreshed_at, high_water,last_error)
     VALUES (?,?,'ledger',?,?,?)
     ON CONFLICT(user_id, shop_id, source) DO UPDATE SET
       refreshed_at = excluded.refreshed_at, high_water = excluded.high_water,last_error=excluded.last_error`)
    .bind(user.userId, shopId, windowErrors.length?0:now, Number(completeTo?.n ?? 0),windowErrors.join('; ')).run();

  /* ------------------------------------------------------------ receipts */
  /*
    LEDGER COMPLETENESS IS NOT RECEIPT COMPLETENESS.

    They are different endpoints with different pagination and different
    failure modes, so each source carries its own freshness and its own
    high-water mark. A complete ledger beside a half-read receipt list
    produces a month that looks finished and is not.
  */
  const receiptState = await db.prepare(
    `SELECT high_water FROM finance_sources WHERE user_id = ? AND shop_id = ? AND source = 'receipts'`)
    .bind(user.userId, shopId).first<{ high_water: number }>();
  const receiptsFrom = incrementalFrom(Number(receiptState?.high_water ?? 0), now, EARLIEST);

  let receiptsStored = 0;
  let transactionsStored = 0;
  let paymentsStored = 0;
  let refundsSeen = 0;
  let newestReceipt = Number(receiptState?.high_water ?? 0);
  let oldestSeen = Number.MAX_SAFE_INTEGER;
  let receiptsReadComplete=false;
  let receiptError="";
  const previousComplete=await db.prepare(`SELECT refreshed_at FROM finance_sources WHERE user_id=? AND shop_id=? AND source='receipts-complete'`)
    .bind(user.userId,shopId).first<{refreshed_at:number}>();
  const maxReceiptPages = Math.min(40, Math.max(1, Number(parameters.get("receipts")) || 6));
  const backfill = parameters.get("backfill") === "1";

  for (let page = 0; page < maxReceiptPages; page += 1) {
    /*
      MEASURED: min_created on the receipts endpoint does not behave like the
      ledger's. Asking for three years of receipts with it returned a single
      row while the shop holds thousands. So receipts are paginated plainly,
      newest first, and the walk stops once it is comfortably behind the
      high-water mark - which is what the mark is actually for.
    */
    const answer = await etsy(`/shops/${shopId}/receipts?limit=100&offset=${page * 100}`);
    if (answer.status !== 200) {receiptError=`Etsy receipts returned ${answer.status}`;break;}
    const results = ((answer.body as { results?: Array<Record<string, unknown>> })?.results) ?? [];
    if (!results.length) {receiptsReadComplete=true;break;}

    for (const receipt of results) {
      const receiptId = Number(receipt.receipt_id ?? 0);
      if (!receiptId) continue;
      const money = (value: unknown) => {
        const row = (value ?? {}) as Record<string, unknown>;
        return { minor: Math.round(Number(row.amount ?? 0)*100/(Number(row.divisor ?? 100)||100)), divisor: 100,
          currency: String(row.currency_code ?? "USD") };
      };
      const subtotal = money(receipt.subtotal);
      const shipping = money(receipt.total_shipping_cost);
      const tax = money(receipt.total_tax_cost);
      const vat = money(receipt.total_vat_cost);
      const discount = money(receipt.discount_amt);
      const grand = money(receipt.grandtotal);
      const created = Number(receipt.created_timestamp ?? receipt.create_timestamp ?? 0);
      const status = String(receipt.status ?? "");
      const refunds = (receipt.refunds ?? []) as unknown[];
      if (refunds.length) refundsSeen += refunds.length;
      if (created > newestReceipt) newestReceipt = created;
      if (created < oldestSeen) oldestSeen = created;

      /* Buyer fields are never read. Only money, identity and status. */
      await db.prepare(
        `INSERT INTO finance_receipts
           (user_id, shop_id, receipt_id, subtotal_minor, shipping_minor, tax_minor,
            seller_discount_minor, marketplace_discount_minor, grand_total_minor,
            divisor, currency, canceled, refunded, source_created_at, source_updated_at, ingested_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(user_id, shop_id, receipt_id) DO UPDATE SET
           subtotal_minor = excluded.subtotal_minor,
           shipping_minor = excluded.shipping_minor,
           tax_minor = excluded.tax_minor,
           grand_total_minor = excluded.grand_total_minor,
           canceled = excluded.canceled, refunded = excluded.refunded,
           source_updated_at = excluded.source_updated_at`)
        .bind(user.userId, shopId, receiptId, subtotal.minor, shipping.minor,
          tax.minor + vat.minor, Math.abs(discount.minor), 0, grand.minor,
          grand.divisor, grand.currency,
          /^(canceled|cancelled)$/i.test(status) ? 1 : 0,
          refunds.length ? 1 : 0, created,
          Number(receipt.updated_timestamp ?? receipt.update_timestamp ?? 0) || null, now)
        .run();
      receiptsStored += 1;
      transactionsStored += ((receipt.transactions ?? []) as unknown[]).length;
    }
    if (results.length < 100) {receiptsReadComplete=true;break;}
    /*
      Everything from here back is already held, plus the overlap - unless a
      backfill was asked for, which walks the whole history once. The
      incremental stop is right for every later run and wrong for the first.
    */
    if (!backfill && receiptsFrom > 0 && oldestSeen < receiptsFrom) {receiptsReadComplete=Boolean(previousComplete);break;}
  }

  const receiptFailure=receiptError||(!receiptsReadComplete?"The receipt import has not completed.":"");
  for(const source of ["receipts","transactions","refunds","receipts-complete"]){
    await db.prepare(`INSERT INTO finance_sources (user_id,shop_id,source,refreshed_at,high_water,last_error)
      VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,shop_id,source) DO UPDATE SET
      refreshed_at=excluded.refreshed_at,high_water=excluded.high_water,last_error=excluded.last_error`)
      .bind(user.userId,shopId,source,receiptFailure?0:now,newestReceipt,receiptFailure).run();
  }

  /* ----------------------------------------------------------- printify */
  const stored = await db
    .prepare(`SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  let productionRows = 0;
  let orphans = 0;
  if (stored) {
    const token = await decryptPrintifyToken(
      stored.encrypted_token, (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY);
    const pairing=await db.prepare("SELECT DISTINCT printify_shop_id FROM shop_pairing_proofs WHERE user_id=? AND etsy_shop_id=?").bind(user.userId,shopId).all<{printify_shop_id:number}>();
    if(pairing.results.length!==1) return NextResponse.json({error:"Connect the matching Printify store before refreshing production costs."},{status:409});
    const printifyShop=Number(pairing.results[0].printify_shop_id);
    let productionComplete=false;
    let productionError="";
    for (let page = 1; page <= maxOrderPages; page += 1) {
      const response = await printifyCall(
        `https://api.printify.com/v1/shops/${printifyShop}/orders.json?limit=50&page=${page}`,
        { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" },
          signal: AbortSignal.timeout(25_000) },
        { feature: "finance", userId: user.userId }).catch(() => null);
      if (!response?.ok) {productionError="Printify orders could not be refreshed.";break;}
      const body = await response.json() as { data?: Array<Record<string, unknown>> };
      const orders = body.data ?? [];
      if (!orders.length) {productionComplete=true;break;}
      for (const order of orders) {
        const metadata = (order.metadata ?? {}) as Record<string, unknown>;
        const shopOrderId = String(metadata.shop_order_id ?? "");
        const receiptId = /^\d+$/.test(shopOrderId) ? Number(shopOrderId) : null;
        const orphan = receiptId ? null : classifyOrphan({
          orderType: String(metadata.order_type ?? ""), shopOrderId });
        if (orphan) orphans += 1;
        const lines = (order.line_items ?? []) as Array<Record<string, unknown>>;
        const first = lines[0] ?? {};
        const status = String(order.status ?? "");
        await db.prepare(
          `INSERT INTO finance_production
             (user_id, shop_id, printify_order_id, receipt_id, printify_product_id,
              blueprint_id, variant_id, quantity, cost_minor, shipping_minor, currency,
              status, canceled, refunded, reprint, counts_as_etsy_cost, orphan_kind,
              fulfilled_at, ingested_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(user_id, shop_id, printify_order_id) DO UPDATE SET
             status = excluded.status, canceled = excluded.canceled,
             refunded = excluded.refunded, cost_minor = excluded.cost_minor,
             shipping_minor = excluded.shipping_minor`)
          .bind(user.userId, shopId, String(order.id ?? ""), receiptId,
            String(first.product_id ?? ""), Number(first.blueprint_id ?? 0) || null,
            Number(first.variant_id ?? 0) || null,
            lines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0),
            /* Printify already reports integer minor units. Preserved as given. */
            Number(order.total_price ?? 0), Number(order.total_shipping ?? 0),
            "USD", status,
            /^(cancel|canceled|cancelled)/.test(status) ? 1 : 0,
            status.includes("refund") ? 1 : 0,
            String(metadata.order_type ?? "").includes("reprint") ? 1 : 0,
            orphan ? (orphan.countsAsEtsyCost ? 1 : 0) : 1,
            orphan?.kind ?? "",
            Number(order.created_at ? Date.parse(String(order.created_at)) / 1_000 : 0) || now,
            now)
          .run();
        productionRows += 1;
      }
      if (orders.length < 50) {productionComplete=true;break;}
    }
    await db.prepare(
      `INSERT INTO finance_sources (user_id, shop_id, source, refreshed_at, high_water,last_error)
       VALUES (?,?,'printify',?,?,?)
       ON CONFLICT(user_id, shop_id, source) DO UPDATE SET refreshed_at = excluded.refreshed_at,last_error=excluded.last_error`)
      .bind(user.userId, shopId, productionComplete?now:0, now,productionError||(!productionComplete?'The production cost import has not completed.':'')).run();
  }

  const remaining = await db.prepare(
    `SELECT window_from, window_to, state FROM finance_windows
      WHERE user_id = ? AND shop_id = ? AND state IN ('pending', 'failed')`)
    .bind(user.userId, shopId).all<{ window_from: number; window_to: number; state: string }>();

  return NextResponse.json({
    etsyCalls: calls,
    ledger: { windowsPlanned: planned.length, staleWindowsSuperseded: superseded,
      windowsCompletedThisRun: windowsDone,
      rowsIngested: ledgerRows, errors: windowErrors,
      windowsOutstanding: outstanding((remaining.results ?? []).map(row =>
        ({ from: row.window_from, to: row.window_to, state: row.state as never }))).length },
    receipts: { stored: receiptsStored, transactionsSeen: transactionsStored,
      paymentsStored, refundsSeen, highWater: newestReceipt },
    printify: { ordersIngested: productionRows, orphansClassified: orphans },
    reminder: "No buyer names, addresses or messages are read or stored.",
  });
});
