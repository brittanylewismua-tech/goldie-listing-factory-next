/* D594 - a neck label is not the listing's artwork.

   Confirmed on a real draft before this fix: the Printify preview showed the
   seller's design a second time, small, at the collar, and the created product
   came back with positions ["front","back","neck"] and imageCounts [1,0,2].

   D613 - these tests originally asserted that the template's own label ID
   survived into the payload "untouched". That WAS the defect: a template image ID
   is not valid in a different product request, and sending it made Printify
   reject every draft with 400 / 8253 for six hours. The label's artwork is still
   preserved; its identifier is now a fresh upload made for this request. */
const label = new Map([["brand-label", "fresh-label"]]);
import { test } from "node:test";
import assert from "node:assert/strict";
import { printAreasWithOnlyCurrentArtwork, isLabelPlaceholder } from "../app/api/printify/product-payload.ts";

const areas = () => ([{
  variant_ids: [1, 2],
  placeholders: [
    { position: "front", images: [{ id: "old-front", x: .5, y: .45, scale: .9, angle: 0 }] },
    { position: "back", images: [{ id: "old-back", x: .5, y: .5, scale: .8, angle: 0 }] },
    { position: "neck", images: [{ id: "brand-label", x: .5, y: .1, scale: 1, angle: 0 }] },
  ],
}]);

test("label positions are recognised", () => {
  for (const label of ["neck", "Neck Label", "inner_neck", "collar", "brand tag"])
    assert.equal(isLabelPlaceholder(label), true, `${label} is a label`);
  for (const side of ["front", "back", "left_sleeve", "chest"])
    assert.equal(isLabelPlaceholder(side), false, `${side} is a print side`);
});

test("the design goes on the print sides and never on the label", () => {
  const result = printAreasWithOnlyCurrentArtwork(areas(), "new-design", undefined, undefined, label);
  const byPosition = Object.fromEntries(
    result[0].placeholders.map((p) => [p.position, p.images.map((i) => i.id)]));
  assert.deepEqual(byPosition.front, ["new-design"]);
  assert.deepEqual(byPosition.back, ["new-design"]);
  assert.deepEqual(byPosition.neck, ["fresh-label"],
    "the label's artwork survives, carried by an ID uploaded for THIS request");
});

test("the label keeps its original placement, not the design's", () => {
  const result = printAreasWithOnlyCurrentArtwork(areas(), "new-design", undefined, undefined, label);
  const neck = result[0].placeholders.find((p) => p.position === "neck");
  assert.equal(neck.images[0].y, .1, "the label's own position is preserved");
  assert.equal(neck.images[0].scale, 1);
});

test("an inherited image id on a print side is still blocked", () => {
  // The original guard's job: a previous design's id must never ship as the
  // artwork. Narrowing it to print sides must not weaken that.
  const leaky = areas();
  leaky[0].placeholders.push({ position: "front", images: [{ id: "stale-id", x: .5, y: .5, scale: 1, angle: 0 }] });
  const patched = printAreasWithOnlyCurrentArtwork(leaky, "new-design", undefined, undefined, label);
  const ids = new Set(patched[0].placeholders.filter((p) => !isLabelPlaceholder(p.position))
    .flatMap((p) => p.images.map((i) => i.id)));
  assert.deepEqual([...ids], ["new-design"], "every print side carries only the current design");
});

test("printing the design onto a label is refused outright", () => {
  const sneaky = [{
    variant_ids: [1],
    placeholders: [
      { position: "front", images: [{ id: "new-design", x: .5, y: .5, scale: 1, angle: 0 }] },
      { position: "neck", images: [{ id: "new-design", x: .5, y: .1, scale: 1, angle: 0 }] },
    ],
  }];
  /* D613 - with the label now carrying a re-uploaded ID, the way the design can
     still reach a label is a mapping that points at it. That is the case to
     refuse. A label with no mapping at all is refused separately, and just as
     hard, by the re-upload requirement. */
  assert.throws(() => printAreasWithOnlyCurrentArtwork(sneaky, "new-design", undefined, undefined,
    new Map([["new-design", "new-design"]])),
    /print the design on a label|inherited template image ID/);
  assert.throws(() => printAreasWithOnlyCurrentArtwork(sneaky, "new-design"),
    /could not re-upload the neck label artwork/);
});

test("a product with no label is unaffected", () => {
  const plain = [{ variant_ids: [1], placeholders: [{ position: "front", images: [{ id: "old", x: .5, y: .5, scale: 1, angle: 0 }] }] }];
  const result = printAreasWithOnlyCurrentArtwork(plain, "new-design");
  assert.deepEqual(result[0].placeholders[0].images.map((i) => i.id), ["new-design"]);
});
