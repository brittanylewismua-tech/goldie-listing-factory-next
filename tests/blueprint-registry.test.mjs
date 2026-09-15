import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyBlueprint, validateMapping, mayUseNewFlow, APPAREL_ONLY, MAPPING_VERSION,
} from "../app/blueprint-registry.ts";

const withFamily = title => ({ ...classifyBlueprint(title),
  productFamily: (classifyBlueprint(title).productNoun && title) ? undefined : undefined });

test("a real blank maps to exactly one node, with the evidence recorded", () => {
  const tee = classifyBlueprint("Unisex Heavy Cotton Tee");
  assert.equal(tee.status, "official-direct");
  assert.equal(typeof tee.etsyTaxonomyNodeId, "number");
  assert.equal(tee.productNoun, "t-shirt");
  /* "The names seemed similar" is not evidence. */
  assert.match(tee.evidence, /resolves to family tee/);
  assert.match(tee.evidence, /exactly one Etsy node/);
});

test("an unmapped blank is queued, never guessed, and says why", () => {
  const unknown = classifyBlueprint("Novelty Widget 3000");
  assert.equal(unknown.status, "unsupported");
  assert.equal(unknown.etsyTaxonomyNodeId, null);
  assert.equal(unknown.category, "");
  assert.match(unknown.ambiguity, /Queued by blueprint id/);
  assert.equal(mayUseNewFlow(unknown.status), false);
});

test("only verified statuses reach the new publishing flow", () => {
  assert.equal(mayUseNewFlow("historical-and-current"), true);
  assert.equal(mayUseNewFlow("official-direct"), true);
  assert.equal(mayUseNewFlow("ambiguous"), false);
  assert.equal(mayUseNewFlow("unsupported"), false);
});

test("a category alone does not count as mapped", () => {
  const broken = { ...classifyBlueprint("Unisex Heavy Cotton Tee"),
    productFamily: "tee", requiredProperties: [] };
  const checked = validateMapping(broken);
  assert.equal(checked.usable, false);
  assert.ok(checked.problems.some(problem => /required properties/.test(problem)));
});

test("apparel properties cannot leak onto a mug", () => {
  const leaked = { ...classifyBlueprint("Ceramic Mug 11oz"), productFamily: "mug" };
  leaked.allowedValues = { ...leaked.allowedValues, "Sleeve length": ["Short sleeve"] };
  const checked = validateMapping(leaked);
  assert.equal(checked.usable, false);
  assert.ok(checked.problems.some(problem => /leaked onto non-apparel/.test(problem)));
});

test("every mapped family validates cleanly as it ships", () => {
  const samples = [["Unisex Heavy Cotton Tee", "tee"], ["Unisex Hoodie", "hoodie"],
    ["Crewneck Sweatshirt", "crewneck"], ["Unisex Tank Top", "tank"],
    ["Long Sleeve Tee", "longSleeve"], ["Ceramic Mug 11oz", "mug"],
    ["Stainless Tumbler", "tumbler"], ["Cotton Tote Bag", "tote"],
    ["Matte Poster", "poster"], ["Kiss-Cut Sticker", "sticker"],
    ["Fleece Blanket", "blanket"], ["Can Cooler", "koozie"], ["iPhone Case", "phoneCase"]];
  for (const [title, family] of samples) {
    const checked = validateMapping({ ...classifyBlueprint(title), productFamily: family });
    assert.equal(checked.usable, true, `${title}: ${checked.problems.join("; ")}`);
  }
});

test("non-apparel families carry no apparel property at all", () => {
  for (const title of ["Ceramic Mug 11oz", "Matte Poster", "Cotton Tote Bag", "Kiss-Cut Sticker"])
    for (const property of APPAREL_ONLY)
      assert.equal(classifyBlueprint(title).allowedValues[property], undefined,
        `${title} carries ${property}`);
});

test("the keyword-disambiguation nouns are not part of the registry", () => {
  /* They were never candidates for support, so they must not appear as
     unsupported blueprints in a report about real blanks. */
  const module = readFileSync(new URL("../app/blueprint-registry.ts", import.meta.url), "utf8");
  for (const noun of ["garland", "veil", "tapestry", "balloon", "napkin"])
    assert.doesNotMatch(module, new RegExp(noun, "i"), `${noun} leaked into the registry`);
});

test("identity is the blueprint id; titles are evidence only", () => {
  const route = readFileSync(new URL(
    "../app/api/listing-factory/blueprint-registry/route.ts", import.meta.url), "utf8");
  /* The blueprint's own title is fetched from the catalog, never the
     product title, which names the design. */
  assert.match(route, /catalog\/blueprints\/\$\{blueprintId\}\.json/);
  assert.match(route, /blueprintId/);
  assert.equal(MAPPING_VERSION, 1);
});

test("the mapping queue carries identity and counts, nothing else", () => {
  const module = readFileSync(new URL("../app/publish-identity.ts", import.meta.url), "utf8");
  const queue = module.slice(module.indexOf("blueprint_mapping_queue"));
  const table = queue.slice(0, queue.indexOf(")`"));
  for (const forbidden of ["user_id", "shop", "listing", "token", "design"])
    assert.doesNotMatch(table, new RegExp(forbidden, "i"),
      `the mapping queue stores ${forbidden}`);
  assert.match(table, /occurrences/);
});

test("publish identity is never backfilled by inference", () => {
  const module = readFileSync(new URL("../app/publish-identity.ts", import.meta.url), "utf8");
  assert.match(module, /unresolved_reason/);
  assert.doesNotMatch(module, /inferBlueprint|guessBlueprint|likeTitle/);
});
