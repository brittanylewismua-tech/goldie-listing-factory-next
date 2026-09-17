import test from "node:test";
import assert from "node:assert/strict";
import { summarizeMonth, describe, monthKeyOf, minorUnits } from "../app/shop-map-monthly.ts";

const JAN = Math.floor(Date.parse("2026-01-15T00:00:00Z") / 1000);
const usd = minor => minorUnits(minor, "USD");
const line = (over = {}) => ({
  receiptId: Math.floor(Math.random() * 1e9),
  gross: usd(2_500), fees: usd(400), productionCost: usd(900), when: JAN, ...over,
});

test("gross revenue is always available, because it is the receipts", () => {
  const summary = summarizeMonth("2026-01", [line(), line(), line()]);
  assert.equal(summary.grossRevenue.minor, 7_500);
  assert.equal(summary.coverage.receipts, 3);
});

test("a complete month produces a profit", () => {
  const summary = summarizeMonth("2026-01", [line(), line()]);
  assert.ok(summary.profit);
  /* (2500 - 400 - 900) x 2 */
  assert.equal(summary.profit.amount.minor, 2_400);
  assert.equal(summary.profit.basis, "complete-month");
  assert.equal(summary.coverage.completeShare, 1);
});

test("a partial month refuses to state a profit", () => {
  const summary = summarizeMonth("2026-01", [line(), line({ productionCost: null })]);
  assert.equal(summary.profit, null);
  assert.match(summary.profitUnavailableBecause, /1 of 2 orders/);
  /* But the components it does know are still reported, with their coverage. */
  assert.equal(summary.etsyFees.overReceipts, 2);
  assert.equal(summary.productionCost.overReceipts, 1);
});

test("coverage is attached to every partial total", () => {
  const summary = summarizeMonth("2026-01",
    [line(), line({ fees: null }), line({ fees: null, productionCost: null })]);
  assert.equal(summary.coverage.withFees, 1);
  assert.equal(summary.coverage.withProduction, 2);
  assert.equal(summary.coverage.complete, 1);
  const text = describe(summary).join("\n");
  assert.match(text, /over 1 of 3 orders/);
  assert.match(text, /Profit not available/);
});

test("two currencies are never added together", () => {
  const summary = summarizeMonth("2026-01",
    [line(), line({ gross: minorUnits(2_000, "GBP") })]);
  assert.equal(summary.profit, null);
  assert.match(summary.profitUnavailableBecause, /will not be added\s+together/);
  assert.equal(summary.grossRevenue.minor, 0);
});

test("an empty month says so rather than reporting zero profit", () => {
  const summary = summarizeMonth("2026-02", [line()]);
  assert.equal(summary.coverage.receipts, 0);
  assert.equal(summary.profit, null);
  assert.match(summary.profitUnavailableBecause, /No orders/);
});

test("orders from other months are excluded", () => {
  const feb = Math.floor(Date.parse("2026-02-02T00:00:00Z") / 1000);
  const summary = summarizeMonth("2026-01", [line(), line({ when: feb })]);
  assert.equal(summary.coverage.receipts, 1);
  assert.equal(summary.grossRevenue.minor, 2_500);
});

test("the month key follows the timestamp", () => {
  assert.equal(monthKeyOf(JAN), "2026-01");
});

test("a profit is never implied by wording when coverage is partial", () => {
  const text = describe(summarizeMonth("2026-01", [line(), line({ fees: null })])).join("\n");
  assert.doesNotMatch(text, /Profit \$/);
  assert.match(text, /Profit not available/);
});
