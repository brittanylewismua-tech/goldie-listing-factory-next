import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* D860 · An away product must not appear in the product grid OR the bundle
   creator. It kept being fixed one surface at a time: D835 scoped the grid and
   left the bundles selectable, D836 disabled the bundles and left them on
   display, D859 took them out of the grid - and the bundle CREATOR still
   mapped the whole recipe list, so all five products came back as checkboxes
   and could be built into another cross-shop bundle. */

const source = readFileSync(new URL("../app/bank-scope.ts", import.meta.url), "utf8");
const { default: ts } = await import("typescript");
const { scopeBank } = await import("data:text/javascript," + encodeURIComponent(
  ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
));

/* Her account exactly, as /api/product-recipes returned it. */
const RECIPES = [
  { id: "tee", name: "Gildan Tee", reach: "here", printifyShopTitle: "She's A Wolf Clothing" },
  { id: "crew", name: "gildan crewneck", reach: "away", printifyShopTitle: "GODISAGIRLAPPAREL" },
  { id: "hoodie", name: "Gildan Hoodie", reach: "away", printifyShopTitle: "GODISAGIRLAPPAREL" },
  { id: "cc1566", name: "Comfort Colors® 1566 crewneck", reach: "away", printifyShopTitle: "GODISAGIRLAPPAREL" },
  { id: "generic", name: "Generic brand", reach: "away", printifyShopTitle: "GODISAGIRLAPPAREL" },
];
const BUNDLES = [
  { id: "b1", name: "Hoodie + 1566 crewneck", recipeIds: ["hoodie", "cc1566"] },
  { id: "b2", name: "ZZ TEST BUNDLE", recipeIds: ["hoodie", "tee", "crew"] },
];
const AWAY = ["crew", "hoodie", "cc1566", "generic"];

test("no away product survives into anything the seller can act on", () => {
  const bank = scopeBank(RECIPES, BUNDLES);
  /* `reachable` is the single list behind the product grid, the bundle
     creator's checkboxes and its two-product availability check, so proving it
     here proves all three. */
  for (const id of AWAY) {
    assert.ok(!bank.reachable.some(r => r.id === id), `${id} must not be offered`);
  }
  assert.deepEqual(bank.reachable.map(r => r.id), ["tee"]);
});

test("a cross-shop bundle cannot be built, because the parts are not there", () => {
  const bank = scopeBank(RECIPES, BUNDLES);
  /* The creator's checkbox list is `reachable`. With one product left there is
     nothing to combine, and the availability check agrees rather than saying
     "Save 2 products first" about products she has already saved. */
  assert.equal(bank.reachable.length, 1);
  assert.ok(bank.reachable.length < 2, "the creator must not open with one usable product");
});

test("both of her bundles are gone from the grid, not greyed out in it", () => {
  const bank = scopeBank(RECIPES, BUNDLES);
  assert.deepEqual(bank.usableBundles, []);
  assert.deepEqual(bank.bundlesElsewhere.map(b => b.id), ["b1", "b2"]);
  /* ZZ TEST BUNDLE holds Gildan Tee, which IS in this shop - one blocked
     member is still enough. */
  assert.deepEqual(bank.blockedMembers(BUNDLES[1]).map(r => r.id), ["hoodie", "crew"]);
});

test("everything hidden is counted, and its store named", () => {
  const bank = scopeBank(RECIPES, BUNDLES);
  assert.equal(bank.hiddenCount, 6);
  assert.deepEqual(bank.hiddenStores, ["GODISAGIRLAPPAREL"]);
});

test("with nothing away, nothing is hidden and every bundle stays", () => {
  const open = RECIPES.map(r => ({ ...r, reach: "here" }));
  const bank = scopeBank(open, BUNDLES);
  assert.equal(bank.reachable.length, 5);
  assert.equal(bank.hiddenCount, 0);
  assert.deepEqual(bank.usableBundles.map(b => b.id), ["b1", "b2"]);
});

test("a bundle naming a product that no longer exists is not treated as away", () => {
  /* A deleted member is a different problem with a different message; the
     4-product cap and the 2-product minimum already cover it. */
  const bank = scopeBank([RECIPES[0]], [{ id: "b3", name: "Ghost", recipeIds: ["tee", "deleted"] }]);
  assert.deepEqual(bank.usableBundles.map(b => b.id), ["b3"]);
  assert.equal(bank.hiddenCount, 0);
});

test("every surface reads the one scoped list — D860", () => {
  const tools = readFileSync(new URL("../app/factory-tools.tsx", import.meta.url), "utf8");
  assert.match(tools, /const \{ reachable, usableBundles, hiddenCount, blockedMembers \} = scopeBank\(recipes, bundles\);/);

  /* The three surfaces she found still on the unscoped list. */
  assert.match(tools, /if\(open&&!bundleForm&&reachable\.length>=2&&!pendingAction\)openBundle\(\)/, "availability check");
  assert.match(tools, /:reachable\.length<2\?<>Save 2 products first/, "the two-product copy");
  assert.match(tools, /\{reachable\.map\(recipe=><label/, "the checkbox list");

  /* And nothing renders or counts from the raw list any more. */
  const body = tools.slice(tools.indexOf("const { reachable,"));
  for (const leak of ["{recipes.map(recipe=><label", "recipes.length>=2", "recipes.length<2"]) {
    assert.ok(!body.includes(leak), `the unscoped list is still read: ${leak}`);
  }
});

test("the bundle disclosure does not open when fewer than two products are available — D861", () => {
  const tools = readFileSync(new URL("../app/factory-tools.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/interface-v2.css", import.meta.url), "utf8");

  assert.match(tools, /<details className="bundle-library" open=\{bundleForm\}/,
    "Edit bundle must still be able to open the controlled disclosure");
  assert.match(tools, /<summary aria-disabled=\{reachable\.length<2&&!bundleForm\} onClick=\{event=>\{if\(reachable\.length<2&&!bundleForm\)event\.preventDefault\(\)\}\}>/,
    "the native details toggle must be cancelled when no bundle can be created");
  assert.match(css, /\.bundle-library > summary\[aria-disabled="true"\]\{cursor:default;opacity:\.72\}/);
});
