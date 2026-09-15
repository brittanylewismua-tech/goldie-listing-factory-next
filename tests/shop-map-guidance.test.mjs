import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guidance, standout, MIN_ORDERS_TO_ADVISE, SHOP_MAP_MIN_RECENT_ORDERS,
  DIRECTION_BASIS } from "../app/shop-map-guidance.ts";

/* Guidance reads the last 90 days on both sides, so the fixtures carry
   recent figures and lifetime is only history. */
const niche = (over = {}) => ({
  worldId: "n", label: "N", activeListings: 10, orders: 200, units: 200,
  revenueMinor: 500_000, verifiedProfitMinor: null, reviews: 0,
  ordersLast30: 8, ordersLast90: 20, revenueLast90Minor: 50_000,
  largestOrderMinor: 3_000, refundedOrders: 0, ...over });

test("every instruction carries its arithmetic", () => {
  const found = guidance([
    niche({ worldId: "a", label: "Feminist", activeListings: 5, revenueLast90Minor: 80_000 }),
    niche({ worldId: "b", label: "Horses", activeListings: 40, revenueLast90Minor: 5_000 }),
  ]);
  for (const row of found) {
    assert.ok(row.reason.length > 0, `${row.label} advises with no reason`);
    assert.match(row.reason, /\d/, `${row.label}'s reason cites no number`);
  }
});

test("a niche earning above its shelf space is the focus", () => {
  const found = guidance([
    niche({ worldId: "a", label: "Feminist", activeListings: 3, revenueLast90Minor: 80_000, ordersLast90: 40 }),
    niche({ worldId: "b", label: "Other", activeListings: 40, revenueLast90Minor: 10_000, ordersLast90: 10 }),
  ]);
  assert.equal(found[0].nicheId, "a");
  assert.ok(["Focus here", "Expand this niche"].includes(found[0].headline));
  assert.match(found[0].reason, /% of revenue in .* from .*% of active listings/);
});

test("a niche with many listings and little response is called out", () => {
  const found = guidance([
    niche({ worldId: "a", label: "Big", activeListings: 60, revenueLast90Minor: 2_000, ordersLast90: 8 }),
    niche({ worldId: "b", label: "Small", activeListings: 4, revenueLast90Minor: 90_000, ordersLast90: 40 }),
  ]);
  const big = found.find(row => row.nicheId === "a");
  assert.ok(["Overbuilt", "Reconsider this category"].includes(big.headline));
  assert.match(big.reason, /% of active listings and .*% of revenue/);
});

test("too few orders says so rather than advising", () => {
  const found = guidance([niche({ ordersLast90: MIN_ORDERS_TO_ADVISE - 1 })]);
  assert.equal(found[0].headline, "Needs more data");
  assert.match(found[0].reason, /too few to read a pattern/);
});

test("guidance never invents a design", () => {
  const found = guidance([
    niche({ worldId: "a", label: "Feminist", activeListings: 3, revenueLast90Minor: 80_000, ordersLast90: 40 }),
    niche({ worldId: "b", label: "Other", activeListings: 40, revenueLast90Minor: 9_000, ordersLast90: 9 }),
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
    niche({ worldId: "a", label: "New", activeListings: 5, revenueLast90Minor: 10_000,
      ordersLast90: 30 }),
    niche({ worldId: "b", label: "Old", activeListings: 40, revenueLast90Minor: 90_000,
      ordersLast90: 5 }),
  ]);
  assert.equal(found.find(row => row.nicheId === "a").headline, "Emerging");
});

test("nothing outperforming is said plainly, not dressed as advice", () => {
  /* Two niches each earning roughly their shelf share is the absence of
     evidence, not a reason to make more. */
  const niches = [
    niche({ worldId: "a", label: "Feminist", activeListings: 70, revenueLast90Minor: 73_000, ordersLast90: 40 }),
    niche({ worldId: "b", label: "Political", activeListings: 30, revenueLast90Minor: 27_000, ordersLast90: 20 }),
  ];
  const advice = guidance(niches);
  const result = standout(niches, advice);
  assert.equal(result.hasStandout, false);
  assert.match(result.headline, /No standout opportunity yet/);
  assert.ok(result.nextStep.length > 0, "no next step was offered");
  /* And it does not tell her to make more without leverage. */
  assert.doesNotMatch(result.headline, /create more|add listings/i);
});

test("real leverage is surfaced as the standout", () => {
  const niches = [
    niche({ worldId: "a", label: "Horses", activeListings: 3, revenueLast90Minor: 80_000, ordersLast90: 40 }),
    niche({ worldId: "b", label: "Other", activeListings: 60, revenueLast90Minor: 10_000, ordersLast90: 10 }),
  ];
  const result = standout(niches, guidance(niches));
  assert.equal(result.hasStandout, true);
  assert.match(result.nextStep, /\d+% of revenue/);
});

test("keep building no longer implies making more", () => {
  const niches = [
    niche({ worldId: "a", activeListings: 50, revenueLast90Minor: 50_000, ordersLast90: 20 }),
    niche({ worldId: "b", activeListings: 50, revenueLast90Minor: 50_000, ordersLast90: 20 }),
  ];
  for (const row of guidance(niches).filter(entry => entry.headline === "Keep building")) {
    assert.match(row.advice, /Maintain/);
    assert.match(row.reason, /no leverage to act on/);
  }
});

test("the recommendation floor is a named beta setting, not buried arithmetic", () => {
  /* Twenty is where this beta draws the line. It is not a measured Etsy
     standard and nothing should imply that it is. */
  assert.equal(SHOP_MAP_MIN_RECENT_ORDERS, 20);
  const module = readFileSync(new URL("../app/shop-map-guidance.ts", import.meta.url), "utf8");
  assert.match(module, /A BETA THRESHOLD, NOT A LAW/);
  assert.match(module, /export const SHOP_MAP_MIN_RECENT_ORDERS/);
  /* The comparison uses the constant, never a literal. */
  assert.doesNotMatch(module, /recentOrders < 20/);
});

test("the basis names both periods honestly", () => {
  assert.match(DIRECTION_BASIS, /Recent 90-day performance/);
  assert.match(DIRECTION_BASIS, /current active catalog/);
  const module = readFileSync(new URL("../app/shop-map-guidance.ts", import.meta.url), "utf8");
  /* It must not claim both sides share a window. */
  assert.doesNotMatch(module, /last 90 days on both sides/);
});

test("this shop has no direction on the merits, floor aside", () => {
  /* Feminist 12 recent orders over 53 active; Girl Power 3 over 16. */
  const niches = [
    niche({ worldId: "f", label: "Feminist", activeListings: 53,
      ordersLast90: 12, revenueLast90Minor: 27_200 }),
    niche({ worldId: "g", label: "Girl Power", activeListings: 16,
      ordersLast90: 3, revenueLast90Minor: 6_600 }),
  ];
  const advice = guidance(niches, { shop: { revenueMinor: 33_800,
    revenueLast90Minor: 33_800, activeListings: 83, ordersLast90: 15, orders: 15 } });
  assert.equal(advice.some(row =>
    row.headline === "Focus here" || row.headline === "Expand this niche"), false,
    "a niche was called a focus without a convincing recent advantage");
});
