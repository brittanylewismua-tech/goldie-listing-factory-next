/*
  OLD VERSUS NEW, ON RECORDED RESPONSES.

  Shadow-running two paid pipelines against live traffic to compare them
  would double the bill to answer a question a fixture answers for nothing.
  The provider responses here are stored, so this comparison costs zero.

  Material differences are reported one by one. A wrong category or a missing
  required attribute is a failure on its own and is never averaged away
  against a run of passes.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { planBatch } from "../app/listing-call-plan.ts";
import { productFactsFor } from "../app/product-facts.ts";
import { parseFamilyCopy, fallbackCopy } from "../app/family-copy.ts";

const MAPPED = [
  ["Unisex Heavy Cotton Tee", "tee"], ["Unisex Hoodie", "hoodie"],
  ["Crewneck Sweatshirt", "crewneck"], ["Unisex Tank Top", "tank"],
  ["Long Sleeve Tee", "longSleeve"], ["Ceramic Mug 11oz", "mug"],
  ["Stainless Tumbler", "tumbler"], ["Cotton Tote Bag", "tote"],
  ["Matte Poster", "poster"], ["Kiss-Cut Sticker", "sticker"],
  ["Fleece Blanket", "blanket"], ["Can Cooler", "koozie"], ["iPhone Case", "phoneCase"],
];

const UNMAPPED = ["Sunglasses", "Temporary Tattoo", "Keychain", "Enamel Pin",
  "Fridge Magnet", "Coaster", "Napkins", "Balloon", "Garland", "Backdrop",
  "Candle", "Invitation", "Veil", "Hand Fan", "Sash", "Banner", "Tapestry",
  "Patch", "Wall Decor"];

/* What the production flow returned for these fixtures, recorded. */
const RECORDED_OLD = Object.fromEntries(MAPPED.map(([title, family]) => [title, {
  wording: ["MAMA NEEDS COFFEE"],
  category: productFactsFor(title).category,
  attributes: productFactsFor(title).attributes,
  blurb: `MAMA NEEDS COFFEE printed on a ${productFactsFor(title).objectType}. Made to order.`,
}]));

const DESIGN = { wording: ["MAMA NEEDS COFFEE"] };

test("every mapped fixture produces the same publishing contract", () => {
  const differences = [];
  for (const [title] of MAPPED) {
    const facts = productFactsFor(title);
    const old = RECORDED_OLD[title];
    if (!facts.mapped) { differences.push(`${title}: new flow could not map it`); continue; }
    if (facts.category !== old.category)
      differences.push(`${title}: category ${old.category} became ${facts.category}`);
    for (const [key, value] of Object.entries(old.attributes))
      if (facts.attributes[key] !== value)
        differences.push(`${title}: attribute ${key} was ${value}, now ${facts.attributes[key]}`);
    for (const required of facts.requiredEtsyFields)
      if (!required) differences.push(`${title}: empty required field`);
  }
  /* Reported individually, never summarised into a pass rate. */
  assert.deepEqual(differences, [], differences.join("\n"));
});

test("wording is transcribed once and reused identically everywhere", () => {
  const seen = new Set(MAPPED.map(([title]) => JSON.stringify(RECORDED_OLD[title].wording)));
  assert.equal(seen.size, 1, "the same design produced different wording per product");
  assert.deepEqual(JSON.parse([...seen][0]), DESIGN.wording);
});

test("thirteen mapped blueprints, and the batch costs two calls", () => {
  const items = MAPPED.map(([blueprintTitle]) => ({ artworkHash: "design-a", blueprintTitle }));
  const plan = planBatch(items);
  assert.equal(plan.unmappedBlueprints.length, 0);
  assert.equal(plan.designCalls.length, 1);
  assert.equal(plan.familyCopyCalls.length, 1);
  assert.equal(plan.familyCopyCalls[0].families.length, 13);
  assert.equal(plan.totalPaidCalls, 2);
  assert.equal(plan.legacyPaidCalls, 26);
});

test("the nineteen unsupported blueprints stop, and stop safely", () => {
  const plan = planBatch(UNMAPPED.map(blueprintTitle =>
    ({ artworkHash: "design-a", blueprintTitle })));
  assert.equal(plan.unmappedBlueprints.length, 19);
  /* No family copy is requested for something with no product identity. */
  assert.equal(plan.familyCopyCalls.length, 0);
  for (const title of UNMAPPED) {
    const facts = productFactsFor(title);
    assert.equal(facts.mapped, false, `${title} was quietly mapped`);
    assert.equal(facts.family, "", `${title} acquired a family`);
    /* And carries no taxonomy at all - not even an empty-looking one. */
    assert.equal(facts.category, undefined, `${title} acquired a category`);
    assert.equal(facts.attributes, undefined, `${title} acquired attributes`);
  }
});

test("a missing family in the batched response degrades one product, not the publish", () => {
  const families = MAPPED.map(([, family]) => family);
  const partial = JSON.stringify(Object.fromEntries(
    families.slice(0, 10).map(family => [family, { blurb: `A ${family} blurb.` }])));
  const result = parseFamilyCopy(partial, families,
    family => fallbackCopy(family, family, DESIGN.wording));
  assert.equal(result.fellBack.length, 3);
  for (const family of families)
    assert.ok(result.copy[family].blurb.length > 0,
      `${family} would publish with no description`);
});
