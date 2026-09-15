/*
  THE GOLDEN CASE: ONE DESIGN, TWENTY PRODUCTS.

  This is the waste the audit found, written as a test so it cannot come
  back. Forty paid vision calls before; the plan has to do it in one.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planBatch, deterministicOutputs, modelOutputs } from "../app/listing-call-plan.ts";
import { productFactsFor, mappedFamilies } from "../app/product-facts.ts";

const APPAREL = ["Unisex Heavy Cotton Tee", "Unisex Hoodie", "Crewneck Sweatshirt",
  "Unisex Tank Top", "Long Sleeve Tee"];
const twentyApparel = Array.from({ length: 20 }, (unused, index) => ({
  artworkHash: "design-a",
  blueprintTitle: APPAREL[index % APPAREL.length],
}));

test("one design across twenty products makes exactly one vision call", () => {
  const plan = planBatch(twentyApparel);
  assert.equal(plan.designCalls.length, 1, `made ${plan.designCalls.length} design calls`);
  assert.equal(plan.legacyPaidCalls, 40, "the old flow's count is misstated");
});

test("no image call is made to categorize a product", () => {
  assert.equal(planBatch(twentyApparel).productCategorizationCalls, 0);
  /* And the category genuinely comes from a table. */
  const facts = productFactsFor("Unisex Heavy Cotton Tee");
  assert.ok(facts.mapped);
  assert.match(facts.category, /T-shirts/);
  assert.equal(facts.attributes["Sleeve length"], "Short sleeve");
});

test("twenty products across five families cost two paid calls", () => {
  const plan = planBatch(twentyApparel);
  /* One vision call for the design, one text call covering all five
     families. Not five text calls, and certainly not forty. */
  assert.equal(plan.designCalls.length, 1);
  assert.equal(plan.familyCopyCalls.length, 1);
  assert.equal(plan.familyCopyCalls[0].families.length, 5);
  assert.equal(plan.totalPaidCalls, 2, `plan makes ${plan.totalPaidCalls} paid calls`);
});

test("twenty products in ONE family also cost two", () => {
  const oneFamily = Array.from({ length: 20 }, () =>
    ({ artworkHash: "design-a", blueprintTitle: "Unisex Heavy Cotton Tee" }));
  const plan = planBatch(oneFamily);
  assert.equal(plan.totalPaidCalls, 2);
  assert.deepEqual(plan.familyCopyCalls[0].families, ["tee"]);
});

test("a fully warm cache costs nothing to run again", () => {
  const warm = planBatch(twentyApparel, {
    alreadyExtracted: new Set(["design-a"]),
    cachedCopy: new Set(["tee", "hoodie", "crewneck", "tank", "longSleeve"]
      .map(family => `design-a:${family}`)),
  });
  assert.equal(warm.totalPaidCalls, 0, "a warm repeat run still paid for something");
});

test("two new families later ask only for those two", () => {
  const plan = planBatch(twentyApparel, {
    alreadyExtracted: new Set(["design-a"]),
    cachedCopy: new Set(["tee", "hoodie", "crewneck"].map(family => `design-a:${family}`)),
  });
  assert.equal(plan.totalPaidCalls, 1);
  assert.deepEqual(plan.familyCopyCalls[0].families, ["longSleeve", "tank"]);
});

test("products that differ still get different facts", () => {
  const tee = productFactsFor("Unisex Heavy Cotton Tee");
  const mug = productFactsFor("Ceramic Mug 11oz");
  assert.notEqual(tee.category, mug.category);
  assert.equal(tee.attributes["Sleeve length"], "Short sleeve");
  assert.equal(mug.attributes["Sleeve length"], undefined,
    "a mug was given a sleeve length");
  assert.equal(mug.ageGroup, null);
});

test("an already-understood design costs nothing to reuse", () => {
  const plan = planBatch(twentyApparel, { alreadyExtracted: new Set(["design-a"]) });
  assert.equal(plan.designCalls.length, 0);
});

test("two designs are two calls, not one and not forty", () => {
  const mixed = [...twentyApparel,
    ...twentyApparel.map(item => ({ ...item, artworkHash: "design-b" }))];
  const plan = planBatch(mixed);
  assert.equal(plan.designCalls.length, 2);
  /* Two designs, two copy calls - one each, not one per family. */
  assert.equal(plan.familyCopyCalls.length, 2);
  assert.equal(plan.legacyPaidCalls, 80);
});

test("an unmapped blueprint surfaces instead of being guessed", () => {
  const plan = planBatch([{ artworkHash: "design-a", blueprintTitle: "Novelty Widget 3000" }]);
  assert.deepEqual(plan.unmappedBlueprints, ["Novelty Widget 3000"]);
  /* It must not silently acquire a category. */
  const facts = productFactsFor("Novelty Widget 3000");
  assert.equal(facts.mapped, false);
  assert.match(facts.because, /will guess/);
});

test("every mapped family declares the Etsy fields a publish requires", () => {
  for (const family of mappedFamilies()) {
    const sample = { tee: "Unisex Heavy Cotton Tee", hoodie: "Unisex Hoodie",
      crewneck: "Crewneck Sweatshirt", tank: "Unisex Tank Top",
      longSleeve: "Long Sleeve Tee", mug: "Ceramic Mug", tumbler: "Steel Tumbler",
      tote: "Cotton Tote Bag", poster: "Matte Poster", sticker: "Vinyl Sticker",
      blanket: "Fleece Blanket", koozie: "Can Cooler", phoneCase: "iPhone Case" }[family];
    const facts = productFactsFor(sample);
    assert.ok(facts.mapped, `${family} did not map from "${sample}"`);
    for (const required of ["Who made it", "What is it", "When was it made"])
      assert.ok(facts.requiredEtsyFields.includes(required),
        `${family} is missing the required Etsy field ${required}`);
  }
});

test("only the blurb needs a model; the publishing contract is composed", () => {
  for (const field of ["title", "tags", "category", "attributes"])
    assert.ok(deterministicOutputs.includes(field), `${field} still needs a model`);
  assert.ok(modelOutputs.includes("blurb"));
  assert.equal(modelOutputs.includes("category"), false);
});

test("design intelligence is per member, versioned, and never expires", () => {
  const module = readFileSync(new URL("../app/design-intelligence.ts", import.meta.url), "utf8");
  assert.match(module, /PRIMARY KEY \(user_id, artwork_hash, schema_version, model_version, prompt_version\)/);
  /* No expiry on a fact about bytes that cannot change. The comments discuss
     TTLs at length; the code must not implement one. */
  const code = module.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /expires_at|TTL|86_400_000/);
  /* Cross-member reuse would leak who holds which artwork. */
  const read = module.slice(module.indexOf("export async function readDesignIntelligence"));
  assert.match(read, /WHERE user_id = \?/);
});
