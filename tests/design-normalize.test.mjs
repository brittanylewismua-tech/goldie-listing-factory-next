import test from "node:test";
import assert from "node:assert/strict";
import {
  placeOnCanvas, analysisLayout, imageTokens, looksLikeHeic, LIGHT_GROUND, DARK_GROUND,
} from "../app/design-normalize.ts";

test("a wide banner keeps its shape instead of being squared", () => {
  const placed = placeOnCanvas(4000, 1000);
  assert.equal(placed.drawWidth / placed.drawHeight, 4, "aspect ratio was not preserved");
  assert.equal(placed.drawWidth, 768);
  assert.ok(placed.offsetY > 0, "the canvas was not padded");
  assert.ok(placed.artworkShare < 0.3);
});

test("a tall design is padded left and right, not cropped", () => {
  const placed = placeOnCanvas(500, 2000);
  assert.equal(placed.drawHeight, 768);
  assert.ok(placed.offsetX > 0);
  assert.ok(placed.drawWidth <= 768 && placed.drawHeight <= 768, "the artwork ran off the canvas");
});

test("a small design is not enlarged", () => {
  const placed = placeOnCanvas(200, 150);
  assert.equal(placed.scale, 1);
  assert.equal(placed.drawWidth, 200);
});

test("transparent artwork is shown on both a light and a dark ground", () => {
  const layout = analysisLayout({ width: 1000, height: 1000, hasAlpha: true });
  assert.ok(layout.doubled);
  assert.deepEqual(layout.panels.map(panel => panel.ground), [LIGHT_GROUND, DARK_GROUND]);
  /* A white design on a white ground is the failure this exists to prevent,
     so neither ground may be pure white or pure black. */
  assert.notEqual(LIGHT_GROUND, "#ffffff");
  assert.notEqual(DARK_GROUND, "#000000");
});

test("opaque artwork is not doubled and does not cost double", () => {
  const layout = analysisLayout({ width: 1000, height: 1000, hasAlpha: false });
  assert.equal(layout.doubled, false);
  assert.equal(layout.panels.length, 1);
  assert.equal(imageTokens(layout.width, layout.height),
    imageTokens(analysisLayout({ width: 1000, height: 1000, hasAlpha: true }).width, 768));
});

test("the analysis image stays inside the assumed token cost", () => {
  /* The cost model assumes about 786 image tokens. If normalization ever
     produces a bigger canvas, the budget is wrong. */
  assert.ok(imageTokens(768, 768) <= 800, `768 square costs ${imageTokens(768, 768)} tokens`);
});

test("HEIC is recognised by its bytes, not its file name", () => {
  const heic = new Uint8Array(16);
  heic.set([0, 0, 0, 24], 0);
  heic.set([...Buffer.from("ftypheic")], 4);
  assert.ok(looksLikeHeic(heic));
  assert.equal(looksLikeHeic(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13])), false);
});
