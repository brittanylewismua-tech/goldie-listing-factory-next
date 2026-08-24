/* D200 · Choosing which Printify catalog image represents a product.
 *
 * D194 picked the candidate with the most non-background pixels, on the theory
 * that a white garment on white scores near zero however it is cropped. That
 * reasoning is right about the failure it was chasing and backwards as a rule:
 * "most ink wins" rewards whatever fills the frame, and what fills the frame is
 * a macro detail shot.
 *
 * Measured on the live Unisex Heavy Cotton Tee, six candidates, ink percentages:
 *   #0 model, front              86
 *   #1 model, design grid        86
 *   #2 flat lay, whole tee       64   <- the only thumbnail that reads as a tee
 *   #3 macro of a folded corner  99   <- what D194 selected
 *   #4 model, back               86
 *   #5 model, seated             89
 * D194 chose #3 and ranked #2 last. At 52px #3 is an unrecognisable yellow
 * blob, which is what the seller actually saw next to "Gildan Tee".
 *
 * What distinguishes a catalog product shot is not how much of the frame the
 * subject fills but that the subject is ISOLATED: a plain backdrop, and nothing
 * running off the edges. A macro shot bleeds off every edge. A model shot bleeds
 * off the top and bottom. A product photographed alone touches no edge at all.
 *
 * So: estimate the backdrop from the four corners, measure how much of the frame
 * matches it, and subtract a heavy penalty for subject pixels touching the
 * border. Same six candidates, bg% / edge% / score:
 *   #0  52 / 27 / -29     #1  34 / 53 / -125
 *   #2  61 /  0 /  61     #3  20 / 52 / -136
 *   #4  71 /  9 /  44     #5  54 / 15 /   9
 * #2 wins on a zero edge score, and the macro shot lands last.
 *
 * Verified against her other two products before shipping: the hoodie picks a
 * clean hoodie shot and the crewneck picks a flat-lay crewneck. All three
 * thumbnails read as the garment they are.
 */

export const PHOTO_SAMPLE_SIZE = 48;

/* How far apart two colours may be and still count as the same backdrop.
 * Printify backdrops are photographic, not flat #fff, so they drift by a few
 * levels across the frame; 60 across summed RGB absorbs that without swallowing
 * a white garment sitting on a light grey sweep. */
const BACKDROP_TOLERANCE = 60;

/* The backdrop colour, taken as the median of the four corners. Median rather
 * than mean so a single corner containing a sleeve or a prop cannot drag the
 * reference onto the garment. */
export function backdropReference(pixels: ArrayLike<number>, size = PHOTO_SAMPLE_SIZE): [number, number, number] {
  const at = (x: number, y: number) => {
    const i = (y * size + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  };
  const corners = [at(1, 1), at(size - 2, 1), at(1, size - 2), at(size - 2, size - 2)];
  return [0, 1, 2].map((channel) => corners.map((c) => c[channel]).sort((a, b) => a - b)[1]) as [number, number, number];
}

export type PhotoStats = { backdrop: number; edge: number; skin: number; score: number };

/* backdrop: percent of the frame matching the backdrop.
 * edge:     percent of the 1px border that is NOT backdrop, i.e. how much of
 *           the subject runs off the frame.
 * score:    backdrop - edge * 3. The weight of 3 is what separates the flat lay
 *           (61) from the model shot with the most backdrop (44); at weight 1
 *           they tie at 61 and 62 and the model wins on noise. */

/* D349 · Saved-product thumbnails were a mix: the tee and crewneck showed flat
   studio shots, the hoodie showed a model wearing it. Printify returns both for
   most products and the old score could not tell them apart — it measured how
   isolated the subject was on a plain backdrop, and a studio model shot scores
   well on exactly that.
 *
 * A model shot has skin in it and a flat lay does not, so skin coverage is the
 * signal. This is a heuristic, and the classic RGB skin rule is known to be
 * tuned toward lighter tones, so the range here is deliberately wide and the
 * threshold is low: it only has to notice that SOME skin is present, not
 * measure how much or whose. It is also only a penalty — if it misses, the
 * result is the previous behaviour, not a worse one.
 */
export function skinPercent(pixels: ArrayLike<number>, size = PHOTO_SAMPLE_SIZE): number {
  let skin = 0;
  for (let index = 0; index < size * size; index++) {
    const offset = index * 4;
    const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    /* Warm, mid-to-high luminance, red-dominant, and not grey — which covers a
       wide span of skin tones without catching white or grey studio backdrops. */
    const warm = r > g && g >= b - 12 && r - b > 12;
    const notGrey = max - min > 14;
    const plausible = r > 60 && max > 70 && min < 245;
    if (warm && notGrey && plausible) skin++;
  }
  return Math.round((skin / (size * size)) * 100);
}

export function photoStats(pixels: ArrayLike<number>, size = PHOTO_SAMPLE_SIZE): PhotoStats {
  const ref = backdropReference(pixels, size);
  const isBackdrop = (x: number, y: number) => {
    const i = (y * size + x) * 4;
    return Math.abs(pixels[i] - ref[0]) + Math.abs(pixels[i + 1] - ref[1]) + Math.abs(pixels[i + 2] - ref[2]) < BACKDROP_TOLERANCE;
  };
  let backdrop = 0, border = 0, borderSubject = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isBg = isBackdrop(x, y);
      if (isBg) backdrop++;
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
        border++;
        if (!isBg) borderSubject++;
      }
    }
  }
  const backdropPercent = Math.round((backdrop / (size * size)) * 100);
  const edgePercent = Math.round((borderSubject / border) * 100);

  /* A frame with no distinguishable subject is unusable as a thumbnail, and it
   * would otherwise score perfectly: if the whole image is one colour then the
   * corners ARE that colour, everything matches the reference, and it reads as
   * 100% backdrop with nothing touching the border. A blank or solid placeholder
   * would beat every real product shot. Reject both extremes instead. */
  if (backdropPercent >= 99 || backdropPercent <= 1) {
    return { backdrop: backdropPercent, edge: edgePercent, skin: 0, score: Number.NEGATIVE_INFINITY };
  }
  /* D349 · A garment worn by a person is a worse thumbnail than the garment on
     its own, so skin present in the frame outweighs a slightly cleaner backdrop.
     The penalty is large enough that any real model shot loses to any usable
     flat lay, and the threshold keeps a stray warm pixel from mattering. */
  const skin = skinPercent(pixels, size);
  const modelPenalty = skin >= 3 ? 120 + skin : 0;
  return { backdrop: backdropPercent, edge: edgePercent, skin, score: backdropPercent - edgePercent * 3 - modelPenalty };
}

/* D370 · Measured on her three live products, the photo path fails on its own
   terms for two of them:
     Gildan Hoodie  — all six blueprint candidates are model shots
                      (skin 4-9%). There is no flat lay to pick. The scorer was
                      working; the source has nothing better.
     Gildan Tee     — the flat lay wins, but it is a white tee on a white sweep,
                      so at 52px it reads as an empty square (backdrop 90%+).
   Cropping does not help: the frame is close to square, so every object-position
   from 38% to 75% still shows the model's head.

   So a photo earns its place only when it actually shows the garment. When it
   does not, the card draws a garment glyph instead — uniform, legible at 52px,
   never a stranger's face, never a blank tile. */
export function photoReadsAsGarment(stats: PhotoStats): boolean {
  if (!Number.isFinite(stats.score)) return false;
  if (stats.skin >= 3) return false;        /* somebody is wearing it */
  if (stats.backdrop >= 90) return false;   /* garment is the same colour as the sweep */
  return true;
}

/* D380 · D370 treated "does not read as the garment" as a veto, so the hoodie -
   whose six catalog images are all model shots - fell through to the glyph. That
   is worse than the photo: a real hoodie on a person still shows the hoodie.
   Prefer a flat lay, fall back to the best photo there is, and keep the glyph
   for the case where there is genuinely nothing usable.

   This also fixes the white tee from the other direction. Its flat lay is white
   on a white sweep and reads as an empty square, so it loses the first pass -
   and the best remaining shot, even on a model, is more legible than a blank
   tile.

   Returns the index of the photo to use, or -1 for "draw the glyph". */
export function photoIsUsable(stats: PhotoStats): boolean {
  if (!Number.isFinite(stats.score)) return false;
  /* Garment the same colour as the sweep: nothing is visible at 52px whatever
     the score says, and the score is generous to it because backdrop is most of
     the formula. A model shot is a fallback; this is not. */
  return stats.backdrop < 90;
}

export function preferredPhotoIndex(stats: Array<PhotoStats | null>): number {
  let bestGarment = -1, bestGarmentScore = Number.NEGATIVE_INFINITY;
  let bestAny = -1, bestAnyScore = Number.NEGATIVE_INFINITY;
  stats.forEach((measured, index) => {
    if (!measured || !photoIsUsable(measured)) return;
    if (measured.score > bestAnyScore) { bestAnyScore = measured.score; bestAny = index; }
    if (photoReadsAsGarment(measured) && measured.score > bestGarmentScore) {
      bestGarmentScore = measured.score;
      bestGarment = index;
    }
  });
  return bestGarment >= 0 ? bestGarment : bestAny;
}
