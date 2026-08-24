"use client";

// Where the actual artwork sits inside a design file, and how to hand a renderer
// the artwork on its own.
//
// Designs arrive as print-ready PNGs, which almost always carry transparent
// margin around the art. Printify already accounts for this: when Goldie builds
// a draft it sends these bounds along, and printAreasWithOnlyCurrentArtwork
// divides the template's scale by the artwork's fractional width and recentres
// on the artwork's centroid - so the *art*, not the padded canvas, fills the
// print area the template intended.
//
// The mockup renderers had no such compensation. Both were handed the padded
// file: the AI renderer matched the reference against a canvas that was mostly
// empty space, and rigid() mapped the whole padded canvas onto the calibrated
// quad and then scaled it to 42% on top of that. Either way the art came out
// smaller than the Printify template placed it, which is the one thing a
// lifestyle mockup must not get wrong.
//
// Trimming to these bounds is the same correction Printify performs, applied at
// the only other place the design gets drawn.

export type ArtworkBounds = { left: number; top: number; right: number; bottom: number };

export const FULL_BLEED: ArtworkBounds = { left: 0, top: 0, right: 1, bottom: 1 };

// Matches the tolerance Goldie uses to label a design "trimmed" for the customer.
export function isFullBleed(bounds: ArtworkBounds) {
  return bounds.left <= 0.015 && bounds.top <= 0.015 && bounds.right >= 0.985 && bounds.bottom >= 0.985;
}

export type ArtworkScan = { bounds: ArtworkBounds; hasTransparency: boolean };

// Scanned at 512px: enough to locate the art, cheap enough to run on every
// upload. Bounds come back normalised so they can be applied at full size.
export async function scanArtwork(file: File, name = file.name): Promise<ArtworkScan> {
  if (!/\.png$/i.test(name)) return { bounds: FULL_BLEED, hasTransparency: false };
  try {
    const bitmap = await createImageBitmap(file, { resizeWidth: 512, resizeHeight: 512, resizeQuality: "low" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1, hasTransparency = false;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];
      if (alpha < 250) hasTransparency = true;
      if (alpha > 8) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
    if (right < 0) return { bounds: FULL_BLEED, hasTransparency };
    return {
      bounds: {
        left: left / canvas.width,
        top: top / canvas.height,
        right: (right + 1) / canvas.width,
        bottom: (bottom + 1) / canvas.height,
      },
      hasTransparency,
    };
  } catch {
    return { bounds: FULL_BLEED, hasTransparency: true };
  }
}

// The design with its transparent margin removed, at full resolution.
// Returns the original file when there is nothing to trim, so a full-bleed
// design is never re-encoded.
export async function trimToArtwork(file: File, precomputed?: ArtworkBounds): Promise<File> {
  const bounds = precomputed ?? (await scanArtwork(file)).bounds;
  if (isFullBleed(bounds)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const left = Math.round(bounds.left * bitmap.width);
    const top = Math.round(bounds.top * bitmap.height);
    const width = Math.max(1, Math.round((bounds.right - bounds.left) * bitmap.width));
    const height = Math.max(1, Math.round((bounds.bottom - bounds.top) * bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, left, top, width, height, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return file;
    return new File([blob], file.name, { type: "image/png" });
  } catch {
    // A mockup drawn from the untrimmed file is worse than one from the trimmed
    // file, but it is far better than no mockup at all.
    return file;
  }
}
