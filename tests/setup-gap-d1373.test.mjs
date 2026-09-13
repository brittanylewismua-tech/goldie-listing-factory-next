import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("D1373: a product one field short says which field", () => {
  /* Both saved non-apparel products — the 11 oz mug and the iphone case — were
     complete except for a keyword bank, and the card said only "Finish setup".
     A product one field short looked identical to one never touched, and the
     only way to tell was to open it and compare seven sections against a tee
     that worked. */
  const tools = read("app/factory-tools.tsx");
  assert.match(tools, /export function recipeSetupGap\(recipe: Recipe\): string \| null/);
  assert.match(tools, /Finish setup: \{recipeSetupGap\(recipe\)\}/);
  assert.doesNotMatch(tools, /<em>Finish setup<\/em>/);

  /* Named in the order a seller fills them in, so the first thing reported is
     the first thing to go and do. */
  const gap = tools.slice(tools.indexOf("export function recipeSetupGap"));
  const order = ["colors", "sizes", "pricing", "shipping", "photos",
    "a description", "a keyword bank"];
  let at = -1;
  for (const name of order) {
    const found = gap.indexOf(`return "${name}"`);
    assert.ok(found > at, `${name} is reported out of order`);
    at = found;
  }

  /* The gate itself is now one rule, not two that can disagree. */
  assert.match(tools, /export function recipeIsSetUp\(recipe: Recipe\) \{\s*return recipeSetupGap\(recipe\) === null;/);
});
