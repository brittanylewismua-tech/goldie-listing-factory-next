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

test("the bank asks once and repairs stale or missing product photos", () => {
  const client = readFileSync(new URL("../app/factory-tools.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/product-recipes/photos/route.ts", import.meta.url), "utf8");
  assert.match(client, /if\(photoBackfill\.current\)return;/);
  assert.doesNotMatch(client, /if\(!loaded\.some\(recipe=>!recipe\.previewImage\)\)return;/,
    "an existing fabric-detail image must not prevent the real product mockup replacing it");
  assert.match(client, /fetch\("\/api\/product-recipes\/photos",\{method:"POST"\}\)/);
  assert.match(route, /\.filter\(\(entry\) => Boolean\(entry\.productId\)\)/,
    "the server must refresh stale photos as well as fill blank ones");
});

test("a thumbnail plate is never the same colour as the artwork — D851", () => {
  const css = readFileSync(new URL("../app/interface-v2.css", import.meta.url), "utf8");
  /* Measured live on the publish step, every image loaded and complete: a white
     sweatshirt mockup and a pale-ink design both read as empty 52px boxes on
     D844's white plate. A checker is never the same colour as the art. */
  const block = css.slice(css.indexOf("D851 · the thumbnails"));
  for (const selector of ["bundle-product-photo", "final-group-thumb", "batch-history-thumbnail", "recipe-icon > img", "task-listing-preview img"]) {
    assert.ok(block.includes(selector), `${selector} still sits on a plain plate`);
  }
  assert.match(block, /background-image:\s*\n?\s*linear-gradient\(45deg,#f0e9ee/);
  assert.match(block, /background-size:8px 8px/);
  assert.match(block, /background-position:0 0,4px 4px/);
});

test("the flatlay stays inside its band — D856", () => {
  const css = readFileSync(new URL("../app/interface-v2.css", import.meta.url), "utf8");
  /* Measured on the deployed D852: .recipe-icon was height 116px with
     grid-template-rows 258px, so the img rendered 258px tall and printed the
     garment straight through the product name and the store badge below it.
     D848 uncovered this by removing the ::before that used to size the row. */
  assert.match(css, /\.recipe-icon:has\(> img\)\{grid-template-rows:minmax\(0,1fr\);overflow:hidden\}/);
  assert.match(css, /\.recipe-icon > img\{width:auto;max-width:100%;height:100%;min-height:0;max-height:100%\}/);
});

test("the tile actions are legible where their sizes actually win — D856", () => {
  const approved = readFileSync(new URL("../app/approved-functional.css", import.meta.url), "utf8");
  /* D850 set 11px in interface-v2.css and measured 10px and 9px live: the
     !important declarations that win these two live here. */
  assert.match(approved, /\.recipe-card \.delete-recipe\{[^}]*font-size:11px!important/);
  assert.match(approved, /\.recipe-card \.edit-recipe\{font-size:11px!important/);
});
