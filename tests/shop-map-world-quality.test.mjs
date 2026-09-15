/*
  THE QUALITY GATE.

  The first build called "Women's Tees", "Sweaters & Hoodies", "Feminist
  Mugs" and "For Her" worlds. A garment, a garment, a theme split by garment,
  and a gift-shop aisle. None of them names a buyer.

  Every label has to answer yes to: does this describe a recognisable person,
  identity, belief, community or occasion that several DIFFERENT products
  could serve?
*/
import test from "node:test";
import assert from "node:assert/strict";
import { rejectAsNiche, dimensionsFor, nicheFor } from "../app/shop-map-identity.ts";
import { buildWorlds } from "../app/shop-map-worlds.ts";

const listing = (id, over = {}) => ({
  listingId: id, title: "", tags: [], shopSection: "", productFamily: "tee", ...over });

test("a garment name is never a world", () => {
  for (const label of ["Women's Tees", "Men's Tees", "Sweaters & Hoodies",
    "Tees", "Hoodies", "Unisex Apparel", "Phone Cases"])
    assert.ok(rejectAsNiche(label), `"${label}" was accepted as a world`);
});

test("an identity split by product is rejected, so it can merge", () => {
  assert.match(rejectAsNiche("Feminist Mugs"), /split by product/);
  assert.match(rejectAsNiche("Feminist Phone Cases"), /split by product/);
  /* The identity itself passes, which is what they should merge into. */
  assert.equal(rejectAsNiche("Feminist"), "");
});

test("generic gift language is not a world", () => {
  for (const label of ["For Her", "For Him", "Gift", "Gifts", "Custom Order"])
    assert.ok(rejectAsNiche(label), `"${label}" was accepted as a world`);
});

test("an incomplete phrase is not a world", () => {
  for (const label of ["Women Are", "Custom Order For", "This Is The"])
    assert.match(rejectAsNiche(label), /incomplete/);
});

test("an HTML entity in a label is refused outright", () => {
  assert.match(rejectAsNiche("Women&#39;s Tees"), /HTML entity/);
});

test("real customer identities pass", () => {
  for (const label of ["Feminist", "Political resistance", "Motherhood",
    "Nurses", "Horse girls", "Grief and remembrance", "Halloween", "Bachelorette"])
    assert.equal(rejectAsNiche(label), "", `"${label}" was rejected`);
});

test("the same world merges across different products", () => {
  const listings = [
    listing(1, { title: "Feminist Tee", productFamily: "tee" }),
    listing(2, { title: "Feminist Mug", productFamily: "mug" }),
    listing(3, { title: "Feminist Sticker", productFamily: "sticker" }),
    listing(4, { title: "Feminist Phone Case", productFamily: "phoneCase" }),
  ];
  const { worlds } = buildWorlds(listings);
  assert.equal(worlds.length, 1, "one identity produced more than one world");
  assert.equal(worlds[0].label, "Feminist");
  /* The products are inside the world, as evidence. */
  const families = worlds[0].productFamilies.map(row => row.family).sort();
  assert.deepEqual(families, ["mug", "phoneCase", "sticker", "tee"]);
  assert.match(worlds[0].evidence, /tee 1, mug 1/);
});

test("product families are never promoted to worlds", () => {
  const listings = [1, 2, 3, 4, 5].map(id =>
    listing(id, { title: `Unisex Heavy Cotton Tee ${id}`, shopSection: "Women's Tees" }));
  const { worlds, assignments } = buildWorlds(listings);
  for (const world of worlds)
    assert.equal(rejectAsNiche(world.label), "", `"${world.label}" is not a customer`);
  /* Nothing recognisable about the buyer, so nothing is claimed. */
  assert.ok(assignments.every(row => row.unclassified));
});

test("niche categories stay flat - no manufactured hierarchy", () => {
  const listings = [
    ...[1, 2, 3].map(id => listing(id, { title: `Feminist Halloween Spooky ${id}` })),
    ...[4, 5, 6].map(id => listing(id, { title: `Feminist Rights March ${id}` })),
  ];
  const { worlds } = buildWorlds(listings);
  const feminist = worlds.find(world => world.label === "Feminist");
  assert.ok(feminist, "the niche was not formed");
  /* No parent-child layer: the data did not ask for one. */
  assert.equal(feminist.subWorlds, undefined);
});

test("an unclear listing stays unclassified rather than stuffed anywhere", () => {
  const listings = [
    ...[1, 2, 3].map(id => listing(id, { title: `Feminist Power ${id}` })),
    listing(9, { title: "Blue Abstract Shape" }),
  ];
  const { assignments } = buildWorlds(listings);
  assert.equal(assignments.find(row => row.listingId === 9).unclassified, true);
});

test("every niche records the evidence behind it", () => {
  const { worlds, assignments } = buildWorlds(
    [1, 2, 3].map(id => listing(id, { title: `Dog Mom Dachshund ${id}` })));
  for (const world of worlds) assert.ok(world.evidence.length > 0);
  for (const row of assignments.filter(entry => !entry.unclassified))
    assert.ok(row.evidence.length > 0, "an assignment kept no evidence");
});

test("basis is always the niche, never the product", () => {
  const { worlds } = buildWorlds(
    [1, 2, 3].map(id => listing(id, { title: `Nurse Life ${id}` })));
  for (const world of worlds) assert.equal(world.basis, "niche");
});

test("dimensions are stored apart and never concatenated", () => {
  const dimensions = dimensionsFor({ listingId: 1,
    title: "Feminist Halloween Mug for Mom", tags: [], shopSection: "Feminist Mugs",
    productFamily: "mug" });
  assert.equal(dimensions.niche, "Feminist");
  assert.equal(dimensions.occasion, "Halloween");
  assert.equal(dimensions.productFamily, "mug");
  assert.equal(dimensions.recipient, "For a mom");
  /* The world label carries no product word. */
  assert.equal(rejectAsNiche(nicheFor(dimensions)), "");
  assert.doesNotMatch(dimensions.niche, /mug|tee|case/i);
});
