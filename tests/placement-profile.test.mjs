/* Stage 1 of the editor: the placement model.

   These encode the rules that decide whether a seller's correction survives and
   whether a saved scene setup may be reused - the things that, done wrong, put a
   back print on a chest or silently discard someone's work. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLACEMENT_PROFILE_VERSION, placeArtworkOnSurface, pointInQuad, profileMatches,
  preferSellerPlacement, applyProfileToPlacement, fitWithinSurface, defaultTransform,
  renderingModeFor, toNormalized,
} from "../app/mockups/placement-profile.ts";

// A chest panel that is NOT axis-aligned, so bilinear mapping is actually tested.
const surface = [[.3, .25], [.7, .27], [.69, .6], [.31, .58]];
const profile = (over = {}) => ({
  version: PLACEMENT_PROFILE_VERSION, sceneId: "s1", productFamily: "apparel",
  printSide: "front", renderingMode: "fabric",
  transform: defaultTransform(surface, "fabric"),
  sourceWidth: 2000, sourceHeight: 2500, updatedAt: "now", origin: "automatic", ...over,
});

test("Printify's placement decides size and position within the surface", () => {
  const centred = placeArtworkOnSurface(surface, { x: .5, y: .5, scale: 1, angle: 0 });
  // Full scale centred should reproduce the surface itself.
  centred.forEach((point, index) => {
    assert.ok(Math.abs(point[0] - surface[index][0]) < 1e-9);
    assert.ok(Math.abs(point[1] - surface[index][1]) < 1e-9);
  });
});

test("a pocket print stays small and offset, an oversized print stays oversized", () => {
  const pocket = placeArtworkOnSurface(surface, { x: .28, y: .3, scale: .16, angle: 0 });
  const big = placeArtworkOnSurface(surface, { x: .5, y: .5, scale: .95, angle: 0 });
  const width = q => Math.max(...q.map(p => p[0])) - Math.min(...q.map(p => p[0]));
  const centre = q => q.reduce((a, p) => a + p[0], 0) / 4;
  assert.ok(width(pocket) < width(big) / 4, "a pocket print must stay small");
  assert.ok(centre(pocket) < centre(big), "and must stay left of a centred print");
  // It must also still land ON the surface, not beside it.
  const bounds = { l: Math.min(...surface.map(p => p[0])), r: Math.max(...surface.map(p => p[0])) };
  assert.ok(Math.min(...pocket.map(p => p[0])) >= bounds.l - 1e-9);
  assert.ok(Math.max(...pocket.map(p => p[0])) <= bounds.r + 1e-9);
});

test("high and low placements stay distinct", () => {
  const high = placeArtworkOnSurface(surface, { x: .5, y: .2, scale: .3, angle: 0 });
  const low = placeArtworkOnSurface(surface, { x: .5, y: .8, scale: .3, angle: 0 });
  assert.ok(Math.min(...high.map(p => p[1])) < Math.min(...low.map(p => p[1])));
});

test("a profile is not reused across an incompatible product or print side", () => {
  const saved = profile();
  assert.equal(profileMatches(saved, { sceneId: "s1", productName: "Gildan Tee", printSide: "front" }), true);
  assert.equal(profileMatches(saved, { sceneId: "s1", productName: "Gildan Tee", printSide: "back" }), false,
    "a front profile must never serve a back print");
  assert.equal(profileMatches(saved, { sceneId: "s1", productName: "Ceramic Mug", printSide: "front" }), false,
    "an apparel profile must never be applied to a mug");
  assert.equal(profileMatches(saved, { sceneId: "other", productName: "Gildan Tee", printSide: "front" }), false);
  assert.equal(profileMatches({ ...saved, blueprintId: 6 }, { sceneId: "s1", productName: "Gildan Tee", printSide: "front", blueprintId: 9 }), false);
});

test("a seller correction cannot be overwritten by background preparation", () => {
  const corrected = profile({ origin: "seller-adjusted" });
  const auto = profile({ origin: "automatic", updatedAt: "later" });
  assert.equal(preferSellerPlacement(corrected, auto), corrected, "automation must not replace a correction");
  // A seller may of course replace their own, and automation may fill an empty slot.
  assert.equal(preferSellerPlacement(corrected, profile({ origin: "seller-adjusted", updatedAt: "later" })).updatedAt, "later");
  assert.equal(preferSellerPlacement(null, auto), auto);
});

test("a second design reuses the saved scene setup at its own Printify size", () => {
  const saved = profile({ origin: "seller-adjusted" });
  const next = applyProfileToPlacement(saved, surface, { x: .3, y: .35, scale: .18, angle: 0 });
  assert.equal(next.blendMode, saved.transform.blendMode, "the seller's rendering settings carry over");
  assert.equal(next.fabricStrength, saved.transform.fabricStrength);
  const width = Math.max(...next.corners.map(p => p[0])) - Math.min(...next.corners.map(p => p[0]));
  const surfaceWidth = Math.max(...surface.map(p => p[0])) - Math.min(...surface.map(p => p[0]));
  assert.ok(width < surfaceWidth * .3, "but the NEW design's own size is used, not the old one's");
});

test("fit shrinks artwork inside the product area", () => {
  const oversized = [[.1, .1], [.95, .1], [.95, .9], [.1, .9]];
  const fitted = fitWithinSurface(oversized, surface);
  const b = q => ({ l: Math.min(...q.map(p => p[0])), r: Math.max(...q.map(p => p[0])), t: Math.min(...q.map(p => p[1])), bo: Math.max(...q.map(p => p[1])) });
  const f = b(fitted), s = b(surface);
  assert.ok(f.l >= s.l - 1e-6 && f.r <= s.r + 1e-6, "must fit horizontally");
  assert.ok(f.t >= s.t - 1e-6 && f.bo <= s.bo + 1e-6, "must fit vertically");
});

test("rendering mode follows the product, not a guess", () => {
  assert.equal(renderingModeFor("Gildan Tee"), "fabric");
  assert.equal(renderingModeFor("Ceramic Mug"), "cylindrical");
  assert.equal(renderingModeFor("Matte Poster"), "planar");
  assert.equal(renderingModeFor("Artisanal Whatsit"), "perspective", "an unknown product still gets an editable surface");
  assert.equal(renderingModeFor("Matte Poster", "cylindrical"), "cylindrical", "prepared geometry wins when it disagrees");
});

test("apparel does not use opacity as its fabric treatment", () => {
  const fabric = defaultTransform(surface, "fabric");
  assert.equal(fabric.opacity, 1, "ink must not be faded to fake fabric");
  assert.ok(fabric.fabricStrength > 0, "the garment's luminance is what shows through instead");
});

test("transforms are stored against the source photo, not the viewport", () => {
  // The same point on a small preview and a large one must normalize identically.
  const small = toNormalized({ x: 225, y: 300 }, { width: 900, height: 1200 });
  const large = toNormalized({ x: 1000, y: 1333.3333 }, { width: 4000, height: 5333.3333 });
  assert.ok(Math.abs(small[0] - large[0]) < 1e-4 && Math.abs(small[1] - large[1]) < 1e-4);
});

test("a point maps into a non-rectangular surface following its perspective", () => {
  // The surface's top edge slopes; the mapped centre must slope with it.
  const centre = pointInQuad(surface, .5, 0);
  assert.ok(Math.abs(centre[1] - .26) < 1e-6, "the top edge midpoint follows the slope");
});

/* What may be reused, and what may never be.

   The scene's geometry is a fact about the PHOTOGRAPH and improves every future
   listing. A listing's artwork override is a fact about ONE DESIGN. Reusing the
   second is the bug that puts a 75% centred print where an 18% pocket print
   belonged, and these tests exist to make that impossible. */
import {
  artworkQuadFor, transformFor, geometryMatches, preferSellerGeometry, NO_OVERRIDE,
} from "../app/mockups/placement-profile.ts";

const geometry = (over = {}) => ({
  version: PLACEMENT_PROFILE_VERSION, sceneId: "s1", productFamily: "apparel",
  printSide: "front", renderingMode: "fabric", surface,
  curvature: 0, fabricStrength: .65, blendMode: "multiply",
  sourceWidth: 2000, sourceHeight: 2500, updatedAt: "now", origin: "automatic", ...over,
});

const widthOf = q => Math.max(...q.map(p => p[0])) - Math.min(...q.map(p => p[0]));
const centreOf = q => q.reduce((a, p) => a + p[0], 0) / 4;

test("each design brings its own Printify size and offset to a shared scene", () => {
  const scene = geometry();
  const pocket = artworkQuadFor(scene, { x: .26, y: .3, scale: .18, angle: 0 });
  const full = artworkQuadFor(scene, { x: .5, y: .5, scale: .75, angle: 0 });
  assert.ok(widthOf(pocket) < widthOf(full) / 3, "18% must not become 75%");
  assert.ok(centreOf(pocket) < centreOf(full), "upper-left must not become centred");
});

test("a seller's correction to one design never travels to another design", () => {
  const scene = geometry();
  // The seller nudged THIS listing's design right and made it bigger.
  const override = { ...NO_OVERRIDE, offsetU: .18, scaleMultiplier: 1.5 };
  const corrected = artworkQuadFor(scene, { x: .3, y: .4, scale: .2, angle: 0 }, override);
  // A different design on the same scene, with no override of its own.
  const other = artworkQuadFor(scene, { x: .5, y: .5, scale: .75, angle: 0 }, null);
  const plain = artworkQuadFor(scene, { x: .5, y: .5, scale: .75, angle: 0 });
  assert.deepEqual(other, plain, "the other design must be untouched by the first one's override");
  assert.notDeepEqual(corrected, artworkQuadFor(scene, { x: .3, y: .4, scale: .2, angle: 0 }),
    "while the corrected listing keeps its correction");
});

test("scene geometry is what carries over, and it carries the material settings", () => {
  const scene = geometry({ origin: "seller-adjusted", fabricStrength: .8, blendMode: "overlay", curvature: 0 });
  const next = transformFor(scene, { x: .5, y: .5, scale: .4, angle: 0 });
  assert.equal(next.fabricStrength, .8, "the scene's material settings apply to every design on it");
  assert.equal(next.blendMode, "overlay");
  assert.equal(next.opacity, 1, "but no artwork adjustment is inherited");
  assert.equal(next.skewX, 0);
  assert.equal(next.rotation, 0);
});

test("Printify's own rotation is honoured, and a seller's rotation adds to it", () => {
  const scene = geometry();
  assert.equal(transformFor(scene, { x: .5, y: .5, scale: .4, angle: 12 }).rotation, 12);
  assert.equal(transformFor(scene, { x: .5, y: .5, scale: .4, angle: 12 }, { ...NO_OVERRIDE, rotation: 3 }).rotation, 15);
});

test("scene geometry is not reused across product family or print side", () => {
  const scene = geometry();
  assert.equal(geometryMatches(scene, { sceneId: "s1", productName: "Gildan Tee", printSide: "front" }), true);
  assert.equal(geometryMatches(scene, { sceneId: "s1", productName: "Gildan Tee", printSide: "back" }), false);
  assert.equal(geometryMatches(scene, { sceneId: "s1", productName: "Ceramic Mug", printSide: "front" }), false);
});

test("background preparation cannot overwrite an improved scene", () => {
  const improved = geometry({ origin: "seller-adjusted" });
  const auto = geometry({ origin: "automatic", updatedAt: "later" });
  assert.equal(preferSellerGeometry(improved, auto), improved);
  assert.equal(preferSellerGeometry(null, auto), auto, "but it may fill an empty slot");
});

test("an override is relative, so it survives a design of a different size", () => {
  const scene = geometry();
  const nudge = { ...NO_OVERRIDE, offsetU: .1 };
  const small = artworkQuadFor(scene, { x: .4, y: .5, scale: .15, angle: 0 }, nudge);
  const large = artworkQuadFor(scene, { x: .4, y: .5, scale: .8, angle: 0 }, nudge);
  // The same nudge moves both by the same fraction of the surface, and neither
  // inherits the other's size.
  assert.ok(widthOf(large) > widthOf(small) * 4);
  assert.ok(Math.abs((centreOf(small) - centreOf(large))) < 1e-6, "the offset applies equally, the size does not");
});
