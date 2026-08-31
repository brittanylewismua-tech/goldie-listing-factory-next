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

test("with no Etsy shop connected nothing is scoped away", () => {
  const reach = reachResolver(0, [{ printify_shop_id: WOLF_PRINTIFY, etsy_shop_id: SHESAWOLF }]);
  assert.equal(reach(GODISAGIRL), "unproven");
});

test("the route asks the resolver rather than keeping its own copy", () => {
  const route = readFileSync(new URL("../app/api/product-recipes/route.ts", import.meta.url), "utf8");
  assert.match(route, /import \{ reachResolver, type Proof \} from "\.\/reach";/);
  assert.match(route, /const reach = reachResolver\(active\?\.shop_id \|\| 0, proofs\.results \|\| \[\]\);/);
});

test("the products scoped away are offered as a count and a way to switch", () => {
  const tools = readFileSync(new URL("../app/factory-tools.tsx", import.meta.url), "utf8");
  assert.match(tools, /const elsewhere = recipes\.filter\(recipe => recipe\.reach === "away"\);/);
  assert.match(tools, /not offered while you are in/);
  assert.match(tools, /Switch shop/);
});
