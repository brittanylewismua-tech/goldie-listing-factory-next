import test from "node:test";
import assert from "node:assert/strict";
import { decodeCocoRle, fitQuadToMask, imageDimensions, maskBoundingBox, quadMaskCoverage, quadStaysOnMask } from "../app/mockups/product-mask.ts";

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

test("decodes Fal's bare RLE counts using the source image dimensions", () => {
  const encoded = JSON.parse(compressedRle(20, 10, new Uint8Array(200)));
  const mask = decodeCocoRle(encoded.counts, { width:20, height:10 });
  assert.ok(mask);
  assert.equal(mask.width, 20);
  assert.equal(mask.height, 10);
});

test("recovers Fal's internally resized mask from its run total and source aspect ratio", () => {
  const pixels = new Uint8Array(12*8);
  for(let y=1;y<7;y++)for(let x=2;x<10;x++)pixels[y*12+x]=1;
  const encoded = JSON.parse(compressedRle(12,8,pixels));
  const mask = decodeCocoRle(encoded.counts,{width:24,height:16});
  assert.ok(mask);
  assert.deepEqual({width:mask.width,height:mask.height},{width:12,height:8});
  assert.deepEqual(maskBoundingBox(mask),{left:2/12,top:1/8,right:10/12,bottom:7/8});
});

test("reads PNG, JPEG and WebP source dimensions without a native image library", () => {
  const png = new Uint8Array(24); png.set([0x89,0x50,0x4e,0x47],0); png.set([0,0,2,0],16); png.set([0,0,1,0],20);
  assert.deepEqual(imageDimensions(png,"image/png"),{width:512,height:256});
  const jpeg = new Uint8Array([0xff,0xd8,0xff,0xc0,0,16,8,1,44,2,88,3,1,0,2,17,1,3,17,1]);
  assert.deepEqual(imageDimensions(jpeg,"image/jpeg"),{width:600,height:300});
  const webp = new Uint8Array(30); webp.set([..."RIFF"].map(x=>x.charCodeAt(0)),0); webp.set([..."WEBPVP8X"].map(x=>x.charCodeAt(0)),8); webp.set([0xff,1,0,0xff,0,0],24);
  assert.deepEqual(imageDimensions(webp,"image/webp"),{width:512,height:256});
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
