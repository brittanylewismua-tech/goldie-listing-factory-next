import test from "node:test";
import assert from "node:assert/strict";
import { guidance, MIN_ORDERS_TO_ADVISE } from "../app/shop-map-guidance.ts";

const niche = (over = {}) => ({
  worldId: "n", label: "N", activeListings: 10, orders: 20, units: 20,
  revenueMinor: 50_000, verifiedProfitMinor: null, reviews: 0,
  ordersLast30: 3, ordersLast90: 8, revenueLast90Minor: 10_000,
  largestOrderMinor: 3_000, refundedOrders: 0, ...over });

test("every instruction carries its arithmetic", () => {
  const found = guidance([
    niche({ worldId: "a", label: "Feminist", activeListings: 5, revenueMinor: 80_000 }),
    niche({ worldId: "b", label: "Horses", activeListings: 40, revenueMinor: 5_000 }),
  ]);
  for (const row of found) {
    assert.ok(row.reason.length > 0, `${row.label} advises with no reason`);
    assert.match(row.reason, /\d/, `${row.label}'s reason cites no number`);
  }
});

test("a niche earning above its shelf space is the focus", () => {
  const found = guidance([
    niche({ worldId: "a", label: "Feminist", activeListings: 3, revenueMinor: 80_000, orders: 40 }),
    niche({ worldId: "b", label: "Other", activeListings: 40, revenueMinor: 10_000, orders: 10 }),
  ]);
  assert.equal(found[0].nicheId, "a");
  assert.ok(["Focus here", "Expand this niche"].includes(found[0].headline));
  assert.match(found[0].reason, /% of revenue from .*% of active listings/);
});

test("a niche with many listings and little response is called out", () => {
  const found = guidance([
    niche({ worldId: "a", label: "Big", activeListings: 60, revenueMinor: 2_000, orders: 8 }),
    niche({ worldId: "b", label: "Small", activeListings: 4, revenueMinor: 90_000, orders: 40 }),
  ]);
  const big = found.find(row => row.nicheId === "a");
  assert.ok(["Overbuilt", "Reconsider this category"].includes(big.headline));
  assert.match(big.reason, /% of active listings and .*% of revenue/);
});

test("too few orders says so rather than advising", () => {
  const found = guidance([niche({ orders: MIN_ORDERS_TO_ADVISE - 1 })]);
  assert.equal(found[0].headline, "Needs more data");
  assert.match(found[0].reason, /too few to read a pattern/);
});

test("guidance never invents a design", () => {
  const found = guidance([
    niche({ worldId: "a", label: "Feminist", activeListings: 3, revenueMinor: 80_000, orders: 40 }),
    niche({ worldId: "b", label: "Other", activeListings: 40, revenueMinor: 9_000, orders: 9 }),
  ]);
  for (const row of found) {
    assert.doesNotMatch(row.advice, /design a|create a design|make a (shirt|mug|sticker) that says/i);
    assert.doesNotMatch(row.advice, /"[^"]{10,}"/, "the advice quoted a phrase to print");
  }
});

test("an emerging niche is recognised from recent share", () => {
  /* A modest share of the shelf, but most of the recent trade. A niche
     holding half the listings is overbuilt, not emerging, however recent
     its orders are. */
  const found = guidance([
    niche({ worldId: "a", label: "New", activeListings: 5, revenueMinor: 10_000,
      orders: 10, ordersLast90: 9 }),
    niche({ worldId: "b", label: "Old", activeListings: 40, revenueMinor: 90_000,
      orders: 40, ordersLast90: 1 }),
  ]);
  assert.equal(found.find(row => row.nicheId === "a").headline, "Emerging");
});
