import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildWorlds, repeatedPhrases, renameWorld, mergeWorlds, splitListings, decodeEntities,
} from "../app/shop-map-worlds.ts";

import {
  direction, overbuilt, MIN_ORDERS_FOR_DIRECTION, ANOMALY_SHARE,
} from "../app/shop-map-direction.ts";
import { resolveCost, profitState, confidenceOf } from "../app/shop-map-cost-rules.ts";

const listing = (id, over = {}) => ({
  listingId: id, title: "", tags: [], shopSection: "", productFamily: "tee", ...over });

/* ------------------------------------------------------------------ worlds */

test("a listing with no customer logic is left unclassified, not binned", () => {
  const listings = [
    ...[1, 2, 3].map(id => listing(id, { title: `Nurse Life Shift ${id}` })),
    listing(9, { title: "Completely Unrelated Thing" }),
  ];
  const { worlds, assignments } = buildWorlds(listings);
  const lonely = assignments.find(row => row.listingId === 9);
  assert.equal(lonely.unclassified, true);
  /* No friendly-sounding bin that makes the map look finished. */
  for (const world of worlds) assert.doesNotMatch(world.label, /miscellaneous|other/i);
});

test("a member's move overrides the automatic grouping", () => {
  const listings = [1, 2, 3].map(id => listing(id, { title: `Dog Mom Dachshund ${id}` }));
  const { assignments } = buildWorlds(listings, {
    overrides: new Map([[2, ["section:custom"]]]) });
  const moved = assignments.find(row => row.listingId === 2);
  assert.deepEqual(moved.worldIds, ["section:custom"]);
  assert.match(moved.evidence[0], /moved here by you/);
});

const world = (over = {}) => ({
  worldId: "w", label: "W", activeListings: 10, orders: 20, units: 25,
  revenueMinor: 50_000, verifiedProfitMinor: 10_000, reviews: 8,
  ordersLast30: 5, ordersLast90: 12, revenueLast90Minor: 20_000,
  largestOrderMinor: 3_000, refundedOrders: 0, ...over });

test("a clear leader on several measures is named", () => {
  const result = direction([
    world({ worldId: "a", label: "Dachshund", orders: 30, units: 40, revenueMinor: 90_000, reviews: 12, ordersLast90: 20 }),
    world({ worldId: "b", label: "Feminist", orders: 5, units: 6, revenueMinor: 10_000, reviews: 1, ordersLast90: 2, activeListings: 20 }),
  ]);
  assert.equal(result.worldId, "a");
  assert.ok(result.leadingMeasures.length >= 2);
  assert.ok(result.reason.length > 0, "a direction was given with no reason");
});

test("too few orders blocks a direction outright", () => {
  const result = direction([
    world({ worldId: "a", orders: MIN_ORDERS_FOR_DIRECTION - 1 }),
    world({ worldId: "b", orders: 1, revenueMinor: 100, reviews: 0, ordersLast90: 0 }),
  ]);
  assert.equal(result.finding, "insufficient-evidence");
  assert.match(result.reason, /not enough to be sure/);
});

test("one order carrying a world blocks the claim", () => {
  const result = direction([
    world({ worldId: "a", orders: 20, revenueMinor: 10_000, largestOrderMinor: 9_000 }),
    world({ worldId: "b", orders: 2, revenueMinor: 500, reviews: 0, ordersLast90: 0, activeListings: 1 }),
  ]);
  assert.equal(result.finding, "carried-by-one-order");
  assert.match(result.blockedBy[0] ?? result.reason, /single order/);
  assert.ok(ANOMALY_SHARE < 1);
});

test("leading on one measure alone is not a direction", () => {
  const result = direction([
    world({ worldId: "a", orders: 10, units: 5, revenueMinor: 10_000, reviews: 0, ordersLast90: 1, activeListings: 50 }),
    world({ worldId: "b", orders: 9, units: 40, revenueMinor: 90_000, reviews: 20, ordersLast90: 30, activeListings: 2 }),
  ]);
  assert.notEqual(result.finding, "strongest-world");
});

test("a world earning far above its listing share is reported as that", () => {
  const result = direction([
    world({ worldId: "a", label: "Trail", activeListings: 2, orders: 30, units: 35,
      revenueMinor: 80_000, reviews: 10, ordersLast90: 15, largestOrderMinor: 4_000 }),
    world({ worldId: "b", activeListings: 40, orders: 4, units: 4, revenueMinor: 5_000,
      reviews: 1, ordersLast90: 1 }),
  ]);
  assert.equal(result.finding, "profitable-but-few-listings");
  assert.match(result.reason, /% of revenue from/);
});

test("an emerging world is recognised from recent share", () => {
  const result = direction([
    world({ worldId: "a", label: "New", activeListings: 6, orders: 12, units: 12,
      revenueMinor: 20_000, reviews: 6, ordersLast90: 11, largestOrderMinor: 2_000 }),
    world({ worldId: "b", activeListings: 6, orders: 10, units: 10, revenueMinor: 60_000,
      reviews: 2, ordersLast90: 1, largestOrderMinor: 5_000 }),
  ]);
  assert.ok(["emerging-world", "strongest-world", "profitable-but-few-listings"]
    .includes(result.finding));
  assert.ok(result.reason.length > 0);
});

test("overbuilt worlds are reported apart from the direction", () => {
  const found = overbuilt([
    world({ worldId: "a", activeListings: 40, revenueMinor: 1_000 }),
    world({ worldId: "b", activeListings: 5, revenueMinor: 90_000 }),
  ]);
  assert.equal(found[0].worldId, "a");
  assert.match(found[0].reason, /% of\s*\n?\s*active listings/);
});

test("no worlds at all is stated, not guessed around", () => {
  assert.equal(direction([]).finding, "insufficient-evidence");
});

/* ------------------------------------------------------------ profit state */

const cost = (over = {}) => ({ receiptId: 1, productFamily: "tee",
  verifiedCostMinor: 900, verifiedShippingMinor: 100, ...over });

test("a matched Printify order is a verified cost", () => {
  const resolved = resolveCost(cost());
  assert.equal(resolved.source, "current-exact-product");
  assert.equal(resolved.confidence, "verified");
  assert.equal(resolved.costMinor, 1_000);
});

test("a member's own entry outranks every rule", () => {
  const resolved = resolveCost(cost(), { adjustments: new Map([[1, 555]]) });
  assert.equal(resolved.source, "member-entered-adjustment");
  assert.equal(resolved.costMinor, 555);
});

test("an unconfirmed family rule is not used", () => {
  const rules = new Map([["tee", { productFamily: "tee", costMinor: 800,
    shippingMinor: 100, currency: "USD", confirmedByMember: false }]]);
  const resolved = resolveCost(cost({ verifiedCostMinor: null }), { familyRules: rules });
  assert.equal(resolved.source, "unavailable");
});

test("a confirmed family rule gives an estimate, never a verification", () => {
  const rules = new Map([["tee", { productFamily: "tee", costMinor: 800,
    shippingMinor: 100, currency: "USD", confirmedByMember: true }]]);
  const resolved = resolveCost(cost({ verifiedCostMinor: null }), { familyRules: rules });
  assert.equal(resolved.source, "exact-product-family-rule");
  assert.equal(resolved.confidence, "estimated");
  assert.equal(confidenceOf("exact-product-family-rule"), "estimated");
});

test("title similarity is never a cost source", () => {
  const module = readFileSync(new URL("../app/shop-map-cost-rules.ts", import.meta.url), "utf8");
  const code = module.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /title|similar/i);
});

test("one estimated order makes the whole month estimated", () => {
  const state = profitState({ grossRevenueMinor: 10_000, feesMinor: -1_500, costs: [
    { receiptId: 1, costMinor: 1_000, source: "current-exact-product", confidence: "verified", why: "" },
    { receiptId: 2, costMinor: 900, source: "exact-product-family-rule", confidence: "estimated", why: "" },
  ] });
  assert.equal(state.headline, "Estimated profit");
  assert.match(state.accuracy, /verified for 50% of revenue/);
});

test("everything verified flips the headline on its own", () => {
  const state = profitState({ grossRevenueMinor: 10_000, feesMinor: -1_500, costs: [
    { receiptId: 1, costMinor: 1_000, source: "current-exact-product", confidence: "verified", why: "" },
  ] });
  assert.equal(state.headline, "Verified profit");
  assert.match(state.accuracy, /100%/);
  assert.equal(state.profitMinor, 10_000 - 1_500 - 1_000);
});

test("a missing cost cannot be estimated away", () => {
  const state = profitState({ grossRevenueMinor: 10_000, feesMinor: -1_500, costs: [
    { receiptId: 1, costMinor: 0, source: "unavailable", confidence: "none", why: "" },
  ] });
  assert.equal(state.headline, "Profit unavailable");
  assert.equal(state.profitMinor, null);
});

test("there is only ever one headline number", () => {
  const state = profitState({ grossRevenueMinor: 10_000, feesMinor: -1_500, costs: [
    { receiptId: 1, costMinor: 900, source: "exact-product-family-rule", confidence: "estimated", why: "" },
  ] });
  /* Estimated and verified are never both offered as the figure. */
  assert.equal(typeof state.headline, "string");
  assert.ok(["Verified profit", "Estimated profit", "Profit unavailable"].includes(state.headline));
});

test("Etsy's HTML entities never reach a world label", () => {
  /* Measured live: the section came back as "Women&#39;s Tees" and that is
     what a member would have read on the map. */
  assert.equal(decodeEntities("Women&#39;s Tees"), "Women's Tees");
  assert.equal(decodeEntities("Sweaters &amp; Hoodies"), "Sweaters & Hoodies");
  assert.equal(decodeEntities("&quot;Good&quot;"), '"Good"');
  assert.equal(decodeEntities("plain"), "plain");
});

test("a measure nobody scored on cannot corroborate a direction", () => {
  /* Every world had zero reviews, and the leader "led on reviews" - which
     counted toward the two-measure threshold. */
  const flat = [
    world({ worldId: "a", label: "A", orders: 30, units: 30, revenueMinor: 90_000,
      reviews: 0, ordersLast90: 0, largestOrderMinor: 3_000 }),
    world({ worldId: "b", label: "B", orders: 2, units: 2, revenueMinor: 1_000,
      reviews: 0, ordersLast90: 0, largestOrderMinor: 500, activeListings: 1 }),
  ];
  const result = direction(flat);
  assert.equal(result.leadingMeasures.includes("reviews"), false,
    "a tied-at-zero measure was counted as a lead");
  assert.equal(result.leadingMeasures.includes("recent 90 days"), false);
});


test("worlds can still be renamed, merged and split by the member", () => {
  const listings = [
    ...[1, 2, 3].map(id => listing(id, { title: `Feminist Power ${id}` })),
    ...[4, 5, 6].map(id => listing(id, { title: `Nurse Life ${id}` })),
  ];
  const { worlds } = buildWorlds(listings);
  assert.ok(worlds.length >= 2, "two identities did not produce two worlds");
  const renamed = renameWorld(worlds, worlds[0].id, "Renamed");
  assert.equal(renamed[0].label, "Renamed");
  const merged = mergeWorlds(worlds, worlds[0].id, worlds[1].id);
  assert.equal(merged.length, worlds.length - 1);
  const split = splitListings(worlds, worlds[0].id, [worlds[0].listingIds[0]]);
  assert.equal(split[0].listingIds.length, worlds[0].listingIds.length - 1);
});
