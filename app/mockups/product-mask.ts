import type { ProductBox, ScenePreparation } from "./prepared-scene";

export type ProductMask = { width: number; height: number; pixels: Uint8Array };

/* SAM returns COCO's compressed, column-major run-length encoding. Keeping the
   decoder here means preparation can verify the actual product silhouette in a
   Worker; no native image library and no browser canvas are involved. */
export function decodeCocoRle(value: unknown): ProductMask | null {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate); } catch { return null; }
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
