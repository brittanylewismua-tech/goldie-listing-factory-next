/*
  The thirty-five financial cases, exercised.

  These are the situations where a plausible number is worse than no number,
  so most of them assert a refusal rather than a value.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyLedgerType, isUnmapped, sellerRevenueMinor, receiptArithmetic,
} from "../app/finance-classify.ts";
import {
  windowsFor, incrementalFrom, windowTooLarge, outstanding, snapToGrid,
  MAX_WINDOW_SECONDS, OVERLAP_SECONDS,
} from "../app/finance-windows.ts";
import { monthWindow, monthOf, offsetSeconds, isKnownTimezone, MISSING_TIMEZONE } from "../app/finance-month.ts";
import { pairLines, classifyReceipt, classifyOrphan } from "../app/finance-reconcile.ts";
import { rollUp, needsRecompute, RULE_VERSION } from "../app/finance-rollup.ts";
import * as periods from "../app/finance-periods.ts";

const LA = "America/Los_Angeles";
const base = (over = {}) => ({
  month: "2026-01", currency: "USD", rows: [], production: [], adjustments: [],
  receipts: 1, matchedReceipts: 1, staleSources: [], incompleteWindows: 0,
  currencyConflict: false, unresolvedAmbiguity: 0, ...over,
});
const row = (rawType, amountMinor, over = {}) =>
  ({ sourceId: `s${Math.random()}`, rawType, amountMinor, currency: "USD",
     atSeconds: 1_767_225_600, ...over });
const prod = (over = {}) => ({ receiptId: 1, costMinor: 900, shippingMinor: 100,
  currency: "USD", canceled: false, countsAsEtsyCost: true, ...over });
const eLine = (over = {}) => ({ transactionId: 1, listingId: 10, productId: "p1",
  variantId: 5, quantity: 1, sku: "SKU1", ...over });
const pLine = (over = {}) => ({ lineId: "L1", productId: "p1", blueprintId: 6,
  variantId: 5, quantity: 1, sku: "SKU1", ...over });

test("1. one fully matched receipt", () => {
  const { matches, rejections } = pairLines([eLine()], [pLine()]);
  assert.equal(matches.length, 1);
  assert.equal(rejections.length, 0);
  assert.equal(classifyReceipt({ etsyLines: 1, matched: 1, rejected: 0,
    canceled: false, refunded: false }), "fully-matched");
});

test("2. several Etsy transactions in one receipt", () => {
  const { matches } = pairLines(
    [eLine({ transactionId: 1, productId: "p1" }), eLine({ transactionId: 2, productId: "p2" })],
    [pLine({ lineId: "L1", productId: "p1" }), pLine({ lineId: "L2", productId: "p2" })]);
  assert.equal(matches.length, 2);
  assert.notEqual(matches[0].lineId, matches[1].lineId);
});

test("3. several Printify lines in one order", () => {
  const { matches, rejections } = pairLines([eLine({ productId: "p1" })],
    [pLine({ lineId: "L1", productId: "p1" }), pLine({ lineId: "L2", productId: "p2" })]);
  assert.equal(matches.length, 1);
  assert.equal(rejections.length, 0);
});

test("4. exact receipt with unique line pairing", () => {
  const { matches } = pairLines([eLine({ sku: "", productId: "", variantId: 7, quantity: 3 })],
    [pLine({ lineId: "L9", productId: "", variantId: 7 })]);
  assert.equal(matches[0].method, "unique-variant");
});

test("5. exact receipt with ambiguous line pairing is refused", () => {
  const { matches, rejections } = pairLines(
    [eLine({ sku: "", productId: "p1", variantId: null, quantity: 2 })],
    [pLine({ lineId: "L1", productId: "p1", variantId: null, quantity: 2 }),
     pLine({ lineId: "L2", productId: "p1", variantId: null, quantity: 2 })]);
  assert.equal(matches.length, 0, "an ambiguous pairing resolved itself");
  assert.equal(rejections[0].safeForProfit, false);
  assert.match(rejections[0].reason, /share this product/);
  assert.equal(rejections[0].candidates, 2);
});

test("6. partial receipt match", () => {
  assert.equal(classifyReceipt({ etsyLines: 3, matched: 2, rejected: 0,
    canceled: false, refunded: false }), "partially-matched");
});

test("7. Etsy receipt without Printify order", () => {
  assert.equal(classifyReceipt({ etsyLines: 2, matched: 0, rejected: 0,
    canceled: false, refunded: false }), "unmatched");
});

test("8. Printify order without Etsy receipt", () => {
  const orphan = classifyOrphan({ orderType: "", shopOrderId: "" });
  assert.equal(orphan.kind, "missing-receipt");
  assert.equal(orphan.countsAsEtsyCost, false);
});

test("9. an API-created sample never becomes an Etsy cost", () => {
  const sample = classifyOrphan({ orderType: "sample", shopOrderId: "" });
  assert.equal(sample.kind, "api-sample");
  assert.equal(sample.countsAsEtsyCost, false);
  /* And it is excluded from the month's production cost. */
  const summary = rollUp(base({ production: [prod({ countsAsEtsyCost: false })] }));
  assert.equal(summary.productionCostMinor, 0);
});

test("10. a canceled receipt is reported as canceled", () => {
  assert.equal(classifyReceipt({ etsyLines: 1, matched: 1, rejected: 0,
    canceled: true, refunded: false }), "canceled");
});

test("11. a full refund reduces revenue", () => {
  const summary = rollUp(base({ rows: [row("sale", 2_500), row("refund", -2_500)] }));
  assert.equal(summary.grossSellerRevenueMinor, 0);
  assert.equal(summary.refundsMinor, -2_500);
});

test("12. a partial refund reduces revenue partly", () => {
  const summary = rollUp(base({ rows: [row("sale", 2_500), row("refund", -1_000)] }));
  assert.equal(summary.grossSellerRevenueMinor, 1_500);
});

test("13. a late refund after month close forces recomputation", () => {
  assert.equal(needsRecompute({ storedRuleVersion: RULE_VERSION, trigger: "late-refund" }), true);
});

test("14. a fee reversal is a credit against cost", () => {
  const credit = classifyLedgerType("credit");
  assert.equal(credit.bucket, "cost");
  const summary = rollUp(base({ rows: [row("sale", 2_500), row("fee", -160), row("credit", 160)] }));
  assert.equal(summary.etsyOtherFeesMinor, 160);
});

test("15. a listing renewal fee is a listing-attributed cost", () => {
  const renewal = classifyLedgerType("renewal_fee");
  assert.equal(renewal.bucket, "cost");
  assert.equal(renewal.attribution, "listing");
});

test("16. an Offsite Ads fee attaches to the receipt", () => {
  const offsite = classifyLedgerType("offsite_ads");
  assert.equal(offsite.bucket, "cost");
  assert.equal(offsite.attribution, "receipt");
});

test("17. a fee with no listing attribution is still a shop cost", () => {
  const ads = classifyLedgerType("marketing");
  assert.equal(ads.attribution, "shop");
  assert.equal(ads.profitRelevant, true);
});

test("18. marketplace tax is excluded from seller revenue", () => {
  const tax = classifyLedgerType("tax");
  assert.equal(tax.bucket, "tax");
  assert.equal(tax.profitRelevant, false);
  const summary = rollUp(base({ rows: [row("sale", 2_500), row("tax", 210)] }));
  assert.equal(summary.grossSellerRevenueMinor, 2_500, "tax leaked into revenue");
  assert.equal(summary.marketplaceTaxMinor, 210);
});

test("19. shipping collected is included in revenue", () => {
  const summary = rollUp(base({ rows: [row("sale", 2_500), row("shipping", 500)] }));
  assert.equal(summary.grossSellerRevenueMinor, 3_000);
  assert.equal(summary.shippingCollectedMinor, 500);
});

test("20. a seller-funded discount reduces revenue; a marketplace one does not", () => {
  const parts = { subtotalMinor: 3_000, shippingMinor: 500, taxMinor: 210,
    sellerDiscountMinor: -300, marketplaceDiscountMinor: -100, grandTotalMinor: 3_310 };
  assert.equal(sellerRevenueMinor(parts), 3_200);
  /* grandtotal is not revenue: it carries tax and Etsy's own discount. */
  assert.notEqual(sellerRevenueMinor(parts), parts.grandTotalMinor);
});

test("21. mixed currencies are never summed", () => {
  const summary = rollUp(base({ currencyConflict: true, rows: [row("sale", 2_500)] }));
  assert.equal(summary.knownOperatingProfitMinor, null);
  assert.ok(summary.completeness.failures.some(f => /more than one currency/.test(f)));
});

test("22. a receipt whose components disagree is flagged, not absorbed", () => {
  const checked = receiptArithmetic({ subtotalMinor: 3_000, shippingMinor: 500,
    taxMinor: 210, sellerDiscountMinor: 0, marketplaceDiscountMinor: 0,
    grandTotalMinor: 9_999 });
  assert.equal(checked.agrees, false);
  assert.notEqual(checked.differenceMinor, 0);
});

test("23. a daylight-saving boundary is handled at each end separately", () => {
  const march = monthWindow("2026-03", LA);
  const startOffset = offsetSeconds(LA, march.from);
  const endOffset = offsetSeconds(LA, march.to);
  assert.notEqual(startOffset, endOffset, "DST change was not reflected");
  assert.equal(monthOf(march.from, LA), "2026-03");
  assert.equal(monthOf(march.to, LA), "2026-03");
});

test("24. month boundaries use the shop timezone, never the server", () => {
  /* 11pm on 31 January in Los Angeles is still January. */
  const lateJanuary = Math.floor(Date.parse("2026-02-01T06:30:00Z") / 1_000);
  assert.equal(monthOf(lateJanuary, LA), "2026-01");
  assert.equal(monthOf(lateJanuary, "UTC"), "2026-02");
  /* And with no timezone there is no month at all. */
  assert.equal(monthWindow("2026-01", ""), null);
  assert.equal(monthOf(lateJanuary, "Nowhere/Nowhere"), null);
  assert.match(MISSING_TIMEZONE, /wrong month/);
});

test("25. duplicate ingestion is impossible across consecutive windows", () => {
  const windows = windowsFor(0, 90 * 86_400);
  for (let index = 1; index < windows.length; index += 1)
    assert.ok(windows[index].from > windows[index - 1].to,
      "two windows share a boundary second");
});

test("26. every window respects Etsy's 31-day maximum", () => {
  for (const window of windowsFor(0, 365 * 86_400))
    assert.equal(windowTooLarge(window), false,
      `window of ${(window.to - window.from) / 86_400} days exceeds the cap`);
});

test("27. a failed window is resumed without repeating the complete ones", () => {
  const states = [
    { from: 0, to: 10, state: "complete" },
    { from: 11, to: 20, state: "failed" },
    { from: 21, to: 30, state: "pending" },
  ];
  const todo = outstanding(states);
  assert.equal(todo.length, 2);
  assert.ok(todo.every(window => window.state !== "complete"));
});

test("28. an incremental read overlaps far enough to catch late adjustments", () => {
  const now = 1_800_000_000;
  const start = incrementalFrom(now, now, 0);
  assert.equal(now - start, OVERLAP_SECONDS);
  /* And never reaches before the shop existed. */
  assert.equal(incrementalFrom(now, now, now - 100), now - 100);
});

test("29. a stale source blocks complete profit", () => {
  const summary = rollUp(base({ rows: [row("sale", 2_500)], production: [prod()],
    staleSources: ["printify"] }));
  assert.equal(summary.knownOperatingProfitMinor, null);
  assert.ok(summary.completeness.failures.some(f => /Stale sources/.test(f)));
});

test("30. a manual adjustment is applied", () => {
  const summary = rollUp(base({ rows: [row("sale", 2_500), row("fee", -160)],
    production: [prod()],
    adjustments: [{ id: "a1", month: "2026-01", amountMinor: -500, currency: "USD",
      kind: "production-cost", estimated: false }] }));
  assert.equal(summary.adjustmentsMinor, -500);
  assert.equal(summary.knownOperatingProfitMinor, 2_500 - 160 - 900 - 100 - 500);
});

test("31. a reversed adjustment stops counting", () => {
  const summary = rollUp(base({ rows: [row("sale", 2_500)], production: [prod()],
    adjustments: [{ id: "a1", month: "2026-01", amountMinor: -500, currency: "USD",
      kind: "production-cost", estimated: false, reversedBy: "a2" }] }));
  assert.equal(summary.adjustmentsMinor, 0);
});

test("32. a newly matched order triggers recomputation", () => {
  assert.equal(needsRecompute({ storedRuleVersion: RULE_VERSION,
    trigger: "newly-matched-order" }), true);
});

test("33. a rule-version change triggers recomputation", () => {
  assert.equal(needsRecompute({ storedRuleVersion: RULE_VERSION - 1 }), true);
  assert.equal(needsRecompute({ storedRuleVersion: RULE_VERSION }), false);
});

test("34. one member cannot reach another member's financial data", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/financial/route.ts", import.meta.url), "utf8");
  for (const statement of route.match(/FROM finance_[a-z_]+[\s\S]{0,400}?`/g) ?? [])
    assert.match(statement, /user_id = \?/, "a financial query ran unscoped");
  assert.doesNotMatch(route, /searchParams\.get\("user|targetUser/);
});

test("35. buyer identity is absent from stored rows and responses", () => {
  for (const file of ["../app/finance-classify.ts", "../app/finance-rollup.ts",
    "../app/finance-reconcile.ts", "../app/api/shop-map/financial/route.ts"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const forbidden of ["buyer_email", "buyer_name", "first_line", "second_line",
      "formatted_address", "message_from_buyer", "shipping_address"])
      assert.doesNotMatch(source, new RegExp(forbidden, "i"),
        `${file} handles ${forbidden}`);
  }
});

test("an estimated adjustment can never complete a month", () => {
  const summary = rollUp(base({ rows: [row("sale", 2_500)], production: [prod()],
    adjustments: [{ id: "a1", month: "2026-01", amountMinor: -900, currency: "USD",
      kind: "production-cost", estimated: true }] }));
  assert.equal(summary.knownOperatingProfitMinor, null);
  assert.ok(summary.completeness.failures.some(f => /estimate cannot complete/.test(f)));
});

test("the known-order margin is separate and carries its coverage", () => {
  const summary = rollUp(base({ rows: [row("sale", 10_000)], production: [prod()],
    receipts: 10, matchedReceipts: 35 / 10 }));
  assert.equal(summary.knownOperatingProfitMinor, null);
  assert.ok(summary.knownOrderMargin);
  assert.match(summary.knownOrderMargin.label, /Known-order margin across \d+% of revenue/);
});

test("an unmapped ledger type is surfaced, never silently zeroed", () => {
  const summary = rollUp(base({ rows: [row("sale", 2_500), row("brand_new_etsy_fee", -99)] }));
  assert.deepEqual(summary.unmappedTypes, ["brand_new_etsy_fee"]);
  assert.equal(summary.byBucket.neither, -99);
  assert.ok(isUnmapped(classifyLedgerType("brand_new_etsy_fee")));
});

test("a payout is never operating profit", () => {
  const deposit = classifyLedgerType("deposit");
  assert.equal(deposit.bucket, "payout");
  assert.equal(deposit.profitRelevant, false);
  const summary = rollUp(base({ rows: [row("sale", 2_500), row("deposit", -2_340)],
    production: [prod()] }));
  assert.equal(summary.grossSellerRevenueMinor, 2_500, "a payout moved revenue");
});

test("financial ingestion is metered as its own Etsy feature", () => {
  const client = readFileSync(new URL("../app/api/etsy/client.ts", import.meta.url), "utf8");
  assert.match(client, /"finance"/);
  const ingest = readFileSync(new URL(
    "../app/api/shop-map/financial/ingest/route.ts", import.meta.url), "utf8");
  assert.match(ingest, /recordEtsyCall\(response, "finance"\)/);
});

test("a window is only marked complete when it finished", () => {
  const ingest = readFileSync(new URL(
    "../app/api/shop-map/financial/ingest/route.ts", import.meta.url), "utf8");
  assert.match(ingest, /failed \? "failed" : "complete"/);
  /* The high-water mark advances across complete windows only, so a failed
     window cannot be skipped past on the next run. */
  assert.match(ingest, /MAX\(window_to\)[\s\S]{0,120}state = 'complete'/);
});

test("ledger windows are paginated completely", () => {
  const ingest = readFileSync(new URL(
    "../app/api/shop-map/financial/ingest/route.ts", import.meta.url), "utf8");
  assert.match(ingest, /if \(entries\.length < 100\) break;/);
  assert.match(ingest, /offset \+= 100/);
});

test("Printify minor units are preserved, not recomputed", () => {
  const ingest = readFileSync(new URL(
    "../app/api/shop-map/financial/ingest/route.ts", import.meta.url), "utf8");
  assert.match(ingest, /already reports integer minor units/);
  assert.doesNotMatch(ingest, /total_price[^)]*\/\s*100/);
});

test("the financial view separates complete profit from an incomplete margin", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/financial/route.ts", import.meta.url), "utf8");
  /* Different keys, so a caller cannot render one where the other belongs. */
  assert.match(route, /completeProfit:/);
  assert.match(route, /knownOrderMargin:/);
  assert.match(route, /state = currencies\.size > 1 \? "Mixed currency"/);
});

test("source rows are never rewritten except by the source", () => {
  const ingest = readFileSync(new URL(
    "../app/api/shop-map/financial/ingest/route.ts", import.meta.url), "utf8");
  /* Ledger upserts carry only source-confirmed fields forward. */
  const upsert = ingest.slice(ingest.indexOf("INSERT INTO finance_ledger"));
  assert.match(upsert.slice(0, 900), /DO UPDATE SET\s+amount_minor = excluded\.amount_minor/);
  const store = readFileSync(new URL("../app/finance-store.ts", import.meta.url), "utf8");
  /* Adjustments sit beside the source, never on top of it. */
  assert.match(store, /finance_adjustments/);
  assert.match(store, /reverses TEXT/);
});

test("planning the same period twice produces the same windows", () => {
  /* Measured in production: shifting boundaries left 74 windows outstanding
     while nothing had failed, which would block complete profit forever. */
  const anchor = 0;
  const now = 400 * 86_400;
  const first = windowsFor(100 * 86_400, now, undefined, anchor);
  /* A later run starting somewhere else inside the same period. */
  const second = windowsFor(137 * 86_400, now, undefined, anchor);
  const key = window => `${window.from}:${window.to}`;
  const firstKeys = new Set(first.map(key));
  for (const window of second)
    assert.ok(firstKeys.has(key(window)),
      `a re-plan produced a boundary the first plan never had: ${key(window)}`);
});

test("the grid snaps backwards, never forwards past unread time", () => {
  assert.equal(snapToGrid(0, 0), 0);
  const snapped = snapToGrid(45 * 86_400, 0);
  assert.ok(snapped <= 45 * 86_400);
  assert.equal(snapped % (30 * 86_400), 0);
});

test("a superseded window does not count as incomplete forever", () => {
  /* Measured: outstanding grew 43 -> 74 -> 100 across runs while nothing
     failed, because old-grid rows could never be revisited. */
  for (const file of ["../app/finance-store.ts", "../app/api/shop-map/financial/route.ts",
    "../app/api/shop-map/financial/ingest/route.ts"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /state <> 'complete'/,
      `${file} still counts superseded windows as incomplete`);
  }
  const ingest = readFileSync(new URL(
    "../app/api/shop-map/financial/ingest/route.ts", import.meta.url), "utf8");
  /* Superseded, not deleted: what was attempted is worth keeping. */
  assert.match(ingest, /state = 'superseded'/);
  assert.doesNotMatch(ingest, /DELETE FROM finance_windows/);
  /* And a completed window is never touched. */
  assert.match(ingest, /AND state IN \('pending','failed'\)/);
});

test("coverage is only quoted where both sources could agree", () => {
  const { periodsFor, periodOf, GOLDIE_FINANCIAL_EPOCH } = periods;
  const earliest = Math.floor(Date.parse("2025-04-29T00:00:00Z") / 1_000);
  const now = Math.floor(Date.parse("2026-09-14T12:00:00Z") / 1_000);
  const built = periodsFor({ earliestPrintifyOrder: earliest, now });
  const before = built.find(p => p.kind === "before-printify");
  assert.equal(before.productionCostPossible, false,
    "a period with no Printify history claimed production cost was possible");
  assert.match(before.why, /limit of the source, not a gap in matching/);
  /* A 2024 sale falls outside the coverage period entirely. */
  const old = Math.floor(Date.parse("2024-06-01T00:00:00Z") / 1_000);
  assert.equal(periodOf(old, built).kind, "before-printify");
  assert.ok(GOLDIE_FINANCIAL_EPOCH > earliest);
});

test("a month that has not finished stays partial", () => {
  const { partialReason } = periods;
  const now = 1_000;
  assert.match(partialReason({ month: "2026-09", monthFrom: 900, monthTo: 2_000,
    now, periodFrom: 0 }), /has not finished/);
  assert.match(partialReason({ month: "2025-04", monthFrom: 100, monthTo: 500,
    now, periodFrom: 300 }), /began before this period's data exists/);
  assert.equal(partialReason({ month: "2025-05", monthFrom: 400, monthTo: 500,
    now, periodFrom: 300 }), "");
});

test("receipts carry their own freshness, separate from the ledger", () => {
  const ingest = readFileSync(new URL(
    "../app/api/shop-map/financial/ingest/route.ts", import.meta.url), "utf8");
  assert.match(ingest, /LEDGER COMPLETENESS IS NOT RECEIPT COMPLETENESS/);
  assert.match(ingest, /source = 'receipts'/);
  for (const source of ["transactions", "payments", "refunds"])
    assert.match(ingest, new RegExp(source));
});

test("receipt ingestion reads money and status, never the buyer", () => {
  const ingest = readFileSync(new URL(
    "../app/api/shop-map/financial/ingest/route.ts", import.meta.url), "utf8");
  for (const forbidden of ["buyer_email", "buyer_user_id", "formatted_address",
    "first_line", "name:", "message_from_buyer"])
    assert.doesNotMatch(ingest, new RegExp(forbidden, "i"), `ingest reads ${forbidden}`);
});

test("an exact match requires the receipt to exist on our side", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/financial/reconcile/route.ts", import.meta.url), "utf8");
  assert.match(route, /SELECT receipt_id FROM finance_receipts/);
  assert.match(route, /match_method = 'exact-receipt-id'/);
  /* And reconciliation creates no adjustments while testing. */
  assert.doesNotMatch(route, /INSERT INTO finance_adjustments/);
});
