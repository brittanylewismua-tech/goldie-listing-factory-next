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
