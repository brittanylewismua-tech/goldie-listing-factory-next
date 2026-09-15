/*
  MONEY IS COUNTED ONCE.

  The live map reported Feminist 195 + Political resistance 105 +
  unclassified 85 = 385 against 293 listings, because a secondary niche was
  adding the listing to a second group. Its orders and revenue were being
  counted twice in the shop's own totals.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { buildWorlds } from "../app/shop-map-worlds.ts";
import { guidance, standout, COVERAGE_REQUIRED, coverageMet } from "../app/shop-map-guidance.ts";
import { performanceFrom } from "../app/shop-map-performance.ts";

const listing = (id, over = {}) => ({
  listingId: id, title: "", tags: [], shopSection: "", productFamily: "tee", ...over });

/* A shop with genuine overlap: witchy feminist designs sit in both. */
const shop = [
  ...[1, 2, 3, 4].map(id => listing(id, { title: `Feminist Smash Patriarchy Equality ${id}` })),
  ...[5, 6, 7].map(id => listing(id, { title: `Feminist Witch Coven Tarot Crystals ${id}` })),
  ...[8, 9, 10].map(id => listing(id, { title: `Anti Trump Resist Vote Protest ${id}` })),
  listing(11, { title: "Plain Blue Rectangle" }),
];

test("primary counts plus unclassified equal the listing count", () => {
  const { worlds, assignments } = buildWorlds(shop);
  const inNiches = worlds.reduce((sum, world) => sum + world.listingIds.length, 0);
  const unclassified = assignments.filter(row => row.unclassified).length;
  assert.equal(inNiches + unclassified, shop.length,
    `${inNiches} + ${unclassified} != ${shop.length}`);
});

test("no listing has more than one primary niche", () => {
  const { assignments } = buildWorlds(shop);
  for (const row of assignments)
    assert.ok(row.worldIds.length <= 1,
      `listing ${row.listingId} has ${row.worldIds.length} primary niches`);
});

test("a secondary niche never repeats the primary", () => {
  const { assignments } = buildWorlds(shop);
  for (const row of assignments)
    for (const id of row.secondaryWorldIds)
      assert.ok(!row.worldIds.includes(id),
        `listing ${row.listingId} counts the same niche twice`);
});

test("secondary assignments carry no money", () => {
  const { worlds, assignments } = buildWorlds(shop);
  /* Niche membership is built from primaries alone. */
  const membership = worlds.flatMap(world => world.listingIds);
  const secondaries = assignments.flatMap(row => row.secondaryWorldIds);
  assert.ok(secondaries.length >= 0);
  assert.equal(new Set(membership).size, membership.length,
    "a listing appears in two niches' membership");
});

test("niche totals never exceed the shop's own totals", () => {
  const sales = [
    { listingId: 1, quantity: 1, priceMinor: 2_500, soldAt: 1_000, refunded: false },
    { listingId: 5, quantity: 2, priceMinor: 2_000, soldAt: 1_000, refunded: false },
    { listingId: 8, quantity: 1, priceMinor: 3_000, soldAt: 1_000, refunded: true },
  ];
  const performance = performanceFrom(sales,
    { now: 2_000, monthFrom: 0, monthTo: 2_000, yearFrom: 0 });
  const shopOrders = sales.length;
  const shopRevenue = sales.reduce((sum, sale) => sum + sale.priceMinor * sale.quantity, 0);
  const shopRefunds = sales.filter(sale => sale.refunded).length;

  const { worlds } = buildWorlds(shop);
  let nicheOrders = 0;
  let nicheRevenue = 0;
  let nicheRefunds = 0;
  for (const world of worlds)
    for (const id of world.listingIds) {
      const row = performance.get(id);
      if (!row) continue;
      nicheOrders += row.lifetimeOrders;
      nicheRevenue += row.lifetimeRevenueMinor;
      nicheRefunds += row.refundedOrders;
    }
  assert.ok(nicheOrders <= shopOrders, `${nicheOrders} orders exceeds ${shopOrders}`);
  assert.ok(nicheRevenue <= shopRevenue, `${nicheRevenue} revenue exceeds ${shopRevenue}`);
  assert.ok(nicheRefunds <= shopRefunds, `${nicheRefunds} refunds exceeds ${shopRefunds}`);
});

test("moving a listing recomputes without duplicating it", () => {
  const { worlds } = buildWorlds(shop);
  const target = worlds[1]?.id ?? worlds[0].id;
  const { worlds: after, assignments } = buildWorlds(shop, {
    overrides: new Map([[1, [target]]]) });
  const membership = after.flatMap(world => world.listingIds);
  assert.equal(new Set(membership).size, membership.length,
    "the moved listing is now in two niches");
  const moved = assignments.find(row => row.listingId === 1);
  assert.deepEqual(moved.worldIds, [target]);
});

test("a classifier niche exists even when the lexicon never saw it", () => {
  /* Without this the override points at a niche that was never created and
     the listing vanishes from every total. */
  const { worlds, assignments } = buildWorlds(shop, {
    overrides: new Map([[11, ["niche:bachelorette"]]]),
    classifiedNiches: new Set(["Bachelorette"]),
  });
  assert.ok(worlds.some(world => world.id === "niche:bachelorette"),
    "the classifier's niche was not created");
  const moved = assignments.find(row => row.listingId === 11);
  assert.deepEqual(moved.worldIds, ["niche:bachelorette"]);
  assert.equal(moved.unclassified, false);
});

test("classifier assignments still reconcile to the listing count", () => {
  const classified = new Map(shop.map(listing =>
    [listing.listingId, ["niche:bachelorette"]]));
  const { worlds, assignments } = buildWorlds(shop, {
    overrides: classified, classifiedNiches: new Set(["Bachelorette"]) });
  const inNiches = worlds.reduce((sum, world) => sum + world.listingIds.length, 0);
  const unclassified = assignments.filter(row => row.unclassified).length;
  assert.equal(inNiches + unclassified, shop.length);
  const membership = worlds.flatMap(world => world.listingIds);
  assert.equal(new Set(membership).size, membership.length,
    "a listing landed in two niches");
});

test("one vocabulary at a time, so synonyms cannot both exist", () => {
  /* Live: "Political resistance" from the lexicon sat beside "Political
     Protest" from the classifier - one subject, two categories. */
  const { worlds } = buildWorlds(shop, {
    overrides: new Map([[1, ["niche:political-protest"]]]),
    classifiedNiches: new Set(["Political Protest"]),
  });
  const labels = worlds.map(world => world.label);
  assert.ok(labels.includes("Political Protest"));
  assert.ok(!labels.includes("Political resistance"),
    "both vocabularies produced a category for the same subject");
});

test("a listing the classifier did not place is unclassified, not lexicon-grouped", () => {
  const { assignments } = buildWorlds(shop, {
    overrides: new Map([[1, ["niche:political-protest"]]]),
    classifiedNiches: new Set(["Political Protest"]),
  });
  const untouched = assignments.find(row => row.listingId === 5);
  assert.equal(untouched.unclassified, true);
  /* And the reconciliation still holds. */
  const { worlds } = buildWorlds(shop, {
    overrides: new Map([[1, ["niche:political-protest"]]]),
    classifiedNiches: new Set(["Political Protest"]),
  });
  const inNiches = worlds.reduce((sum, world) => sum + world.listingIds.length, 0);
  const unclassified = assignments.filter(row => row.unclassified).length;
  assert.equal(inNiches + unclassified, shop.length);
});

test("product families survive whichever vocabulary named the niche", () => {
  /* They were computed during grouping and vanished the moment the
     classifier took over that step. */
  const mixed = [
    { listingId: 1, title: "A", tags: [], shopSection: "", productFamily: "tee" },
    { listingId: 2, title: "B", tags: [], shopSection: "", productFamily: "mug" },
    { listingId: 3, title: "C", tags: [], shopSection: "", productFamily: "tee" },
  ];
  const { worlds } = buildWorlds(mixed, {
    overrides: new Map(mixed.map(listing => [listing.listingId, ["niche:bachelorette"]])),
    classifiedNiches: new Set(["Bachelorette"]),
  });
  const niche = worlds.find(world => world.id === "niche:bachelorette");
  assert.ok(niche.productFamilies.length > 0, "the niche lost its product types");
  assert.deepEqual(niche.productFamilies,
    [{ family: "tee", listings: 2 }, { family: "mug", listings: 1 }]);
});

test("shares divide by the whole shop, not by the classified part", () => {
  /* A niche holding 44% of classified revenue was reported as 44% of the
     shop while $19,950 sat outside the map. */
  const niches = [
    { worldId: "a", label: "A", activeListings: 10, orders: 100, units: 100,
      revenueMinor: 40_000, verifiedProfitMinor: null, reviews: 0,
      ordersLast30: 0, ordersLast90: 10, revenueLast90Minor: 4_000,
      largestOrderMinor: 500, refundedOrders: 0 },
  ];
  /* The shop is twice the size of its one classified niche. */
  const shop = { revenueMinor: 80_000, activeListings: 20, ordersLast90: 20, orders: 200 };
  const withShop = guidance(niches, { shop });
  const withoutShop = guidance(niches);
  assert.match(withShop[0].reason, /50% of revenue/);
  assert.match(withoutShop[0].reason, /100% of revenue/);
});

test("a focus recommendation is gated on coverage", () => {
  const niches = [
    { worldId: "a", label: "A", activeListings: 3, orders: 40, units: 40,
      revenueMinor: 80_000, verifiedProfitMinor: null, reviews: 0,
      ordersLast30: 0, ordersLast90: 20, revenueLast90Minor: 40_000,
      largestOrderMinor: 2_000, refundedOrders: 0 },
  ];
  const thin = standout(niches, guidance(niches),
    { activeListings: 0.55, recentRevenue: 0.6, recentOrders: 0.6 });
  assert.equal(thin.hasStandout, false);
  assert.match(thin.headline, /still organizing enough of your shop/);
  assert.match(thin.nextStep, /% of active listings/);

  const covered = standout(niches, guidance(niches),
    { activeListings: 0.95, recentRevenue: 0.95, recentOrders: 0.95 });
  assert.doesNotMatch(covered.headline, /still organizing/);
});

test("the coverage thresholds are the ones agreed", () => {
  assert.equal(COVERAGE_REQUIRED.activeListings, 0.8);
  assert.equal(COVERAGE_REQUIRED.recentRevenue, 0.9);
  assert.equal(COVERAGE_REQUIRED.recentOrders, 0.9);
  assert.equal(coverageMet({ activeListings: 0.8, recentRevenue: 0.9, recentOrders: 0.9 }), true);
  assert.equal(coverageMet({ activeListings: 0.79, recentRevenue: 1, recentOrders: 1 }), false);
});

test("classified plus unclassified equals the shop, on every measure", () => {
  const sales = [
    { listingId: 1, quantity: 1, priceMinor: 2_500, soldAt: 1_000, refunded: false },
    { listingId: 5, quantity: 2, priceMinor: 2_000, soldAt: 1_000, refunded: false },
    { listingId: 11, quantity: 1, priceMinor: 9_000, soldAt: 1_000, refunded: true },
  ];
  const performance = performanceFrom(sales,
    { now: 2_000, monthFrom: 0, monthTo: 2_000, yearFrom: 0 });
  const { worlds, assignments } = buildWorlds(shop);
  const classifiedIds = new Set(worlds.flatMap(world => world.listingIds));
  const unclassifiedIds = assignments.filter(row => row.unclassified).map(row => row.listingId);

  const sum = (ids, pick) => ids.reduce((total, id) => {
    const row = performance.get(id);
    return total + (row ? pick(row) : 0);
  }, 0);
  const everyId = shop.map(listing => listing.listingId);

  for (const [name, pick] of [
    ["orders", row => row.lifetimeOrders],
    ["revenue", row => row.lifetimeRevenueMinor],
    ["refunds", row => row.refundedOrders],
  ]) {
    const whole = sum(everyId, pick);
    const parts = sum([...classifiedIds], pick) + sum(unclassifiedIds, pick);
    assert.equal(parts, whole, `${name}: ${parts} != ${whole}`);
  }
});

test("a listing can never be neither classified nor unclassified", () => {
  /* An override pointing at a niche the gate refuses left 20 listings in
     neither state: 235 + 38 came to 273 against 293. */
  const { worlds, assignments } = buildWorlds(shop, {
    /* "Girls Tshirts" is refused, so no niche is created for it. */
    overrides: new Map([[1, ["niche:girls-tshirts"]]]),
    classifiedNiches: new Set(["Girls Tshirts", "Political Protest"]),
  });
  const inNiches = new Set(worlds.flatMap(world => world.listingIds));
  for (const row of assignments) {
    const placed = inNiches.has(row.listingId);
    assert.ok(placed !== row.unclassified,
      `listing ${row.listingId} is ${placed ? "in a niche AND" : "in no niche and NOT"} unclassified`);
  }
  const unclassified = assignments.filter(row => row.unclassified).length;
  assert.equal(inNiches.size + unclassified, shop.length);
});
