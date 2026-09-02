import test from "node:test";
import assert from "node:assert/strict";
import { printAreasWithOnlyCurrentArtwork } from "../app/api/printify/product-payload.ts";

/* D884 · A second print side is a charge. One uploaded design with no back
   artwork assigned was being written into every populated placeholder the
   saved product carried, so a template with a back area printed front AND
   back and Printify billed both. Measured live: 18.54 a unit against 12.38
   for the same shirt with one print. */

const area = (positions) => ({
  variant_ids: [1, 2],
  placeholders: positions.map((position) => ({ position, images: [{ id: "template-img", x: .5, y: .5, scale: 1, angle: 0 }] })),
});
const positionsOf = (result) => result.flatMap((a) => a.placeholders.map((p) => p.position));

test("one design with no back artwork prints the front only", () => {
  const result = printAreasWithOnlyCurrentArtwork([area(["front", "back"])], "new-img");
  assert.deepEqual(positionsOf(result), ["front"],
    "the back is a second charge and was never asked for");
});

test("a back-only product still prints, or the garment ships blank", () => {
  const result = printAreasWithOnlyCurrentArtwork([area(["back"])], "new-img");
  assert.deepEqual(positionsOf(result), ["back"]);
});

test("every secondary print side requires an explicit paid assignment", () => {
  const result = printAreasWithOnlyCurrentArtwork([area(["front", "sleeve", "back"])], "new-img");
  assert.deepEqual(positionsOf(result), ["front"]);
});

test("inside-label placeholders stay excluded, and never count as a print side", () => {
  const result = printAreasWithOnlyCurrentArtwork([area(["neck", "back"])], "new-img");
  assert.deepEqual(positionsOf(result), ["back"],
    "a label is not a print side, so the back is still the only one here");
});

test("only the freshly uploaded image id leaves the builder", () => {
  const result = printAreasWithOnlyCurrentArtwork([area(["front", "back"])], "new-img");
  const ids = result.flatMap((a) => a.placeholders.flatMap((p) => p.images.map((i) => i.id)));
  assert.deepEqual([...new Set(ids)], ["new-img"]);
});
