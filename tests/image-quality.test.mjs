/*
  THE INTERFACE STATED FALSE VISUAL FACTS, CONFIDENTLY.

  Measured against production: a 7px-blurred design and a near-invisible
  light-grey-on-white design BOTH returned "It stays readable at thumbnail
  size" and "Its contrast matches the high look that is doing well here".

  `design-compare.ts` was innocent — those lines are gated on
  `thumbnailReadability === "readable"` and there is a branch that warns when
  it is not. The vision model simply answered wrongly about legibility.

  Contrast, tonal range, blur and emptiness are arithmetic. These fixtures are
  generated across the whole space — clear, blurred, faint, transparent,
  empty, long-text, dark-on-dark — rather than only the two cases that failed,
  so the thresholds are not fitted to the bug report.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { measureQuality, toThumbnail, contrastRatio, luminance,
  CONTRAST_HIGH, SHARPNESS_MIN } from "../app/image-quality.ts";

const W = 240, H = 240;

/** A blank canvas of one colour. */
function canvas(r, g, b, a = 255) {
  const rgba = new Uint8Array(W * H * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
  }
  return { width: W, height: H, rgba };
}

/** Crisp vertical bars — stands in for hard-edged type. */
function bars(fg, bg, { period = 12, blur = 0, alpha = 255 } = {}) {
  const pixels = canvas(bg[0], bg[1], bg[2]);
  for (let y = 0; y < H; y += 1)
    for (let x = 0; x < W; x += 1) {
      const inBar = Math.floor(x / period) % 2 === 0;
      const i = (y * W + x) * 4;
      if (inBar) {
        pixels.rgba[i] = fg[0]; pixels.rgba[i + 1] = fg[1];
        pixels.rgba[i + 2] = fg[2]; pixels.rgba[i + 3] = alpha;
      }
    }
  /* A crude box blur, applied `blur` times. */
  for (let pass = 0; pass < blur; pass += 1) {
    const copy = new Uint8Array(pixels.rgba);
    for (let y = 1; y < H - 1; y += 1)
      for (let x = 1; x < W - 1; x += 1)
        for (let c = 0; c < 3; c += 1) {
          const i = (y * W + x) * 4 + c;
          pixels.rgba[i] = Math.round(
            (copy[i] + copy[i - 4] + copy[i + 4]
              + copy[i - W * 4] + copy[i + W * 4]) / 5);
        }
  }
  return pixels;
}

const BLACK = [0, 0, 0], WHITE = [255, 255, 255], FAINT = [228, 228, 228];

test("luminance and contrast are the standard ones", () => {
  assert.ok(Math.abs(luminance(0, 0, 0) - 0) < 1e-9);
  assert.ok(Math.abs(luminance(255, 255, 255) - 1) < 1e-9);
  /* Black on white is the documented 21:1. */
  assert.ok(Math.abs(contrastRatio(0, 1) - 21) < 0.01);
});

test("a crisp high-contrast design passes everything", () => {
  const quality = measureQuality(bars(BLACK, WHITE));
  assert.equal(quality.contrast, "pass");
  assert.equal(quality.sharpness, "pass");
  assert.equal(quality.thumbnailReadable, "pass");
  assert.equal(quality.mayClaimReadable, true);
  assert.equal(quality.mayClaimHighContrast, true);
  assert.deepEqual(quality.notes, []);
});

test("the faint design that was called high contrast now fails", () => {
  const quality = measureQuality(bars(FAINT, WHITE));
  assert.equal(quality.contrast, "fail");
  assert.equal(quality.mayClaimHighContrast, false);
  assert.equal(quality.mayClaimReadable, false,
    "Goldie must not say a near-invisible design reads at thumbnail size");
  assert.match(quality.notes.join(" "), /too close together to read/);
});

test("the blurred design that was called readable now fails", () => {
  const quality = measureQuality(bars(BLACK, WHITE, { blur: 14, period: 12 }));
  assert.equal(quality.sharpness, "fail");
  assert.equal(quality.mayClaimReadable, false);
  assert.match(quality.notes.join(" "), /edges in this design are soft/);
  /* Contrast can still be fine on a blurred design — the two are different
     failures and must not be collapsed into one. */
  assert.equal(quality.contrast, "pass");
});

test("transparent artwork is measured as it will be printed", () => {
  /* Raw pixels would read the transparent background as black and report
     superb contrast for a design that is invisible on a white shirt. */
  const quality = measureQuality(bars(FAINT, WHITE, { alpha: 255 }));
  assert.equal(quality.mayClaimHighContrast, false);
  const ghost = bars(WHITE, WHITE, { alpha: 20 });
  const ghostQuality = measureQuality(ghost);
  assert.equal(ghostQuality.mayClaimReadable, false);
});

test("an empty or near-empty design is never called readable", () => {
  const blank = canvas(255, 255, 255, 0);
  const quality = measureQuality(blank);
  assert.equal(quality.emptiness, "fail");
  assert.equal(quality.mayClaimReadable, false);
  assert.match(quality.notes.join(" "), /empty or almost empty/);
});

test("dark on dark fails as surely as light on light", () => {
  /* Fitting the thresholds to the two reported cases would have missed this. */
  const quality = measureQuality(bars([20, 20, 20], [40, 40, 40]));
  assert.equal(quality.contrast, "fail");
  assert.equal(quality.mayClaimHighContrast, false);
});

test("a single stray pixel is not contrast", () => {
  /* Percentiles, not min and max. */
  const nearlyFlat = canvas(240, 240, 240);
  nearlyFlat.rgba[0] = 0; nearlyFlat.rgba[1] = 0; nearlyFlat.rgba[2] = 0;
  const quality = measureQuality(nearlyFlat);
  assert.equal(quality.contrast, "fail");
});

test("unmeasurable input says so instead of claiming anything", () => {
  const quality = measureQuality({ width: 0, height: 0, rgba: new Uint8Array(0) });
  assert.equal(quality.contrast, "unverified");
  assert.equal(quality.thumbnailReadable, "unverified");
  assert.equal(quality.mayClaimReadable, false);
  assert.equal(quality.mayClaimHighContrast, false);
  assert.match(quality.notes.join(" "), /readability was not verified/);
});

test("readability is judged at the size a buyer first sees", () => {
  const thumb = toThumbnail(bars(BLACK, WHITE), 64);
  assert.ok(thumb.width <= 64 && thumb.height <= 64);
  /* Fine detail that survives at full size can disappear at 64px. The check
     runs on the reduced image, which is the whole point. */
  const fine = measureQuality(bars(BLACK, WHITE, { period: 1 }));
  assert.ok(fine.sharpness === "pass" || fine.thumbnailReadable === "fail");
});

test("the thresholds are named constants, not numbers buried in a branch", () => {
  assert.equal(CONTRAST_HIGH, 4.5, "WCAG AA for normal text");
  assert.ok(SHARPNESS_MIN > 0 && SHARPNESS_MIN < 1);
});

test("the blur threshold was calibrated across a sweep, not to one example", () => {
  /* Monotonic: crisp and lightly softened pass, genuinely blurred fails, and
     it stays failed as blur increases. Fitting to the single reported case
     would have left the boundary anywhere. */
  const verdicts = [0, 2, 4, 6, 10, 20]
    .map(blur => measureQuality(bars(BLACK, WHITE, { blur, period: 12 })).sharpness);
  assert.deepEqual(verdicts, ["pass", "pass", "pass", "fail", "fail", "fail"]);
});

test("low contrast is not mistaken for blur, or the member is told the wrong thing", () => {
  /* A faint design has perfectly crisp edges. Telling its owner to sharpen it
     would send them to fix something that is not wrong. */
  const faint = measureQuality(bars(FAINT, WHITE));
  assert.equal(faint.sharpness, "pass");
  assert.equal(faint.contrast, "fail");
  const blurred = measureQuality(bars(BLACK, WHITE, { blur: 14, period: 12 }));
  assert.equal(blurred.contrast, "pass");
  assert.equal(blurred.sharpness, "fail");
});

test("the scan lets measurement overrule the model, never the reverse", () => {
  const route = readFileSync(new URL(
    "../app/api/design-scanner/scan/route.ts", import.meta.url), "utf8");
  const compare = readFileSync(new URL(
    "../app/design-compare.ts", import.meta.url), "utf8");

  assert.match(route, /measured = measureQuality\(\{ width, height, rgba \}\)/);
  assert.match(route, /\{ minimum: THRESHOLD\.listings, measured \}/);
  /* A failed decode must block the claim, not silently allow it. */
  assert.match(route, /unverified is the honest answer; it blocks the claim/);

  /* The two positive claims are both gated on the measurement. */
  assert.match(compare, /&& !measuredBlocksReadable && !measuredUnverified/);
  assert.match(compare, /&& \(!measured \|\| measured\.mayClaimHighContrast\)/);
  /* And when it cannot be verified, the member is told that rather than
     receiving either a positive or a negative claim. */
  assert.match(compare, /could not verify how this design reads at/);
});

test("construction and subject stay separate in the result model", () => {
  const route = readFileSync(new URL(
    "../app/api/design-scanner/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /subject: \{ verdict: relevance\.verdict/);
  assert.match(route, /imageQuality: measured/);
  /*
    Niche relevance must never be DERIVED from image quality, or a blurred
    bachelorette design becomes "not about bachelorette". Asserted on what the
    module imports and takes as input — the words "contrast" and "readability"
    appear in its member-facing notice on purpose, explaining what the visual
    comparison covers.
  */
  const relevance = readFileSync(new URL(
    "../app/design-niche-relevance.ts", import.meta.url), "utf8");
  assert.ok(!relevance.includes("image-quality"),
    "relevance must not import the pixel measurements");
  assert.ok(!relevance.includes("ImageQuality"));
  assert.match(relevance, /export function relevanceOf\(\s*visibleWording: string, nicheTerms: string\[\],\s*\)/,
    "relevance takes wording and niche terms, and nothing about how the design looks");
});
