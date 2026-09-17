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
/*
  THE SIZE A LISTING IS ACTUALLY FIRST SEEN AT.

  64px was a guess and a harsh one — smaller than anything Etsy renders, so a
  perfectly legible design failed a test no buyer would ever apply. Etsy's
  search grid serves around 170-300px on the long edge depending on breakpoint
  and density; 170 is the small end of what a member's listing is really shown
  at, which is the right place to judge it.
*/
export const THUMBNAIL_EDGE = 170;

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
  /*
    BOTH AXES, AND ONLY WHERE SOMETHING ACTUALLY CHANGES.

    Two flaws had to come out of this one function. Scanning rows only meant a
    design of horizontal strokes had almost no measurable steps — the metric
    depended on which way the ink happened to run. And taking a percentile of
    EVERY adjacent pair meant a sparse design was judged mostly on background
    sitting next to background: at the 95th percentile a page of crisp text
    scored zero, because 95% of neighbouring pixels are both paper.

    So: step in both directions, keep only the pairs where something actually
    changes, and take a high percentile of those. What is left is edges, and
    an edge is the thing being measured. A blurred edge spreads the same total
    change across more pixels, so each step is smaller and this falls.
  */
  const steps: number[] = [];
  const at = (x: number, y: number) => luminances[y * pixels.width + x];
  for (let y = 0; y < pixels.height; y += 1)
    for (let x = 1; x < pixels.width; x += 1)
      steps.push(Math.abs(at(x, y) - at(x - 1, y)));
  for (let y = 1; y < pixels.height; y += 1)
    for (let x = 0; x < pixels.width; x += 1)
      steps.push(Math.abs(at(x, y) - at(x, y - 1)));

  /* Anything below this is sensor-level noise or compression, not an edge. */
  const transitions = steps.filter(step => step > 0.01).sort((a, b) => a - b);
  if (!transitions.length || range <= 0) return 0;
  const peak = transitions[Math.min(transitions.length - 1,
    Math.floor(transitions.length * 0.9))];
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

  /*
    INK AGAINST GROUND, NOT TWO PERCENTILES OF THE WHOLE IMAGE.

    A first version took the 5th and 95th percentile luminance. On a print
    design the artwork covers a small share of a large canvas, so BOTH
    percentiles landed on the background and every sparse design — including
    crisp black text on white — measured 1.0:1 and was told it could not be
    read. Caught in production; the unit fixtures had all used 50%-coverage
    stripes, which is why they passed.

    The percentile was guarding against one stray pixel counting as contrast.
    A histogram keeps that guard without the flaw: the GROUND is the most
    populated tone, the INK is the tone furthest from it that still covers a
    meaningful share, and anything rarer than that share is the stray pixel
    the percentile was there to ignore.
  */
  /*
    CONTRAST AND SOFTNESS MUST BE ABLE TO FAIL SEPARATELY.

    A first version found the ink by looking for a single histogram bucket,
    far from the ground, holding at least half a per cent of the pixels. Heavy
    blur spreads a stroke across many tones, so no single bucket cleared the
    floor and the ink was read as sitting on the ground: a blurred black-on-
    white design failed CONTRAST and passed SHARPNESS, and the member was told
    to fix the wrong thing.

    The ink is a population, not a bucket. Everything meaningfully away from
    the ground is ink, however it is spread, and the ink's own darkest fifth
    is what the ground is compared against — blurred strokes still have dark
    centres, so tonal range survives blur exactly as it does in the eye.
  */
  const BUCKETS = 64;
  const histogram = new Array<number>(BUCKETS).fill(0);
  for (const value of luminances)
    histogram[Math.min(BUCKETS - 1, Math.max(0, Math.round(value * (BUCKETS - 1))))] += 1;
  const ground = histogram.indexOf(Math.max(...histogram)) / (BUCKETS - 1);

  /* Far enough from the ground to be the design rather than the paper. */
  const INK_DISTANCE = 0.03;
  const inkTones = luminances
    .filter(value => Math.abs(value - ground) > INK_DISTANCE)
    .sort((a, b) => Math.abs(b - ground) - Math.abs(a - ground));
  const inkPresent = inkTones.length / Math.max(1, luminances.length);

  /*
    The darkest (or lightest) fifth of the ink, so a spread-out stroke still
    counts — but only once there is enough ink to be a design at all. One
    black pixel on a grey field is not contrast, and taking a percentile of a
    one-element population would say it was.
  */
  const enoughInk = inkPresent >= MIN_INK_SHARE;
  const ink = enoughInk ? inkTones[Math.floor(inkTones.length * 0.2)] : ground;
  const ratio = contrastRatio(ground, ink);
  const range = Math.abs(ink - ground);

  const empty = inkShare < MIN_INK_SHARE || inkPresent < MIN_INK_SHARE;
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
  /* Same ink-against-ground reading, on the reduced image. */
  const thumbHistogram = new Array<number>(BUCKETS).fill(0);
  for (const value of thumbFlat.luminances)
    thumbHistogram[Math.min(BUCKETS - 1, Math.max(0, Math.round(value * (BUCKETS - 1))))] += 1;
  const thumbGround = thumbHistogram.indexOf(Math.max(...thumbHistogram)) / (BUCKETS - 1);
  const thumbInkTones = thumbFlat.luminances
    .filter(value => Math.abs(value - thumbGround) > INK_DISTANCE)
    .sort((a, b) => Math.abs(b - thumbGround) - Math.abs(a - thumbGround));
  const thumbInk = thumbInkTones.length
    ? thumbInkTones[Math.floor(thumbInkTones.length * 0.2)] : thumbGround;
  const thumbRatio = contrastRatio(thumbGround, thumbInk);
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
