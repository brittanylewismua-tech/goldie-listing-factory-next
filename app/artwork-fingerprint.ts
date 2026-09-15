/**
 * COMPARING A PRINT FILE TO A PHOTOGRAPH OF A T-SHIRT.
 *
 * These are not the same kind of picture. One is artwork on transparency at
 * print resolution; the other is that artwork on fabric, at an angle, under a
 * light, possibly on a person, cropped to a square. Every cheap similarity
 * measure will disagree about them.
 *
 * So nothing here rejects anything. It RANKS — narrowing thousands of possible
 * pairs down to a few worth looking at properly. A weak score means "not worth
 * a vision call first", never "the artwork is absent".
 *
 * Everything is deterministic and free: no model, no per-comparison cost.
 */

/** Decode a small PNG to raw RGB. Only what Cloudflare Images hands back. */
export async function decodeTinyPng(bytes: ArrayBuffer): Promise<{
  width: number; height: number; rgb: Uint8Array;
} | null> {
  const data = new Uint8Array(bytes);
  const view = new DataView(bytes);
  if (data.length < 8 || data[0] !== 137 || data[1] !== 80) return null;

  let at = 8;
  let width = 0;
  let height = 0;
  let colourType = 0;
  const idat: Uint8Array[] = [];
  while (at + 8 <= data.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(data[at + 4], data[at + 5], data[at + 6], data[at + 7]);
    const body = data.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      colourType = data[at + 8 + 9];
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  if (!width || !height || !idat.length) return null;

  const joined = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of idat) { joined.set(part, offset); offset += part.length; }
  const inflated = new Uint8Array(await new Response(
    new Blob([joined]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());

  /* Cloudflare returns 8-bit RGB or RGBA; both are handled, nothing else is. */
  const channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
  if (!channels) return null;

  const stride = width * channels;
  const rgb = new Uint8Array(width * height * 3);
  const row = new Uint8Array(stride);
  const previous = new Uint8Array(stride);
  let read = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[read];
    read += 1;
    row.set(inflated.subarray(read, read + stride));
    read += stride;
    /* PNG's five filters, undone. Skipping this gives noise that looks like
       data, which is worse than failing. */
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels] : 0;
      const up = previous[index];
      const upLeft = index >= channels ? previous[index - channels] : 0;
      if (filter === 1) row[index] = (row[index] + left) & 0xff;
      else if (filter === 2) row[index] = (row[index] + up) & 0xff;
      else if (filter === 3) row[index] = (row[index] + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const dLeft = Math.abs(estimate - left);
        const dUp = Math.abs(estimate - up);
        const dUpLeft = Math.abs(estimate - upLeft);
        const best = dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
        row[index] = (row[index] + best) & 0xff;
      }
    }
    previous.set(row);
    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 3;
      /*
        Transparency is the whole difference between a print file and a
        photograph, so a transparent pixel is flattened to white — the ground
        it will be compared against — rather than left as black, which would
        invent a dark shape that is not in the design.
      */
      const alpha = channels === 4 ? row[from + 3] / 255 : 1;
      rgb[to] = Math.round(row[from] * alpha + 255 * (1 - alpha));
      rgb[to + 1] = Math.round(row[from + 1] * alpha + 255 * (1 - alpha));
      rgb[to + 2] = Math.round(row[from + 2] * alpha + 255 * (1 - alpha));
    }
  }
  return { width, height, rgb };
}

export type Fingerprint = {
  aHash: string;
  dHash: string;
  /* Six coarse colour buckets, as shares of the image. */
  palette: number[];
  edgeDensity: number;
  /* Ink coverage: how much of the image is not near-white. On a print file
     this is the design; on a mockup it is design plus garment plus shadow. */
  inkShare: number;
};

const grey = (rgb: Uint8Array, at: number) =>
  (rgb[at * 3] * 299 + rgb[at * 3 + 1] * 587 + rgb[at * 3 + 2] * 114) / 1000;

export function fingerprint(image: { width: number; height: number; rgb: Uint8Array }): Fingerprint {
  const { width, height, rgb } = image;
  const count = width * height;

  const greys = new Float64Array(count);
  for (let index = 0; index < count; index += 1) greys[index] = grey(rgb, index);
  const mean = greys.reduce((sum, value) => sum + value, 0) / count;

  /* Average hash over an 8×8 sample of whatever size came back. */
  const bits: string[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 8));
  for (let y = 0; y < 8; y += 1)
    for (let x = 0; x < 8; x += 1) {
      const at = Math.min(count - 1, (y * step) * width + (x * step));
      bits.push(greys[at] > mean ? "1" : "0");
    }
  const aHash = bits.join("");

  /* Difference hash: brighter than the pixel to its right. Survives a change
     of exposure, which every mockup has and no print file does. */
  const diff: string[] = [];
  for (let y = 0; y < 8; y += 1)
    for (let x = 0; x < 8; x += 1) {
      const here = Math.min(count - 1, (y * step) * width + (x * step));
      const next = Math.min(count - 1, (y * step) * width + ((x + 1) * step));
      diff.push(greys[here] > greys[next] ? "1" : "0");
    }
  const dHash = diff.join("");

  /* Coarse palette: two levels per channel, eight buckets, reported as six
     after dropping the two that are nearly always garment and background. */
  const buckets = new Array(8).fill(0);
  let ink = 0;
  for (let index = 0; index < count; index += 1) {
    const red = rgb[index * 3] > 127 ? 1 : 0;
    const green = rgb[index * 3 + 1] > 127 ? 1 : 0;
    const blue = rgb[index * 3 + 2] > 127 ? 1 : 0;
    buckets[(red << 2) | (green << 1) | blue] += 1;
    if (greys[index] < 220) ink += 1;
  }

  /* Edges: how busy the picture is. A text-heavy design and a plain garment
     are very different here even when their colours agree. */
  let edges = 0;
  for (let y = 1; y < height - 1; y += 1)
    for (let x = 1; x < width - 1; x += 1) {
      const at = y * width + x;
      const dx = Math.abs(greys[at - 1] - greys[at + 1]);
      const dy = Math.abs(greys[at - width] - greys[at + width]);
      if (dx + dy > 40) edges += 1;
    }

  return {
    aHash, dHash,
    palette: buckets.slice(0, 6).map(value => Math.round((value / count) * 1000) / 1000),
    edgeDensity: Math.round((edges / count) * 1000) / 1000,
    inkShare: Math.round((ink / count) * 1000) / 1000,
  };
}

const hamming = (left: string, right: string) => {
  let distance = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1)
    if (left[index] !== right[index]) distance += 1;
  return distance;
};

/**
 * How plausible is this pair, on free evidence alone?
 *
 * Returned as a score and its parts, because a single number nobody can take
 * apart is exactly the kind of thing that turns into a false rejection.
 */
export function plausibility(artwork: Fingerprint, mockup: Fingerprint) {
  const structure = 1 - hamming(artwork.dHash, mockup.dHash) / 64;
  const tone = 1 - hamming(artwork.aHash, mockup.aHash) / 64;
  const colour = 1 - artwork.palette.reduce(
    (sum, share, index) => sum + Math.abs(share - mockup.palette[index]), 0) / 2;
  /* A print file is mostly empty; a mockup is mostly garment. What travels is
     the RELATIONSHIP between busyness and coverage, not either alone. */
  const busyness = 1 - Math.min(1, Math.abs(artwork.edgeDensity - mockup.edgeDensity) * 4);

  const score = Math.round(
    (structure * 0.35 + tone * 0.2 + colour * 0.25 + busyness * 0.2) * 1000) / 1000;
  return {
    score,
    parts: {
      structure: Math.round(structure * 1000) / 1000,
      tone: Math.round(tone * 1000) / 1000,
      colour: Math.round(colour * 1000) / 1000,
      busyness: Math.round(busyness * 1000) / 1000,
    },
  };
}
