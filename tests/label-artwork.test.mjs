/* D614 - internal label placeholders are excluded from new products.

   The history matters, because two fixes were built on a misreading.

   D594 saw a small copy of the design at the collar and concluded the seller had
   deliberate neck-label branding worth preserving. That was backwards: the design
   was at the collar because the code wrote it into every populated placeholder.
   The collar copy was the bug's symptom, not the seller's artwork.

   To "preserve" it, D594 carried the template product's own image IDs into new
   product requests. Printify rejected those with 400 / 8253, "Provided images do
   not exist", and every draft failed for six hours. D613 then tried to re-upload
   that artwork, inventing a further requirement and breaking the flow again.

   Goldie prints on the print side the seller chose. Nothing else. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { printAreasWithOnlyCurrentArtwork, isLabelPlaceholder, templateHasLabelArtwork } from "../app/api/printify/product-payload.ts";

const areas = () => ([{
  variant_ids: [1, 2],
  placeholders: [
    { position: "front", images: [{ id: "old-front", x: .5, y: .45, scale: .9, angle: 0 }] },
    /* D884 - a sleeve, not a back. A back print is never assumed now, and this
       file tests labels and inherited ids, not which print sides exist. */
    { position: "left_sleeve", images: [{ id: "old-back", x: .5, y: .5, scale: .8, angle: 0 }] },
    { position: "neck", images: [{ id: "internal-label", x: .5, y: .1, scale: 1, angle: 0 }] },
  ],
}]);

test("label positions are recognised", () => {
  for (const label of ["neck", "Neck Label", "inner_neck", "collar", "brand tag"])
    assert.equal(isLabelPlaceholder(label), true, `${label} is a label`);
  for (const side of ["front", "back", "left_sleeve", "chest"])
    assert.equal(isLabelPlaceholder(side), false, `${side} is a print side`);
});

test("no label placeholder reaches product creation", () => {
  const result = printAreasWithOnlyCurrentArtwork(areas(), "new-design");
  const positions = result.flatMap((area) => area.placeholders.map((p) => p.position));
  assert.deepEqual(positions, ["front"]);
  assert.ok(!positions.some(isLabelPlaceholder), "no neck, collar, inner or tag placeholder goes out");
});

test("no inherited image ID reaches Printify", () => {
  // This is the exact failure: a template ID is not valid in another product.
  const result = printAreasWithOnlyCurrentArtwork(areas(), "new-design");
  const ids = result.flatMap((area) => area.placeholders.flatMap((p) => p.images.map((i) => i.id)));
  assert.deepEqual([...new Set(ids)], ["new-design"]);
  for (const stale of ["old-front", "old-back", "internal-label"])
    assert.ok(!ids.includes(stale), `${stale} must never leave`);
});

test("the main artwork stays on the intended print sides", () => {
  const result = printAreasWithOnlyCurrentArtwork(areas(), "new-design");
  const front = result[0].placeholders.find((p) => p.position === "front");
  assert.equal(front.images[0].id, "new-design");
  assert.equal(front.images.length, 1);
});

test("a product with a label still creates normally", () => {
  // Excluding the label must not empty the payload or drop the area.
  const result = printAreasWithOnlyCurrentArtwork(areas(), "new-design");
  assert.equal(result.length, 1, "the print area survives");
  assert.equal(result[0].variant_ids.length, 2, "its variants are intact");
  assert.equal(result[0].placeholders.length, 1);
});

test("a product whose only placeholder is a label produces no empty area", () => {
  const labelOnly = [{ variant_ids: [1], placeholders: [{ position: "neck", images: [{ id: "internal-label" }] }] }];
  assert.deepEqual(printAreasWithOnlyCurrentArtwork(labelOnly, "new-design"), []);
});

test("the notice fires only when the saved product has label artwork", () => {
  assert.equal(templateHasLabelArtwork(areas()), true);
  const plain = [{ variant_ids: [1], placeholders: [{ position: "front", images: [{ id: "old" }] }] }];
  assert.equal(templateHasLabelArtwork(plain), false, "no notice when there is nothing to leave behind");
  const emptyLabel = [{ variant_ids: [1], placeholders: [{ position: "neck", images: [] }] }];
  assert.equal(templateHasLabelArtwork(emptyLabel), false, "an empty label placeholder is not artwork");
  assert.equal(templateHasLabelArtwork(undefined), false);
});

test("a product with no label is unaffected", () => {
  const plain = [{ variant_ids: [1], placeholders: [{ position: "front", images: [{ id: "old", x: .5, y: .5, scale: 1, angle: 0 }] }] }];
  const result = printAreasWithOnlyCurrentArtwork(plain, "new-design");
  assert.deepEqual(result[0].placeholders[0].images.map((i) => i.id), ["new-design"]);
});

test("D613's label re-upload is gone, and no new retry system replaced it", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8");
  assert.ok(!/labelImageIds|label_reupload|labelSources/.test(route), "the re-upload machinery is removed");
  assert.ok(!/file_name: `label-/.test(route), "no label upload call remains");
});

test("inside-label implementation detail does not clutter the draft confirmation", async () => {
  const { readFile } = await import("node:fs/promises");
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /Inside-label artwork is not copied to new products\./);
  assert.doesNotMatch(app, /preflight-note/);
});
