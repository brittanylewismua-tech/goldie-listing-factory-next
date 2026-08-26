import type { ProductBox, ScenePreparation } from "./prepared-scene";

export type ProductMask = { width: number; height: number; pixels: Uint8Array };

/* SAM returns COCO's compressed, column-major run-length encoding. Keeping the
   decoder here means preparation can verify the actual product silhouette in a
   Worker; no native image library and no browser canvas are involved. */
export type ImageDimensions = { width: number; height: number };

export function decodeCocoRle(value: unknown, dimensions?: ImageDimensions | null): ProductMask | null {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate); }
    catch {
      // Fal's image-rle endpoint returns the compressed COCO counts string by
      // itself. SAM knows the size from the input image; pair it back here.
      if (!dimensions) return null;
      candidate = { size: [dimensions.height, dimensions.width], counts: value };
    }
  }
  const record = candidate as { size?: unknown; counts?: unknown } | null;
  if (!record || !Array.isArray(record.size) || record.size.length < 2 || typeof record.counts !== "string") return null;
  const height = Number(record.size[0]), width = Number(record.size[1]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width * height > 40_000_000) return null;

  const runs: number[] = [];
  for (let position = 0; position < record.counts.length;) {
    let value = 0, shift = 0, current = 0;
    do {
      current = record.counts.charCodeAt(position++) - 48;
      if (current < 0 || current > 63) return null;
      value |= (current & 0x1f) << (5 * shift++);
    } while ((current & 0x20) !== 0 && position < record.counts.length);
    if ((current & 0x10) !== 0) value |= -1 << (5 * shift);
    if (runs.length > 2) value += runs[runs.length - 2];
    if (!Number.isInteger(value) || value < 0) return null;
    runs.push(value);
  }

  const pixels = new Uint8Array(width * height);
  let offset = 0, foreground = false;
  for (const count of runs) {
    if (offset + count > pixels.length) return null;
    if (foreground) {
      // COCO traverses columns first. Convert to normal row-major pixels once.
      for (let index = offset; index < offset + count; index++) {
        const x = Math.floor(index / height), y = index % height;
        pixels[y * width + x] = 1;
      }
    }
    offset += count;
    foreground = !foreground;
  }
  return offset === pixels.length ? { width, height, pixels } : null;
}

export function imageDimensions(bytes: Uint8Array, contentType = ""): ImageDimensions | null {
  const u32be = (offset: number) => ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  if ((contentType.includes("png") || bytes[0] === 0x89) && bytes.length >= 24
    && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = u32be(16), height = u32be(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if ((contentType.includes("jpeg") || (bytes[0] === 0xff && bytes[1] === 0xd8)) && bytes.length >= 12) {
    let offset = 2;
    const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if (sof.has(marker) && length >= 7) {
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
        const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        return width > 0 && height > 0 ? { width, height } : null;
      }
      offset += length;
    }
  }
  // WebP extended header: canvas dimensions are stored as 24-bit values - 1.
  if ((contentType.includes("webp") || String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")
    && bytes.length >= 30 && String.fromCharCode(...bytes.slice(12, 16)) === "VP8X") {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

function onMask(mask: ProductMask, x: number, y: number) {
  const px = Math.min(mask.width - 1, Math.max(0, Math.round(x * (mask.width - 1))));
  const py = Math.min(mask.height - 1, Math.max(0, Math.round(y * (mask.height - 1))));
  return mask.pixels[py * mask.width + px] === 1;
}

function bilinear(corners: ScenePreparation["corners"], u: number, v: number): [number, number] {
  const topX = corners[0][0] + (corners[1][0] - corners[0][0]) * u;
  const topY = corners[0][1] + (corners[1][1] - corners[0][1]) * u;
  const bottomX = corners[3][0] + (corners[2][0] - corners[3][0]) * u;
  const bottomY = corners[3][1] + (corners[2][1] - corners[3][1]) * u;
  return [topX + (bottomX - topX) * v, topY + (bottomY - topY) * v];
}

export function quadMaskCoverage(mask: ProductMask, corners: ScenePreparation["corners"], samples = 13) {
  let inside = 0, total = 0;
  for (let row = 0; row < samples; row++) for (let column = 0; column < samples; column++) {
    // Test cell centres instead of the mathematical edge, where antialiasing is expected.
    const point = bilinear(corners, (column + .5) / samples, (row + .5) / samples);
    inside += onMask(mask, point[0], point[1]) ? 1 : 0;
    total++;
  }
  return total ? inside / total : 0;
}

export function quadStaysOnMask(mask: ProductMask, corners: ScenePreparation["corners"], minimum = .96) {
  const centre = bilinear(corners, .5, .5);
  return onMask(mask, centre[0], centre[1]) && quadMaskCoverage(mask, corners) >= minimum;
}

/* If the vision model proposes an off-product surface, shrink the deterministic
   product-family surface around its intended centre until the real silhouette
   contains it. This is a safety fallback, not a second placement system:
   Printify still controls artwork scale/offset/rotation inside this surface. */
export function fitQuadToMask(mask: ProductMask, initial: ScenePreparation["corners"]): ScenePreparation["corners"] | null {
  const centre = bilinear(initial, .5, .5);
  if (!onMask(mask, centre[0], centre[1])) return null;
  for (let scale = 1; scale >= .34; scale -= .04) {
    const candidate = initial.map(([x, y]) => [centre[0] + (x - centre[0]) * scale, centre[1] + (y - centre[1]) * scale]) as ScenePreparation["corners"];
    if (quadStaysOnMask(mask, candidate)) return candidate;
  }
  return null;
}

export function maskBoundingBox(mask: ProductMask): ProductBox | null {
  let left = mask.width, top = mask.height, right = -1, bottom = -1;
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) if (mask.pixels[y * mask.width + x]) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) return null;
  return { left: left / mask.width, top: top / mask.height, right: (right + 1) / mask.width, bottom: (bottom + 1) / mask.height };
}
