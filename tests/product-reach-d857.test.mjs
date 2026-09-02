import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* D857 · She was looking at four GODISAGIRLAPPAREL products in a She's A Wolf
   Clothing portal, after the bank had supposedly been scoped to one shop.
   Measured live from /api/product-recipes:

     activeEtsyShop  16538900  shesawolfclothing
     Gildan Tee      1374648   She's A Wolf Clothing   here
     four others     20191756  GODISAGIRLAPPAREL       unproven

   D835 offered anything unproven. Nothing was unproven about those four. */

/* Transpiled with the compiler the project already builds with, rather than a
   hand-rolled regex stripper - two of those have now silently mangled a module
   into a SyntaxError before it ever ran an assertion. */
const source = readFileSync(new URL("../app/api/product-recipes/reach.ts", import.meta.url), "utf8");
const { default: ts } = await import("typescript");
const { reachResolver } = await import("data:text/javascript," + encodeURIComponent(
  ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
));

const SHESAWOLF = 16538900, GODISAGIRL = 20191756, WOLF_PRINTIFY = 1374648, ETSY_OTHER = 99;

test("her exact account: one proven store settles every other store", () => {
  const reach = reachResolver(SHESAWOLF, [{ printify_shop_id: WOLF_PRINTIFY, etsy_shop_id: SHESAWOLF }]);
  assert.equal(reach(WOLF_PRINTIFY), "here");
  assert.equal(reach(GODISAGIRL), "away", "the store that is not the proven one cannot be a candidate");
});

test("with nothing proven for the active shop, every store is still offered", () => {
  /* The generous reading D835 was built on, kept for the case it was right
     about: hiding a product on no evidence is how a seller loses work. */
  const reach = reachResolver(SHESAWOLF, []);
  assert.equal(reach(GODISAGIRL), "unproven");
  assert.equal(reach(WOLF_PRINTIFY), "unproven");
});

test("a proof for a DIFFERENT shop does not settle the active one", () => {
  /* Knowing GODISAGIRL pairs with some other Etsy shop tells us that store is
     away, but says nothing about any store we have not tested. */
  const reach = reachResolver(SHESAWOLF, [{ printify_shop_id: GODISAGIRL, etsy_shop_id: ETSY_OTHER }]);
  assert.equal(reach(GODISAGIRL), "away");
  assert.equal(reach(WOLF_PRINTIFY), "unproven", "an untested store is still a candidate");
});

test("a recipe that never recorded its store is never hidden", () => {
  /* printifyShopId 0 means the recipe predates D835 recording it. Hiding those
     would empty the bank for anyone who has not reopened a product since. */
  const reach = reachResolver(SHESAWOLF, [{ printify_shop_id: WOLF_PRINTIFY, etsy_shop_id: SHESAWOLF }]);
  assert.equal(reach(0), "here");
});

test("with no Etsy shop connected nothing is scoped away — D858", () => {
  /* The first version of this test asked only about GODISAGIRL, which returns
     "unproven" whether the rule holds or not, and so passed over a real bug:
     with activeEtsyShopId 0 the loop tested every proof against 0, dropped all
     of them into `away`, and scoped out the one store that had been PROVEN
     good. The proven store is the case that has to be asserted. */
  const reach = reachResolver(0, [{ printify_shop_id: WOLF_PRINTIFY, etsy_shop_id: SHESAWOLF }]);
  assert.equal(reach(WOLF_PRINTIFY), "unproven", "a proven store must not be hidden with no active shop");
  assert.equal(reach(GODISAGIRL), "unproven");
  assert.equal(reach(0), "unproven");
});

test("nothing is EVER away while no Etsy shop is active — D858", () => {
  /* Whatever the proof table says, and however many shops it names. */
  const reach = reachResolver(0, [
    { printify_shop_id: WOLF_PRINTIFY, etsy_shop_id: SHESAWOLF },
    { printify_shop_id: GODISAGIRL, etsy_shop_id: ETSY_OTHER },
  ]);
  for (const store of [WOLF_PRINTIFY, GODISAGIRL, 5150]) assert.equal(reach(store), "unproven");
});

test("the route asks the resolver rather than keeping its own copy", () => {
  const route = readFileSync(new URL("../app/api/product-recipes/route.ts", import.meta.url), "utf8");
  assert.match(route, /import \{ reachResolver, type Proof \} from "\.\/reach";/);
  assert.match(route, /const reach = reachResolver\(active\?\.shop_id \|\| 0, proofs\.results \|\| \[\]\);/);
});

test("the products scoped away are offered as a count and a way to switch", () => {
  const tools = readFileSync(new URL("../app/factory-tools.tsx", import.meta.url), "utf8");
  const scope = readFileSync(new URL("../app/bank-scope.ts", import.meta.url), "utf8");
  assert.match(scope, /const elsewhere = recipes\.filter\(recipe => recipe\.reach === "away"\);/);
  assert.match(tools, /not offered while you are in/);
  assert.match(tools, /Switch shop/);
});

test("a bundle from another shop is taken out of the grid, not greyed out in it — D859", () => {
  const tools = readFileSync(new URL("../app/factory-tools.tsx", import.meta.url), "utf8");

  /* D836 disabled a bundle holding another store's product and left the tile
     on display reading "Different Etsy shop". After D857 scoped the products
     away, both of her bundles were unusable and both were still shown:

       Hoodie + 1566 crewneck   2 of 2 members under GODISAGIRLAPPAREL
       ZZ TEST BUNDLE           2 of 3 members under GODISAGIRLAPPAREL

     A control you cannot use is not information. */
  const scope = readFileSync(new URL("../app/bank-scope.ts", import.meta.url), "utf8");
  assert.match(scope, /const usableBundles = bundles\.filter\(bundle => blockedMembers\(bundle\)\.length === 0\);/);
  assert.match(scope, /const bundlesElsewhere = bundles\.filter\(bundle => blockedMembers\(bundle\)\.length > 0\);/);

  /* The grid and its heading both count only what can be used. */
  const section = tools.slice(tools.indexOf("bundle-card-heading") - 200);
  const heading = section.slice(0, section.indexOf("</div>"));
  assert.doesNotMatch(heading, /\{bundles\.length\}/, "the heading must not count bundles it does not render");
  assert.match(tools, /recipe-grid unified-bundle-grid">\{usableBundles\.map/);
});

test("one line accounts for every hidden product and bundle — D859", () => {
  const tools = readFileSync(new URL("../app/factory-tools.tsx", import.meta.url), "utf8");
  /* Hiding work without saying how much was hidden, or where it went, is how a
     seller concludes Goldie lost it. */
  const scope = readFileSync(new URL("../app/bank-scope.ts", import.meta.url), "utf8");
  assert.match(scope, /const hiddenCount = elsewhere\.length \+ bundlesElsewhere\.length;/);
  assert.match(scope, /hiddenStores = \[\.\.\.new Set\(\[/);
  assert.match(tools, /\{hiddenCount>0&&\(!activeId\|\|showLibrary\)&&<p className="recipe-other-store">/);
  assert.match(tools, /Switch shop/);
});
