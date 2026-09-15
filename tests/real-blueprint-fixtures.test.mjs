/*
  THE SEVEN BLANKS ACTUALLY IN THE SHOP.

  Measured from the connected Printify account: 51 products across seven
  blueprint ids. These are the fixtures that matter, because these are the
  blanks where a wrong category would cost a live listing.

  No listing or draft is created here. Payloads are constructed dry.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { classifyBlueprint, validateMapping, mayUseNewFlow } from "../app/blueprint-registry.ts";
import { productFactsFor } from "../app/product-facts.ts";
import { planBatch } from "../app/listing-call-plan.ts";
import { parseFamilyCopy, fallbackCopy } from "../app/family-copy.ts";

const SHOP = [
  { id: 6, title: "Unisex Heavy Cotton Tee", family: "tee", products: 33, node: 1_455 },
  { id: 706, title: "Unisex Garment-Dyed T-shirt", family: "tee", products: 6, node: 1_455 },
  { id: 77, title: "Unisex Heavy Blend™ Hooded Sweatshirt", family: "hoodie", products: 5, node: 1_469 },
  { id: 269, title: "Tough Phone Cases", family: "phoneCase", products: 2, node: 391 },
  { id: 68, title: "Mug 11oz", family: "mug", products: 2, node: 1_284 },
  { id: 49, title: "Unisex Heavy Blend™ Crewneck Sweatshirt", family: "crewneck", products: 2, node: 1_469 },
  { id: 400, title: "Kiss-Cut Stickers", family: "sticker", products: 1, node: 2_579 },
];

test("every blueprint in the shop maps, and maps to the node measured live", () => {
  const failures = [];
  for (const blank of SHOP) {
    const mapping = classifyBlueprint(blank.title);
    if (!mayUseNewFlow(mapping.status))
      failures.push(`${blank.id} ${blank.title}: status ${mapping.status}`);
    if (mapping.etsyTaxonomyNodeId !== blank.node)
      failures.push(`${blank.id}: node ${mapping.etsyTaxonomyNodeId}, expected ${blank.node}`);
    const checked = validateMapping({ ...mapping, productFamily: blank.family });
    if (!checked.usable) failures.push(`${blank.id}: ${checked.problems.join("; ")}`);
  }
  /* Listed individually. A bad category is never averaged into a pass rate. */
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("two tee blueprints share one mapping, as identical physical products should", () => {
  const first = classifyBlueprint("Unisex Heavy Cotton Tee");
  const second = classifyBlueprint("Unisex Garment-Dyed T-shirt");
  assert.equal(first.etsyTaxonomyNodeId, second.etsyTaxonomyNodeId);
  assert.deepEqual(first.requiredProperties, second.requiredProperties);
});

test("a hoodie and a crewneck share an Etsy node but differ where it counts", () => {
  const hoodie = classifyBlueprint("Unisex Heavy Blend™ Hooded Sweatshirt");
  const crew = classifyBlueprint("Unisex Heavy Blend™ Crewneck Sweatshirt");
  assert.equal(hoodie.etsyTaxonomyNodeId, crew.etsyTaxonomyNodeId);
  /* Etsy groups them; the neckline and the product noun must not be. */
  assert.notDeepEqual(hoodie.allowedValues.Neckline, crew.allowedValues.Neckline);
  assert.notEqual(hoodie.productNoun, crew.productNoun);
});

test("no apparel property reaches the mug, the case or the sticker", () => {
  for (const blank of SHOP.filter(row => !["tee", "hoodie", "crewneck"].includes(row.family))) {
    const facts = productFactsFor(blank.title);
    assert.ok(facts.mapped);
    for (const property of ["Sleeve length", "Neckline", "Garment fit"])
      assert.equal(facts.attributes[property], undefined,
        `${blank.title} carries ${property}`);
  }
});

test("the whole shop, one design, costs two paid calls", () => {
  /* 51 products across 7 blanks and 5 families. */
  const items = SHOP.flatMap(blank =>
    Array.from({ length: blank.products }, () =>
      ({ artworkHash: "design-a", blueprintTitle: blank.title })));
  assert.equal(items.length, 51);
  const plan = planBatch(items);
  assert.equal(plan.unmappedBlueprints.length, 0);
  assert.equal(plan.designCalls.length, 1);
  assert.equal(plan.familyCopyCalls.length, 1);
  assert.equal(plan.totalPaidCalls, 2);
  assert.equal(plan.legacyPaidCalls, 102);
});

test("a warm repeat of the whole shop costs nothing", () => {
  const items = SHOP.map(blank => ({ artworkHash: "design-a", blueprintTitle: blank.title }));
  const families = [...new Set(SHOP.map(blank => blank.family))];
  const warm = planBatch(items, {
    alreadyExtracted: new Set(["design-a"]),
    cachedCopy: new Set(families.map(family => `design-a:${family}`)),
  });
  assert.equal(warm.totalPaidCalls, 0);
});

test("the dry publish payload is complete for every blank", () => {
  const families = [...new Set(SHOP.map(blank => blank.family))];
  const copy = parseFamilyCopy(
    JSON.stringify(Object.fromEntries(families.map(family =>
      [family, { blurb: `A ${family} blurb.` }]))),
    families, family => fallbackCopy(family, family, ["MAMA NEEDS COFFEE"]));

  for (const blank of SHOP) {
    const mapping = classifyBlueprint(blank.title);
    const facts = productFactsFor(blank.title);
    const payload = {
      taxonomyId: mapping.etsyTaxonomyNodeId,
      isPhysical: mapping.physicalListing,
      attributes: facts.attributes,
      description: copy.copy[blank.family].blurb,
      productNoun: mapping.productNoun,
    };
    assert.ok(payload.taxonomyId, `${blank.title} has no taxonomy id`);
    assert.equal(payload.isPhysical, true);
    assert.ok(payload.description.length > 0, `${blank.title} would publish with no description`);
    assert.ok(payload.productNoun, `${blank.title} has no noun for title composition`);
    for (const [property, value] of Object.entries(payload.attributes)) {
      const allowed = mapping.allowedValues[property];
      if (allowed)
        assert.ok(allowed.includes(value),
          `${blank.title}: ${property}="${value}" is not an allowed value`);
    }
  }
});
