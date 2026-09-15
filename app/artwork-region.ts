/**
 * COMPARE THE DESIGN, NOT THE PHOTOGRAPH.
 *
 * The first deterministic pass scored every artwork against every listing
 * image and produced a band 0.079 wide — best 0.743, median 0.721, worst
 * 0.664 — with the top artworks returning identical candidate lists in
 * identical order. That is the signature of a measure that answers "is this a
 * photo of a garment" rather than "is this that design".
 *
 * The cause is that most of a mockup is not the design. A print occupying a
 * fifth of the frame contributes a fifth of the pixels, and the shirt, the
 * background, the folds and the lighting contribute the rest — so two mockups
 * of completely different designs on the same blank agree far more than a
 * mockup and the flat print file it came from.
 *
 * This finds the printed area first and compares only that. Everything here
 * is deterministic and free: no model, no paid call, no network.
 */
export type Grid = { size: number; rgb: Uint8Array };
export type Region = {
  /* Where the print was found, as a fraction of the frame, so a human can
     check the box against the picture. */
  box: { left: number; top: number; right: number; bottom: number };
  coverage: number;
  grid: Grid;
  ink: Uint8Array;
  inkShare: number;
  found: boolean;
};

const at = (rgb: Uint8Array, width: number, x: number, y: number) => (y * width + x) * 3;

/** Nearest-neighbour resample of a sub-box into a square grid. */
export function resample(
  source: { width: number; height: number; rgb: Uint8Array },
  box: { left: number; top: number; right: number; bottom: number },
  size: number,
): Grid {
  const rgb = new Uint8Array(size * size * 3);
  const spanX = Math.max(1, box.right - box.left);
  const spanY = Math.max(1, box.bottom - box.top);
  for (let y = 0; y < size; y += 1) {
    const sy = Math.min(source.height - 1, box.top + Math.floor((y + 0.5) * spanY / size));
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(source.width - 1, box.left + Math.floor((x + 0.5) * spanX / size));
      const from = at(source.rgb, source.width, sx, sy);
      const to = (y * size + x) * 3;
      rgb[to] = source.rgb[from];
      rgb[to + 1] = source.rgb[from + 1];
      rgb[to + 2] = source.rgb[from + 2];
    }
  }
  return { size, rgb };
}

/** The colour the picture is mostly made of around its edges. */
function borderColour(source: { width: number; height: number; rgb: Uint8Array }) {
  const counts = new Map<number, number>();
  const note = (x: number, y: number) => {
    const from = at(source.rgb, source.width, x, y);
    /* Coarse buckets, so lighting variation across a plain shirt still lands
       in one place. */
    const key = ((source.rgb[from] >> 4) << 8) | ((source.rgb[from + 1] >> 4) << 4) | (source.rgb[from + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (let x = 0; x < source.width; x += 1) { note(x, 0); note(x, source.height - 1); }
  for (let y = 0; y < source.height; y += 1) { note(0, y); note(source.width - 1, y); }
  let best = 0;
  let bestCount = -1;
  for (const [key, count] of counts) if (count > bestCount) { best = key; bestCount = count; }
  return [((best >> 8) & 15) * 17, ((best >> 4) & 15) * 17, (best & 15) * 17];
}

const distance = (a: number[], b: number[]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/**
 * Find the printed area.
 *
 * A print file is ink on a transparent ground that the decoder has already
 * flattened to white, so its print region is simply everything that is not
 * white. A mockup is ink on a garment inside a studio background, so its
 * print region is everything that is neither the background nor the garment.
 *
 * Both reduce to the same question — which pixels differ from the dominant
 * surrounding colour — and a garment mockup answers it once the border colour
 * is known.
 */
export function printRegion(
  source: { width: number; height: number; rgb: Uint8Array },
  { size = 48, margin = 0.06 }: { size?: number; margin?: number } = {},
): Region {
  const ground = borderColour(source);
  const insetX = Math.floor(source.width * margin);
  const insetY = Math.floor(source.height * margin);

  /* A pixel counts as ink when it is far from the ground colour. The
     threshold is deliberately generous: missing part of a design costs more
     than including a fold. */
  const THRESHOLD = 90;
  let left = source.width;
  let top = source.height;
  let right = -1;
  let bottom = -1;
  let inkCount = 0;
  for (let y = insetY; y < source.height - insetY; y += 1) {
    for (let x = insetX; x < source.width - insetX; x += 1) {
      const from = at(source.rgb, source.width, x, y);
      const pixel = [source.rgb[from], source.rgb[from + 1], source.rgb[from + 2]];
      if (distance(pixel, ground) <= THRESHOLD) continue;
      inkCount += 1;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  /*
    A box covering nearly the whole frame has not found a print — it has found
    a garment against a contrasting background, or a photograph with no plain
    ground at all. Saying so is better than cropping to the whole picture and
    calling it a design.
  */
  const area = source.width * source.height;
  const found = right > left && bottom > top && inkCount > area * 0.002;
  const box = found
    ? { left, top, right: right + 1, bottom: bottom + 1 }
    : { left: 0, top: 0, right: source.width, bottom: source.height };

  const grid = resample(source, box, size);
  const ink = new Uint8Array(size * size);
  let gridInk = 0;
  for (let index = 0; index < size * size; index += 1) {
    const pixel = [grid.rgb[index * 3], grid.rgb[index * 3 + 1], grid.rgb[index * 3 + 2]];
    if (distance(pixel, ground) > THRESHOLD) { ink[index] = 1; gridInk += 1; }
  }

  return {
    box: {
      left: box.left / source.width, top: box.top / source.height,
      right: box.right / source.width, bottom: box.bottom / source.height,
    },
    coverage: ((box.right - box.left) * (box.bottom - box.top)) / area,
    grid, ink,
    inkShare: gridInk / (size * size),
    found,
  };
}

const grey = (grid: Grid, index: number) =>
  (grid.rgb[index * 3] * 299 + grid.rgb[index * 3 + 1] * 587 + grid.rgb[index * 3 + 2] * 114) / 1000;

/** Which way the picture steps, left to right — survives a colour shift. */
function edges(grid: Grid): Uint8Array {
  const out = new Uint8Array(grid.size * grid.size);
  for (let y = 0; y < grid.size; y += 1)
    for (let x = 0; x < grid.size - 1; x += 1) {
      const index = y * grid.size + x;
      out[index] = Math.abs(grey(grid, index + 1) - grey(grid, index)) > 24 ? 1 : 0;
    }
  return out;
}

const agreement = (a: Uint8Array, b: Uint8Array) => {
  let intersection = 0;
  let union = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] || b[index]) union += 1;
    if (a[index] && b[index]) intersection += 1;
  }
  /* Two empty masks agree on nothing rather than perfectly. */
  return union ? intersection / union : 0;
};

export type RegionComparison = {
  score: number;
  parts: {
    inkShape: number; edgeShape: number; brightness: number;
    inkDensity: number; aspect: number;
  };
};

/**
 * How much two print regions look like the same design.
 *
 * Shape carries most of the weight. Colour is nearly worthless here: a print
 * file's colours are the ink's, and a mockup's are the ink's filtered through
 * fabric, a light and a camera.
 */
export function compareRegions(design: Region, candidate: Region): RegionComparison {
  const inkShape = agreement(design.ink, candidate.ink);
  const edgeShape = agreement(edges(design.grid), edges(candidate.grid));

  let brightnessAgreement = 0;
  const count = design.grid.size * design.grid.size;
  for (let index = 0; index < count; index += 1)
    brightnessAgreement += 1 - Math.abs(grey(design.grid, index) - grey(candidate.grid, index)) / 255;
  const brightness = brightnessAgreement / count;

  const inkDensity = 1 - Math.abs(design.inkShare - candidate.inkShare);
  const designAspect = (design.box.right - design.box.left) / Math.max(1e-6, design.box.bottom - design.box.top);
  const candidateAspect = (candidate.box.right - candidate.box.left) / Math.max(1e-6, candidate.box.bottom - candidate.box.top);
  const aspect = 1 - Math.min(1, Math.abs(designAspect - candidateAspect) / 2);

  const parts = { inkShape, edgeShape, brightness, inkDensity, aspect };
  const score =
    inkShape * 0.40 + edgeShape * 0.30 + brightness * 0.10 + inkDensity * 0.10 + aspect * 0.10;
  return { score, parts };
}
