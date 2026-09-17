/**
 * MEASURE WHAT CAN BE MEASURED. ASK A MODEL ONLY WHAT CANNOT.
 *
 * Design Scanner told a member that a 7px-blurred design "stays readable at
 * thumbnail size" and that a near-invisible light-grey-on-white design had
 * "contrast [that] matches the high look that is doing well here". Both
 * statements were confident, both were false, and both were about artwork the
 * member cannot sell.
 *
 * The comparison logic was not at fault: those lines are gated on
 * `thumbnailReadability === "readable"`, and there is a branch that warns when
 * it is not. What failed was the INPUT — a vision model asked to judge
 * legibility and contrast, which it answered wrongly.
 *
 * Contrast, tonal range, blur and emptiness are arithmetic on pixels. They do
 * not need judgement and they should never have been a model's opinion. The
 * model still describes CONSTRUCTION — mechanism, composition, illustration
 * style — which genuinely is interpretation. It no longer gets a vote on
 * whether something is readable.
 *
 * WHEN THE TWO DISAGREE, NEITHER WINS. A measured failure blocks the positive
 * claim; it does not replace it with a confident negative unless the
 * measurement is itself reliable. Where the artwork cannot be measured, the
 * honest answer is that readability was not verified.
 */

export type Pixels = { width: number; height: number; rgba: Uint8Array };

export type QualityVerdict = "pass" | "fail" | "unverified";

export type ImageQuality = {
  contrast: QualityVerdict;
  tonalRange: QualityVerdict;
  sharpness: QualityVerdict;
  thumbnailReadable: QualityVerdict;
  emptiness: QualityVerdict;
  /* One sentence per measurement, in the member's terms. */
  notes: string[];
  /* What Goldie is permitted to claim after measuring. */
  mayClaimReadable: boolean;
  mayClaimHighContrast: boolean;
};

/* Perceived lightness, 0..1. */
export function luminance(r: number, g: number, b: number) {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/* WCAG contrast ratio between two luminances, 1..21. */
export const contrastRatio = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/*
  THRESHOLDS, AND WHY THESE NUMBERS.

  4.5:1 is the WCAG AA ratio for body text — the point below which normal
  weight text stops being comfortably legible for most people. A print design
  is not a web page, but a listing thumbnail is viewed small and fast, which is
  the same problem. 3:1 is AA for large text and is the floor below which a
  design is not merely low contrast but effectively invisible.
*/
export const CONTRAST_HIGH = 4.5;
export const CONTRAST_FLOOR = 3;
/* Below this share of the tonal scale the artwork is flat: no real darks or
   no real lights, whatever the peak ratio between two sampled pixels says. */
export const TONAL_RANGE_MIN = 0.25;
/* The peak luminance step across an edge, as a share of the design's own
   tonal range. A crisp edge moves most of the range in one pixel; a blurred
   one spreads it over many and this collapses. Calibrated across a blur sweep
   rather than against a single reported example. */
export const SHARPNESS_MIN = 0.35;
/* An artwork whose ink covers less than this is empty or nearly so. */
export const MIN_INK_SHARE = 0.005;
/* The size a listing is actually first seen at. */
export const THUMBNAIL_EDGE = 64;

const at = (pixels: Pixels, x: number, y: number) => {
  const index = (y * pixels.width + x) * 4;
  return {
    r: pixels.rgba[index], g: pixels.rgba[index + 1],
    b: pixels.rgba[index + 2], a: pixels.rgba[index + 3],
  };
};

/**
 * Downscale by AREA AVERAGE, the way a browser actually does it.
 *
 * A first version sampled one source pixel per destination pixel. On a blurred
 * design that picks out individual pixels and reconstructs hard edges between
 * them, so a thoroughly blurred image measured as SHARP — the very failure
 * this module exists to catch, reintroduced by the resampler.
 */
export function toThumbnail(pixels: Pixels, edge = THUMBNAIL_EDGE): Pixels {
  const width = Math.max(1, Math.min(edge, pixels.width));
  const height = Math.max(1, Math.min(edge, pixels.height));
  const rgba = new Uint8Array(width * height * 4);
  const spanX = pixels.width / width;
  const spanY = pixels.height / height;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const fromX = Math.floor(x * spanX), toX = Math.max(fromX + 1, Math.floor((x + 1) * spanX));
      const fromY = Math.floor(y * spanY), toY = Math.max(fromY + 1, Math.floor((y + 1) * spanY));
      for (let sy = fromY; sy < Math.min(toY, pixels.height); sy += 1)
        for (let sx = fromX; sx < Math.min(toX, pixels.width); sx += 1) {
          const source = at(pixels, sx, sy);
          r += source.r; g += source.g; b += source.b; a += source.a; n += 1;
        }
      const index = (y * width + x) * 4;
      rgba[index] = Math.round(r / n); rgba[index + 1] = Math.round(g / n);
      rgba[index + 2] = Math.round(b / n); rgba[index + 3] = Math.round(a / n);
    }
  return { width, height, rgba };
}

/**
 * Composite onto white before measuring.
 *
 * A transparent PNG's background is whatever it is printed on. Measuring the
 * raw pixels would read transparent areas as black and report magnificent
 * contrast for a design that is, on a white shirt, nearly invisible.
 */
function flatten(pixels: Pixels) {
  const out: number[] = [];
  let inked = 0;
  for (let index = 0; index < pixels.rgba.length; index += 4) {
    const alpha = pixels.rgba[index + 3] / 255;
    if (alpha > 0.05) inked += 1;
    const over = (value: number) => value * alpha + 255 * (1 - alpha);
    out.push(luminance(over(pixels.rgba[index]), over(pixels.rgba[index + 1]),
      over(pixels.rgba[index + 2])));
  }
  return { luminances: out, inkShare: inked / Math.max(1, pixels.rgba.length / 4) };
}

/**
 * How ABRUPT this design's edges are, not how many it has.
 *
 * A first version averaged every neighbour difference. That measures edge
 * DENSITY: a design of narrow stripes keeps a high mean even when every stripe
 * has been blurred into a gradient, so a thoroughly blurred image measured as
 * sharp. Blur does not remove the total change across an edge — it spreads it
 * over more pixels — so the thing that actually falls is the PEAK step.
 *
 * Taken at the 95th percentile so a little noise cannot stand in for an edge,
 * and divided by the design's own tonal range so a low-contrast design is not
 * also accused of being blurred. The two are separate failures.
 */
function sharpness(pixels: Pixels, luminances: number[], range: number) {
  const steps: number[] = [];
  for (let y = 0; y < pixels.height; y += 1)
    for (let x = 1; x < pixels.width; x += 1) {
      const index = y * pixels.width + x;
      steps.push(Math.abs(luminances[index] - luminances[index - 1]));
    }
  if (!steps.length || range <= 0) return 0;
  steps.sort((a, b) => a - b);
  const peak = steps[Math.floor(steps.length * 0.95)];
  return peak / range;
}

/**
 * Everything measurable about whether this design can be seen.
 *
 * `unverified` is a real answer and is used whenever the input is too small or
 * too odd to measure honestly — it blocks a positive claim without inventing a
 * negative one.
 */
export function measureQuality(pixels: Pixels): ImageQuality {
  const notes: string[] = [];
  if (!pixels.width || !pixels.height || pixels.rgba.length < 16) {
    return { contrast: "unverified", tonalRange: "unverified", sharpness: "unverified",
      thumbnailReadable: "unverified", emptiness: "unverified",
      notes: ["This design could not be measured, so its readability was not verified."],
      mayClaimReadable: false, mayClaimHighContrast: false };
  }

  const { luminances, inkShare } = flatten(pixels);
  const sorted = [...luminances].sort((a, b) => a - b);
  /* Percentiles rather than min/max: one stray dark pixel is not contrast. */
  const low = sorted[Math.floor(sorted.length * 0.05)];
  const high = sorted[Math.floor(sorted.length * 0.95)];
  const ratio = contrastRatio(low, high);
  const range = high - low;

  const empty = inkShare < MIN_INK_SHARE;
  if (empty) notes.push("This design is empty or almost empty.");

  const contrast: QualityVerdict = ratio >= CONTRAST_HIGH ? "pass" : "fail";
  if (contrast === "fail")
    notes.push(`The design's light and dark areas are too close together to read `
      + `easily (measured ${ratio.toFixed(1)}:1; around ${CONTRAST_HIGH}:1 is where `
      + `text stays comfortable).`);

  const tonalRange: QualityVerdict = range >= TONAL_RANGE_MIN ? "pass" : "fail";
  if (tonalRange === "fail" && contrast === "pass")
    notes.push("The design uses a narrow range of tones, so it may look flat when printed.");

  /*
    SHARPNESS IS MEASURED AT FULL SIZE, NOT ON THE THUMBNAIL.

    Blur is a property of the artwork. Downscaling softens everything — a
    perfectly crisp design reduced to 64px has gentle edges too — so measuring
    sharpness after the reduction cannot tell a blurred design from a small
    one. The thumbnail is used for the separate question of whether CONTRAST
    survives being made small.
  */
  const edge = sharpness(pixels, luminances, Math.max(range, 0.05));
  const sharp: QualityVerdict = edge >= SHARPNESS_MIN ? "pass" : "fail";

  const thumb = toThumbnail(pixels);
  const thumbFlat = flatten(thumb);
  const thumbSorted = [...thumbFlat.luminances].sort((a, b) => a - b);
  const thumbRatio = contrastRatio(
    thumbSorted[Math.floor(thumbSorted.length * 0.05)],
    thumbSorted[Math.floor(thumbSorted.length * 0.95)]);
  const survivesReduction = thumbRatio >= CONTRAST_FLOOR;
  if (!survivesReduction && contrast === "pass")
    notes.push("This design loses its contrast when it is shrunk to thumbnail size, "
      + "which is where buyers see it first.");
  if (sharp === "fail")
    notes.push("The edges in this design are soft. At the size buyers first see it, "
      + "it will look blurred.");

  const thumbnailReadable: QualityVerdict = empty ? "fail"
    : (contrast === "pass" && sharp === "pass" && survivesReduction) ? "pass" : "fail";

  return {
    contrast, tonalRange, sharpness: sharp,
    thumbnailReadable, emptiness: empty ? "fail" : "pass", notes,
    /* The gate. A model's description can never turn these back on. */
    mayClaimReadable: thumbnailReadable === "pass",
    mayClaimHighContrast: contrast === "pass" && tonalRange === "pass",
  };
}
