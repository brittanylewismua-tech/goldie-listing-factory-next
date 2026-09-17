/*
  A CACHED MEASUREMENT MUST NOT OUTLIVE THE RULES THAT PRODUCED IT.

  Readability is measured once and stored with the design, so a member
  reopening a scan sees what was measured rather than "not verified". That
  cache is only honest while the rules have not changed.

  This product has already shipped a measurement it had to replace: contrast
  was taken across the whole image, so on sparse artwork both percentiles
  landed on the background and crisp black-on-white text measured 1.0:1 —
  members were told good designs were unreadable. Had the cache existed then,
  every design already scanned would have kept serving the wrong verdict long
  after the rule was fixed.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { measureQuality, QUALITY_RULE_VERSION, CONTRAST_HIGH, CONTRAST_FLOOR,
  TONAL_RANGE_MIN, SHARPNESS_MIN, MIN_INK_SHARE, THUMBNAIL_EDGE }
  from "../app/image-quality.ts";

const solid = (width, height, shade) => {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = rgba[i + 1] = rgba[i + 2] = shade; rgba[i + 3] = 255;
  }
  return { width, height, rgba };
};

test("every verdict is stamped with the rules that produced it", () => {
  const measured = measureQuality(solid(40, 40, 255));
  assert.equal(measured.ruleVersion, QUALITY_RULE_VERSION);
  /* Including the unmeasurable case, which is also a verdict. */
  const tiny = measureQuality({ width: 0, height: 0, rgba: new Uint8Array(0) });
  assert.equal(tiny.ruleVersion, QUALITY_RULE_VERSION);
  assert.equal(tiny.contrast, "unverified");
});

test("the scanner reuses a cached verdict only at the current version", () => {
  const route = readFileSync(new URL(
    "../app/api/design-scanner/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /cached\?\.ruleVersion === QUALITY_RULE_VERSION \? cached : undefined/,
    "a verdict from older rules must not be served");
  /* And a rejected cache falls through to measuring the pixels again. */
  assert.match(route, /if \(!measured && body\?\.imageDataUrl\)/);
});

test("the thresholds cannot move without the version moving", () => {
  /*
    The version is only a promise if somebody remembers to bump it. This
    fingerprints every threshold the verdicts depend on: change one and this
    test fails until the version and the fingerprint are both updated
    deliberately.
  */
  const fingerprint = JSON.stringify({
    CONTRAST_HIGH, CONTRAST_FLOOR, TONAL_RANGE_MIN, SHARPNESS_MIN,
    MIN_INK_SHARE, THUMBNAIL_EDGE,
  });
  assert.equal(fingerprint, JSON.stringify({
    CONTRAST_HIGH: 4.5, CONTRAST_FLOOR: 3, TONAL_RANGE_MIN: 0.25,
    SHARPNESS_MIN: 0.35, MIN_INK_SHARE: 0.005, THUMBNAIL_EDGE: 170,
  }), "a threshold changed: bump QUALITY_RULE_VERSION and update this fingerprint");
  assert.equal(QUALITY_RULE_VERSION, 3,
    "the version this fingerprint belongs to");
});
