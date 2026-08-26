import test from "node:test";
import assert from "node:assert/strict";
import { decodeCocoRle, fitQuadToMask, maskBoundingBox, quadMaskCoverage, quadStaysOnMask } from "../app/mockups/product-mask.ts";

// COCO counts are column-major. These fixtures use the uncompressed form after
// applying the same compact encoder the service uses.
function compressedRle(width, height, pixels) {
  const runs = [];
  let foreground = false, count = 0;
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
    const value = Boolean(pixels[y * width + x]);
    if (value === foreground) count++;
    else { runs.push(count); count = 1; foreground = value; }
  }
  runs.push(count);
  let counts = "";
  runs.forEach((raw, index) => {
    let value = index > 2 ? raw - runs[index - 2] : raw;
    let more = true;
    while (more) {
      let current = value & 0x1f;
      value >>= 5;
      more = (current & 0x10) ? value !== -1 : value !== 0;
      if (more) current |= 0x20;
      counts += String.fromCharCode(current + 48);
    }
  });
  return JSON.stringify({ size: [height, width], counts });
}

function rectangleMask(width, height, left, top, right, bottom) {
  const pixels = new Uint8Array(width * height);
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) pixels[y * width + x] = 1;
  return decodeCocoRle(compressedRle(width, height, pixels));
}

test("decodes SAM COCO RLE and derives its pixel silhouette bounds", () => {
  const mask = rectangleMask(20, 10, 4, 2, 16, 9);
  assert.ok(mask);
  assert.deepEqual(maskBoundingBox(mask), { left: .2, top: .2, right: .8, bottom: .9 });
});

test("rejects the D581-style quad that leaves the segmented product", () => {
  const mask = rectangleMask(100, 100, 20, 10, 62, 92);
  const bad = [[.208,.24],[.802,.24],[.802,.91],[.208,.91]];
  assert.equal(quadStaysOnMask(mask, bad), false);
  assert.ok(quadMaskCoverage(mask, bad) < .8);
});

test("shrinks a family fallback until every sampled cell is on the product", () => {
  const mask = rectangleMask(100, 100, 25, 10, 75, 90);
  const initial = [[.22,.2],[.78,.2],[.78,.65],[.22,.65]];
  const fitted = fitQuadToMask(mask, initial);
  assert.ok(fitted);
  assert.equal(quadStaysOnMask(mask, fitted), true);
});

test("refuses a fallback whose intended centre is not on the product", () => {
  const mask = rectangleMask(100, 100, 5, 5, 25, 25);
  assert.equal(fitQuadToMask(mask, [[.4,.4],[.8,.4],[.8,.8],[.4,.8]]), null);
});
