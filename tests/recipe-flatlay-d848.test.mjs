import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* D848 · The saved-product tiles drew a placeholder garment on every card.
   The backfill route is a Worker, so the judgement it makes lives in
   app/api/product-recipes/flatlay.ts and is tested here on its own. */

const source = readFileSync(new URL("../app/api/product-recipes/flatlay.ts", import.meta.url), "utf8");
const module = await import("data:text/javascript," + encodeURIComponent(
  source.replace(/export type [^\n]*\n/g, "").replace(/: [A-Za-z<>\[\]{}|&"' ,?.-]+(?=[,)=])/g, "").replace(/ as [A-Za-z<>\[\]]+/g, "")
));

test("a front flatlay wins over the default and the first image", () => {
  assert.equal(module.flatlayOf([
    { src: "back.jpg", position: "back", is_default: true },
    { src: "front.jpg", position: "front" },
  ]), "front.jpg");
});

test("with no front shot the default is taken, then the first", () => {
  assert.equal(module.flatlayOf([{ src: "a.jpg", position: "folded" }, { src: "b.jpg", is_default: true }]), "b.jpg");
  assert.equal(module.flatlayOf([{ src: "a.jpg" }, { src: "b.jpg" }]), "a.jpg");
  assert.equal(module.flatlayOf([{ position: "front" }]), "");
  assert.equal(module.flatlayOf(undefined), "");
});

test("both Printify link shapes and a bare id identify a product", () => {
  assert.equal(module.productIdFromUrl("https://printify.com/app/editor/6a95054a23c6c917d60348b2/1"), "6a95054a23c6c917d60348b2");
  assert.equal(module.productIdFromUrl("https://printify.com/app/store/products/6a95054a23c6c917d60348b2"), "6a95054a23c6c917d60348b2");
  assert.equal(module.productIdFromUrl("6a95054a23c6c917d60348b2"), "6a95054a23c6c917d60348b2");
  assert.equal(module.productIdFromUrl("https://printify.com/app/products"), "");
});

test("a recipe that already has a photo is never fetched again", () => {
  const url = "https://printify.com/app/editor/6a95054a23c6c917d60348b2/1";
  assert.equal(module.needsPhoto({ templateUrl: url, previewImage: "https://images.printify.com/x.jpg" }), false);
  assert.equal(module.needsPhoto({ templateUrl: url, previewImage: "" }), true);
  assert.equal(module.needsPhoto({ templateUrl: url }), true);
  /* Nothing to ask Printify about: no round trip. */
  assert.equal(module.needsPhoto({ templateUrl: "https://printify.com/app/products" }), false);
  assert.equal(module.needsPhoto({ templateUrl: null }), false);
});

test("the real photo replaces the placeholder rather than stacking above it", () => {
  const css = readFileSync(new URL("../app/interface-v2.css", import.meta.url), "utf8");
  /* .recipe-icon is a grid whose ::before draws the grey shirt. Left in place,
     the pseudo-element and the <img> take a row each. */
  assert.match(css, /\.recipe-icon:has\(> img\)::before\{content:none\}/);
});

test("the bank asks for photos once, and only when a tile is missing one", () => {
  const client = readFileSync(new URL("../app/factory-tools.tsx", import.meta.url), "utf8");
  assert.match(client, /if\(photoBackfill\.current\)return;/);
  assert.match(client, /if\(!loaded\.some\(recipe=>!recipe\.previewImage\)\)return;/);
  assert.match(client, /fetch\("\/api\/product-recipes\/photos",\{method:"POST"\}\)/);
});
