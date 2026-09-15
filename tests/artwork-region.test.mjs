/*
  THE PRINT REGION IS THE CLAIM.

  The failed baseline scored every pair inside a band 0.079 wide because most
  of a mockup is garment. These tests hold the new method to the thing that
  band proved it needed: the same design on two different blanks must score
  above two different designs on the same blank.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { printRegion, compareRegions, resample } from "../app/artwork-region.ts";

/* A picture builder: a ground colour with shapes stamped on it. */
const picture = (width, height, ground, shapes = []) => {
  const rgb = new Uint8Array(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    rgb[index * 3] = ground[0]; rgb[index * 3 + 1] = ground[1]; rgb[index * 3 + 2] = ground[2];
  }
  for (const shape of shapes)
    for (let y = shape.top; y < shape.bottom; y += 1)
      for (let x = shape.left; x < shape.right; x += 1) {
        const at = (y * width + x) * 3;
        rgb[at] = shape.colour[0]; rgb[at + 1] = shape.colour[1]; rgb[at + 2] = shape.colour[2];
      }
  return { width, height, rgb };
};

const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];
const NAVY = [20, 30, 70];

test("the printed area is found, not the whole frame", () => {
  const mockup = picture(100, 100, NAVY, [{ left: 40, top: 30, right: 60, bottom: 50, colour: WHITE }]);
  const region = printRegion(mockup);
  assert.ok(region.found);
  assert.ok(region.box.left > 0.3 && region.box.right < 0.7, `left ${region.box.left} right ${region.box.right}`);
  assert.ok(region.coverage < 0.1, `coverage ${region.coverage}`);
});

test("a print file on white and the same design on a garment agree", () => {
  /* The same mark, at different sizes, on different grounds — which is
     exactly the relationship between a print file and its mockup. */
  const design = [
    { left: 10, top: 10, right: 40, bottom: 20 },
    { left: 10, top: 30, right: 20, bottom: 60 },
  ];
  const printFile = picture(80, 80, WHITE,
    design.map(box => ({ ...box, colour: BLACK })));
  const onGarment = picture(200, 200, NAVY, design.map(box => ({
    left: 60 + box.left, top: 60 + box.top, right: 60 + box.right, bottom: 60 + box.bottom,
    colour: WHITE,
  })));

  const other = picture(200, 200, NAVY, [
    { left: 70, top: 70, right: 130, bottom: 130, colour: WHITE },
  ]);

  const same = compareRegions(printRegion(printFile), printRegion(onGarment));
  const different = compareRegions(printRegion(printFile), printRegion(other));
  assert.ok(same.score > different.score,
    `same ${same.score.toFixed(3)} did not beat different ${different.score.toFixed(3)}`);
  /* And by a margin the failed baseline never produced. */
  assert.ok(same.score - different.score > 0.079,
    `spread ${(same.score - different.score).toFixed(3)} is no better than the 0.079 baseline`);
});

test("two different designs on the same blank do not look alike", () => {
  const blankA = picture(200, 200, NAVY, [{ left: 80, top: 60, right: 120, bottom: 140, colour: WHITE }]);
  const blankB = picture(200, 200, NAVY, [{ left: 60, top: 90, right: 140, bottom: 110, colour: WHITE }]);
  const comparison = compareRegions(printRegion(blankA), printRegion(blankB));
  /* A tall bar and a wide bar on the same shirt: the garment is identical, so
     any score near one would mean the garment is being measured. */
  assert.ok(comparison.score < 0.75, `score ${comparison.score.toFixed(3)} is too generous`);
});

test("a picture with no plain ground says it found nothing", () => {
  const noise = { width: 60, height: 60, rgb: new Uint8Array(60 * 60 * 3) };
  for (let index = 0; index < 60 * 60; index += 1) {
    noise.rgb[index * 3] = (index * 37) % 256;
    noise.rgb[index * 3 + 1] = (index * 91) % 256;
    noise.rgb[index * 3 + 2] = (index * 13) % 256;
  }
  const region = printRegion(noise);
  /* Whatever it decides, it must not claim a small confident box. */
  assert.ok(!region.found || region.coverage > 0.5, `coverage ${region.coverage}`);
});

test("an empty region agrees with nothing rather than agreeing perfectly", () => {
  const blank = picture(60, 60, WHITE);
  const comparison = compareRegions(printRegion(blank), printRegion(picture(60, 60, WHITE)));
  assert.ok(comparison.parts.inkShape === 0,
    `two blank pictures claimed ${comparison.parts.inkShape} ink agreement`);
});

test("resampling a box reads from inside that box", () => {
  const source = picture(40, 40, WHITE, [{ left: 20, top: 0, right: 40, bottom: 40, colour: BLACK }]);
  const grid = resample(source, { left: 20, top: 0, right: 40, bottom: 40 }, 4);
  assert.deepEqual([...grid.rgb.slice(0, 3)], BLACK);
});

test("the benchmark keeps the failed baseline instead of replacing it", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/benchmark-printify/route.ts", import.meta.url), "utf8");
  assert.match(route, /FAILED_BASELINE/);
  assert.match(route, /0\.079/);
  assert.match(route, /spread: 0\.079/);
  /* Pairs must come from product identity, never from a visual guess. */
  assert.match(route, /mockup\.productId === design\.productId/);
});

test("the benchmark writes nothing and reads only the caller", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/benchmark-printify/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /INSERT|UPDATE |DELETE /);
  for (const statement of route.match(/FROM artwork_provenance[\s\S]*?`/g) ?? [])
    assert.match(statement, /user_id = \?/, "a query reached artwork_provenance unscoped");
});
