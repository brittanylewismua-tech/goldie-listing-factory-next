import { test } from "node:test";
import assert from "node:assert/strict";
import { productAcceptsMockup, garmentKind, productSurfaceFamily } from "../app/mockup-compatibility.ts";

/* D543 · This rule existed twice and only one copy was ever fixed.
 *
 * D529 fixed compatibleTemplate() in integrated-mockups.tsx, after her Ceramic
 * Mug batch was offered ten BACH TEES scenes. productAcceptsMockup() in
 * listing-factory-app.tsx answered the same question and was never touched - and
 * it is the copy that fills the Mockup set dropdown she actually picks from.
 *
 * Measured live on her three-product bundle, Gildan Hoodie card, D542:
 * the dropdown offered "white mugs" and nothing else. Her library holds ten
 * apparel scenes and four curved ones. She was shown the four mug scenes and
 * none of her ten garment scenes, for a hoodie.
 *
 * Both defects in that copy are pinned below, against her real library. Every
 * assertion here is behaviour, not source shape, because the source-shape tests
 * are what let a second copy drift in the first place. */

const LIBRARY = [
  { theme: "BACH TEES", surfaceKind: "apparel", count: 10 },
  { theme: "white mugs", surfaceKind: "curved", count: 4 },
];
const offered = (productName) =>
  LIBRARY.filter((set) => productAcceptsMockup(set.surfaceKind, productName)).map((set) => set.theme);

test("her hoodie is offered her garment scenes and no mugs — D543", () => {
  /* Defect 2: a hoodie demanded surfaceKind==="hoodie" exactly, so every scene
     she saved as the generic "apparel" was rejected. She photographs a flat lay
     once and uses it for the tee, the crewneck and the hoodie. */
  assert.deepEqual(offered("Unisex Midweight Softstyle Fleece Hoodie"), ["BACH TEES"]);
  assert.deepEqual(offered("Gildan Hoodie"), ["BACH TEES"]);
  assert.deepEqual(offered("Unisex Crewneck Sweatshirt"), ["BACH TEES"]);
  assert.deepEqual(offered("Unisex Softstyle T-Shirt"), ["BACH TEES"]);
});

test("her mug is offered mug scenes and no garments — D529 stays fixed", () => {
  /* Defect 1: any non-apparel scene returned true for any product, so mugs
     passed for a hoodie. And the original D529 case, from the other direction. */
  assert.deepEqual(offered("Ceramic Mug 11oz"), ["white mugs"]);
  assert.deepEqual(offered("Stainless Steel Tumbler"), ["white mugs"]);
  /* Found by this test on its first run: the apparel hints were bare substrings,
     so "Stainless STEEl" matched "tee" and every steel product was read as
     apparel and offered garment scenes. */
  assert.equal(productSurfaceFamily("Stainless Steel Tumbler"), "curved");
  assert.equal(productSurfaceFamily("Steel Water Bottle"), "curved");
  assert.equal(productSurfaceFamily("Canvas Tote Bag"), "flat");
});

test("a scene that names a different garment is refused", () => {
  assert.equal(productAcceptsMockup("t-shirt", "Gildan Hoodie"), false);
  assert.equal(productAcceptsMockup("hoodie", "Unisex Softstyle T-Shirt"), false);
  assert.equal(productAcceptsMockup("sweatshirt", "Gildan Hoodie"), false);
  // ...but its own kind, and the generic ones, are fine.
  assert.equal(productAcceptsMockup("hoodie", "Gildan Hoodie"), true);
  assert.equal(productAcceptsMockup("apparel", "Gildan Hoodie"), true);
  assert.equal(productAcceptsMockup("other-apparel", "Gildan Hoodie"), true);
});

test("an unrecognised product still sees everything she owns", () => {
  /* Guessing wrong must never hide her own scenes - she can judge a scene she
     can see, and cannot judge one the app silently dropped. */
  assert.equal(productSurfaceFamily("Embroidered Pet Bandana Thing"), "");
  assert.deepEqual(offered("Embroidered Pet Bandana Thing"), ["BACH TEES", "white mugs"]);
});

test("flat goods and curved goods do not mix", () => {
  assert.equal(productAcceptsMockup("curved", "18x24 Matte Poster"), false);
  assert.equal(productAcceptsMockup("rigid-flat", "18x24 Matte Poster"), true);
  assert.equal(productAcceptsMockup("rigid-flat", "Ceramic Mug 11oz"), false);
});

test("garmentKind reads the names Printify actually uses", () => {
  assert.equal(garmentKind("Unisex Midweight Softstyle Fleece Hoodie"), "hoodie");
  assert.equal(garmentKind("Unisex Crewneck Sweatshirt"), "sweatshirt");
  assert.equal(garmentKind("Unisex Softstyle T-Shirt"), "t-shirt");
  assert.equal(garmentKind("Bella + Canvas 3001 Tee"), "t-shirt");
  assert.equal(garmentKind("Ceramic Mug 11oz"), "");
});

test("one copy of the rule, so it cannot drift again — D543", async () => {
  const { readFile } = await import("node:fs/promises");
  const [app, mockups] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
  ]);
  for (const [name, src] of [["listing-factory-app", app], ["integrated-mockups", mockups]]) {
    assert.ok(src.includes('from "./mockup-compatibility"'), `${name} imports the rule`);
    assert.ok(!/function productAcceptsMockup\(/.test(src), `${name} must not keep its own copy`);
    assert.ok(!/function compatibleTemplate\(/.test(src), `${name} must not keep its own copy`);
    assert.ok(!/function productSurfaceFamily\(/.test(src), `${name} must not keep its own copy`);
  }
});
