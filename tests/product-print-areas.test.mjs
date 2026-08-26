/* D575 - Goldie has to work for every product a seller lists, not garments with
   a few others bolted on. These pin two things: that the families are recognised
   at all, and that each one is judged by a print area that makes sense for it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { productSurfaceFamily, printAreaBounds } from "../app/mockup-compatibility.ts";

test("the products she actually sells are recognised", () => {
  const flat = ["Shower Curtain", "Spiral Notebook", "Hardcover Journal", "Fleece Blanket",
    "Throw Pillow", "Phone Case", "Mouse Pad", "Coaster Set", "Jigsaw Puzzle", "Beach Towel",
    "Garden Flag", "Tote Bag", "Matte Poster", "Canvas Print", "Sticker Sheet", "Apron"];
  for (const name of flat) assert.equal(productSurfaceFamily(name), "flat", `${name} should be a flat printed surface`);
  for (const name of ["Ceramic Mug", "Stainless Steel Tumbler", "Water Bottle"])
    assert.equal(productSurfaceFamily(name), "curved", `${name} should be curved`);
  for (const name of ["Unisex Hoodie", "Gildan Tee", "Crewneck Sweatshirt", "Tank Top"])
    assert.equal(productSurfaceFamily(name), "apparel", `${name} should be apparel`);
});

test("a full-bleed product may have a print area that covers nearly all of it", () => {
  // The old rule refused anything wider than .9 of the photograph. A shower
  // curtain or a poster is printed edge to edge, so that rule would have
  // rejected the correct answer on exactly the products she named.
  const curtain = printAreaBounds("Shower Curtain");
  assert.ok(curtain.maxWidth > .9, "a shower curtain is printed nearly edge to edge");
  const poster = printAreaBounds("Matte Poster");
  assert.ok(poster.maxWidth > .9);
});

test("a garment is still judged as a garment", () => {
  const tee = printAreaBounds("Gildan Tee");
  assert.equal(tee.maxWidth, .7, "a chest print is never the whole torso");
  assert.ok(tee.minCentreY >= .12 && tee.maxCentreY <= .8, "and it sits on the torso");
  // A garment must NOT inherit the full-bleed ceiling.
  assert.ok(tee.maxWidth < printAreaBounds("Matte Poster").maxWidth);
});

test("a mug's print never becomes the whole mug", () => {
  const mug = printAreaBounds("Ceramic Mug");
  assert.ok(mug.maxWidth <= .6, "the visible face is a fraction of the mug, never all of it");
});

test("an unrecognised product stays permissive rather than refusing a real one", () => {
  const unknown = printAreaBounds("Artisanal Whatsit");
  assert.ok(unknown.maxWidth > .9 && unknown.minWidth < .06,
    "guessing wrong must not lock a seller out of their own product");
});
