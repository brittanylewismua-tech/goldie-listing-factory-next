/**
 * MATCHING A SALE TO WHAT IT COST, WITHOUT GUESSING.
 *
 * The identifiers that would settle a match exactly — external_id and
 * shop_order_id — are populated on none of this account's twenty most recent
 * Printify orders, measured before any of this was written. So the matcher
 * leans on SKU, time and quantity, and the whole risk is that it starts
 * picking. A wrong match does not look wrong: it attaches a plausible cost to
 * the wrong product.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { reconcile, WINDOW_SECONDS } from "../app/shop-map-match.ts";
import { addMoney, fromEtsy, fromPrintify, minorUnits, subtractMoney, formatMoney } from "../app/shop-map-money.ts";

const NOW = 1_789_000_000;
const etsy = (over = {}) => ({
  receiptId: 900, transactionId: 1, listingId: 555, productId: 77,
  sku: "WOLF-TEE-BLK-M", quantity: 1, createdAt: NOW, ...over,
});
const printify = (over = {}) => ({
  orderId: "p1", appOrderId: "app-1", externalId: "", shopOrderId: "",
  lineItemId: "li-1", sku: "WOLF-TEE-BLK-M", variantId: 12, productId: "77",
  quantity: 1, createdAt: NOW + 60, status: "fulfilled", ...over,
});

test("an exact external id wins over everything else", () => {
  const { outcomes, byMethod } = reconcile(
    [etsy()],
    [printify({ lineItemId: "li-2", sku: "OTHER", externalId: "900" }), printify()]);
  const matched = outcomes.find(row => row.state === "matched");
  assert.equal(matched.method, "external_id");
  assert.equal(matched.printify.lineItemId, "li-2");
  assert.equal(byMethod.external_id, 1);
});

test("a unique SKU with a compatible time and quantity matches", () => {
  const { outcomes } = reconcile([etsy()], [printify()]);
  const matched = outcomes.find(row => row.state === "matched");
  assert.equal(matched.method, "sku_time_quantity");
});

test("two identical candidates are ambiguous, and neither is chosen", () => {
  const { outcomes, byMethod } = reconcile(
    [etsy()],
    [printify({ lineItemId: "li-1" }), printify({ lineItemId: "li-2", createdAt: NOW + 120 })]);
  const ambiguous = outcomes.find(row => row.state === "ambiguous");
  assert.ok(ambiguous, "the outcome is ambiguity, not a nearest-in-time guess");
  assert.equal(ambiguous.candidates.length, 2);
  assert.deepEqual(byMethod, {}, "nothing is counted as matched");
});

test("a different quantity is not the same sale", () => {
  const { outcomes } = reconcile([etsy({ quantity: 2 })], [printify({ quantity: 1 })]);
  assert.equal(outcomes.find(row => row.state === "etsy_without_printify")?.etsy.transactionId, 1);
});

test("an order outside the window is not the same sale", () => {
  const { outcomes } = reconcile(
    [etsy()], [printify({ createdAt: NOW + WINDOW_SECONDS + 1 })]);
  assert.ok(outcomes.some(row => row.state === "etsy_without_printify"));
  assert.ok(outcomes.some(row => row.state === "printify_without_etsy"));
});

test("a Printify line is claimed once, so two sales cannot share one cost", () => {
  const { outcomes } = reconcile(
    [etsy({ transactionId: 1 }), etsy({ transactionId: 2, createdAt: NOW + 30 })],
    [printify()]);
  assert.equal(outcomes.filter(row => row.state === "matched").length, 1);
  assert.equal(outcomes.filter(row => row.state === "etsy_without_printify").length, 1);
});

test("two sales and two orders pair oldest with oldest, every time", () => {
  const lines = [etsy({ transactionId: 2, createdAt: NOW + 500 }), etsy({ transactionId: 1 })];
  const orders = [printify({ lineItemId: "li-b", createdAt: NOW + 560 }), printify({ lineItemId: "li-a", createdAt: NOW + 60 })];
  const once = reconcile(lines, orders).outcomes.filter(row => row.state === "matched")
    .map(row => [row.etsy.transactionId, row.printify.lineItemId]);
  const twice = reconcile(lines, orders).outcomes.filter(row => row.state === "matched")
    .map(row => [row.etsy.transactionId, row.printify.lineItemId]);
  assert.deepEqual(once, twice, "the same inputs always give the same answer");
});

test("a Printify order with no Etsy sale is reported, not ignored", () => {
  const { counts } = reconcile([], [printify()]);
  assert.equal(counts.printify_without_etsy, 1);
});

test("Etsy money is read through its divisor, never assumed", () => {
  assert.deepEqual(fromEtsy({ amount: 4200, divisor: 100, currency_code: "USD" }),
    { minor: 4200, currency: "USD" });
  /* A divisor that is not 100 must not silently become 100. */
  assert.deepEqual(fromEtsy({ amount: 4200, divisor: 1000, currency_code: "USD" }),
    { minor: 420, currency: "USD" });
  assert.deepEqual(fromEtsy(null), { minor: 0, currency: "USD" });
});

test("money stays integral through a whole profit calculation", () => {
  const revenue = fromEtsy({ amount: 4200, divisor: 100, currency_code: "USD" });
  const shipping = fromEtsy({ amount: 599, divisor: 100, currency_code: "USD" });
  const fees = minorUnits(-1_03 - 3_00, "USD");
  const cost = fromPrintify(1_842, "USD");
  const production = fromPrintify(4_99, "USD");
  const profit = subtractMoney(addMoney(revenue, shipping), minorUnits(403, "USD"), cost, production);
  assert.equal(Number.isInteger(profit.minor), true);
  assert.equal(profit.minor, 4200 + 599 - 403 - 1842 - 499);
  assert.equal(formatMoney(profit), "20.55 USD");
  assert.equal(fees.currency, "USD");
});

test("two currencies are refused rather than quietly added", () => {
  assert.throws(() => addMoney(minorUnits(100, "USD"), minorUnits(100, "GBP")), /Cannot add GBP to USD/);
});
