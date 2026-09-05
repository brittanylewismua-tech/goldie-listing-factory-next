/* D573 - the placement contract. Printify controls where the artwork goes and how
   big it is; the scene controls only which surface it lands on. These lock the
   behaviours that used to be a flat 42% centred guess. */
import assert from "node:assert/strict";
import { readPrintSide } from "../app/placement-math.ts";
import { sceneAcceptsSide, sceneNeedsOcclusion, placementAdjustment as adjust } from "../app/mockups/placement-contract.ts";

const scene = (printSide, extra = {}) => ({ printSide, ...extra });

// Printify's centre maps to the centre of the scene's printable quad.
{
  const a = adjust({ x: .5, y: .5, scale: .6, angle: 0 }, "t-shirt", "print-area");
  assert.equal(a.x, 0); assert.equal(a.y, 0); assert.equal(a.scale, .6);
}
// A small left-pocket print stays small and stays left.
{
  const a = adjust({ x: .28, y: .34, scale: .12, angle: 0 }, "t-shirt", "print-area");
  assert.ok(a.x < 0, "a left-of-centre print must stay left of centre");
  assert.ok(a.scale < .2, "a pocket print must stay small");
}
// An oversized centred print stays oversized and centred.
{
  const a = adjust({ x: .5, y: .5, scale: .98, angle: 0 }, "hoodie", "print-area");
  assert.equal(a.x, 0);
  assert.ok(a.scale > .9, "an oversized print must stay oversized");
}
// High chest and low chest stay distinct rather than collapsing to one position.
{
  const high = adjust({ x: .5, y: .2, scale: .4, angle: 0 }, "t-shirt", "print-area");
  const low = adjust({ x: .5, y: .7, scale: .4, angle: 0 }, "t-shirt", "print-area");
  assert.notEqual(high.y, low.y);
  assert.ok(high.y < low.y);
}
// Identical inputs produce an identical transform, every time.
{
  const once = adjust({ x: .31, y: .42, scale: .27, angle: 0 }, "hoodie", "print-area");
  const twice = adjust({ x: .31, y: .42, scale: .27, angle: 0 }, "hoodie", "print-area");
  assert.deepEqual(once, twice);
}
// A front draft must not be rendered onto a back scene, and the reverse.
{
  const back = { x: .5, y: .5, scale: .5, angle: 0, side: "back" };
  const front = { x: .5, y: .5, scale: .5, angle: 0, side: "front" };
  assert.equal(sceneAcceptsSide(scene("front"), back), false);
  assert.equal(sceneAcceptsSide(scene("back"), front), false);
  assert.equal(sceneAcceptsSide(scene("back"), back), true);
  assert.equal(sceneAcceptsSide(scene("front"), front), true);
}
// A back print needs a confirmed foreground mask before it can be trusted.
{
  const back = { x: .5, y: .5, scale: .5, angle: 0, side: "back" };
  assert.equal(sceneNeedsOcclusion(scene("back", { occlusionConfirmed: false }), back), true);
  assert.equal(sceneNeedsOcclusion(scene("back", { occlusionConfirmed: true }), back), false);
  assert.equal(sceneNeedsOcclusion(scene("front"), { ...back, side: "front" }), false);
}
// Printify's own position strings map to the side Goldie stores on a scene.
{
  assert.equal(readPrintSide("back"), "back");
  assert.equal(readPrintSide("front"), "front");
  assert.equal(readPrintSide("left_sleeve"), "left-sleeve");
  assert.equal(readPrintSide("right sleeve"), "right-sleeve");
}
// Missing or unresolvable placement refuses rather than substituting 42% centred.
{
  assert.equal(adjust(undefined, "t-shirt", "print-area"), null);
  assert.equal(adjust({ x: .5, y: .5, scale: 0, angle: 0 }, "t-shirt", "print-area"), null);
  assert.equal(adjust({ x: .5, y: .5, scale: .4, angle: 0 }, "t-shirt", "garment"), null,
    "an unconfirmed garment quad cannot carry Printify's scale and must refuse");
}
console.log("printify placement contract ok");

// D573 - legacy scenes are classified, not assumed. "Different from the
// placeholder" was never evidence that a quad could be trusted.
{
  const { sceneStatus, isPlaceholderQuad } = await import("../app/mockups/placement-contract.ts");
  const placeholder = [[.15,.12],[.85,.12],[.85,.88],[.15,.88]];
  const marked = [[.3,.2],[.7,.2],[.7,.6],[.3,.6]];
  assert.equal(isPlaceholderQuad(placeholder), true);
  assert.equal(isPlaceholderQuad(marked), false);
  assert.equal(sceneStatus({ corners: placeholder }), "needs-marking",
    "the placeholder box must never count as calibrated");
  assert.equal(sceneStatus({ corners: marked, quadMeans: "garment" }), "needs-review",
    "a quad from before the contract has no recorded meaning and must be checked");
  assert.equal(sceneStatus({ corners: marked, quadMeans: "print-area", printSide: "back" }), "needs-foreground",
    "a back view without a confirmed hood mask is not ready");
  assert.equal(sceneStatus({ corners: marked, quadMeans: "print-area", printSide: "back", occlusionConfirmed: true }), "ready");
  assert.equal(sceneStatus({ corners: marked, quadMeans: "print-area", printSide: "front" }), "ready");
}
console.log("scene classification ok");

// D591 - placement must be read from the product that HAS the design on it.
{
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8");
  /* The blank saved template has no images in its placeholders, so reading
     placement from it always yielded artworkPlacement(undefined, ...) - the
     no-information default of dead centre at full scale. Confirmed live: every
     render logged {x:.5,y:.5,scale:1} with no side. */
  assert.match(route, /let placedAreas = created\.print_areas \?\? \[\]/,
    "placement must start from the created product, not the template");
  assert.match(route, /const resolvedProduct=await completeCreatedProduct\(created, shop\.id, token\)/,
    "missing metadata is resolved by one bounded read of the created product");
  assert.match(route, /if\(resolvedProduct\.print_areas\?\.length\)placedAreas=resolvedProduct\.print_areas/,
    "hydrated placement must be used before considering the template fallback");
  /* D593 - and it is chosen by PRINT SIDE, not by scale. A real draft returned
     positions ["front","back","neck"] with imageCounts [1,0,2]; scale is
     relative to each placeholder's own area, so the neck label at scale 1.0 beat
     the chest print every time and its values were carried through as the
     listing's placement. */
  assert.match(route, /placeholder\.images\?\.length && !isLabelPosition\(placeholder\.position\)/,
    "a placeholder with no image, or a label, cannot be chosen");
  assert.match(route, /neck\|label\|collar\|inner\|tag/,
    "label positions must be excluded outright");
  assert.match(route, /if \(\/front\|chest\/\.test\(value\)\) return 0/,
    "the front print must outrank everything else");
  // The template may only ever be the last resort.
  const chooser = route.slice(route.indexOf("const areas = placedAreas"), route.indexOf("const dominantPlaceholder"));
  assert.match(chooser, /placedAreas[\s\S]*template\.print_areas/,
    "the created product must be preferred over the blank template");
}
console.log("draft placement source ok");
