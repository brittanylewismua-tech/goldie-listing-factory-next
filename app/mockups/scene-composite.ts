/* The deterministic compositor behind the editor.

   ONE function draws both the on-screen preview and the full-resolution export.
   That is deliberate: if the preview used a different path from the export, a
   seller could approve something the export would not reproduce. The only
   difference between them is the canvas size passed in.

   The source photograph is drawn exactly once and never read back into a model.
   No generative endpoint is involved at any point in this file - the artwork is
   warped onto the photo with canvas maths and nothing else. */
import type { PlacementTransform, Quad, RenderingMode, BlendMode } from "./placement-profile.ts";

const BLEND: Record<BlendMode, GlobalCompositeOperation> = {
  "normal": "source-over", "multiply": "multiply", "screen": "screen",
  "overlay": "overlay", "soft-light": "soft-light",
};

type Pixels = { width: number; height: number };

function pixelQuad(corners: Quad, size: Pixels) {
  return corners.map(([x, y]) => [x * size.width, y * size.height] as [number, number]);
}

function bilinear(quad: Array<[number, number]>, u: number, v: number): [number, number] {
  const [tl, tr, br, bl] = quad;
  const topX = tl[0] + (tr[0] - tl[0]) * u, topY = tl[1] + (tr[1] - tl[1]) * u;
  const bottomX = bl[0] + (br[0] - bl[0]) * u, bottomY = bl[1] + (br[1] - bl[1]) * u;
  return [topX + (bottomX - topX) * v, topY + (bottomY - topY) * v];
}

/* Cylindrical wrap. Horizontal position is eased toward the centre so the design
   compresses at the edges the way it does on a mug turning away from the camera.
   `curvature` 0 is flat; higher values wrap harder. */
function wrapAcross(mode: RenderingMode, curvature: number) {
  if (mode !== "cylindrical" || curvature <= 0) return (u: number) => u;
  return (u: number) => {
    const centred = (u - .5) * 2;
    const eased = Math.sin(centred * (Math.PI / 2) * Math.min(1, curvature + .55)) / Math.sin((Math.PI / 2) * Math.min(1, curvature + .55));
    return eased / 2 + .5;
  };
}

/* The artwork on its own transparent layer, warped into the destination quad.
   Kept separate from the photograph so shading can be applied to ink alone. */
function inkLayer(artwork: CanvasImageSource & Pixels, transform: PlacementTransform, mode: RenderingMode, size: Pixels) {
  const canvas = document.createElement("canvas");
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext("2d")!;
  const quad = pixelQuad(transform.corners, size);
  const across = wrapAcross(mode, transform.curvature);

  // Flip and rotation are applied to the source sampling, so the destination
  // quad the seller dragged stays exactly where they put it.
  const sourceAt = (u: number, v: number) => {
    let su = transform.flipX ? 1 - u : u, sv = transform.flipY ? 1 - v : v;
    su += transform.skewX * (sv - .5);
    sv += transform.skewY * (su - .5);
    if (transform.rotation) {
      const a = (transform.rotation * Math.PI) / 180;
      const cx = su - .5, cy = sv - .5;
      su = .5 + cx * Math.cos(a) - cy * Math.sin(a);
      sv = .5 + cx * Math.sin(a) + cy * Math.cos(a);
    }
    return [su * artwork.width, sv * artwork.height] as [number, number];
  };

  const COLUMNS = mode === "cylindrical" ? 28 : 14, ROWS = 16;
  ctx.save();
  ctx.beginPath();
  quad.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.clip();
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLUMNS; x++) {
    const u = x / COLUMNS, U = (x + 1) / COLUMNS, v = y / ROWS, V = (y + 1) / ROWS;
    const s00 = sourceAt(across(u), v), s10 = sourceAt(across(U), v), s01 = sourceAt(across(u), V);
    const d00 = bilinear(quad, u, v), d10 = bilinear(quad, U, v), d01 = bilinear(quad, u, V);
    const sw = s10[0] - s00[0] || .0001, sh = s01[1] - s00[1] || .0001;
    ctx.save();
    ctx.beginPath();
    const d11 = bilinear(quad, U, V);
    ctx.moveTo(d00[0], d00[1]); ctx.lineTo(d10[0], d10[1]); ctx.lineTo(d11[0], d11[1]); ctx.lineTo(d01[0], d01[1]);
    ctx.closePath(); ctx.clip();
    ctx.transform((d10[0] - d00[0]) / sw, (d10[1] - d00[1]) / sw, (d01[0] - d00[0]) / sh, (d01[1] - d00[1]) / sh,
      d00[0] - ((d10[0] - d00[0]) / sw) * s00[0] - ((d01[0] - d00[0]) / sh) * s00[1],
      d00[1] - ((d10[1] - d00[1]) / sw) * s00[1] - ((d01[1] - d00[1]) / sh) * s00[1]);
    ctx.drawImage(artwork, 0, 0);
    ctx.restore();
  }
  ctx.restore();
  return canvas;
}

/* The apparel treatment. The garment's own luminance - its wrinkles, folds,
   shadows and highlights - is multiplied into the ink, and ONLY into the ink.
   The artwork keeps its colour; it does not get faded. This is why opacity is
   not the fabric control: dropping opacity makes ink look thin and washed out,
   whereas borrowing luminance makes it look printed on cloth. */
function shadeWithFabric(ink: HTMLCanvasElement, photo: CanvasImageSource, strength: number, size: Pixels) {
  if (strength <= 0) return;
  const shade = document.createElement("canvas");
  shade.width = size.width; shade.height = size.height;
  const ctx = shade.getContext("2d")!;
  ctx.drawImage(photo, 0, 0, size.width, size.height);
  // Grey the garment so only its light and shade carry, not its colour.
  ctx.globalCompositeOperation = "saturation";
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size.width, size.height);

  const inkCtx = ink.getContext("2d")!;
  inkCtx.save();
  inkCtx.globalCompositeOperation = "multiply";
  inkCtx.globalAlpha = Math.min(1, Math.max(0, strength));
  inkCtx.drawImage(shade, 0, 0);
  // Multiply also darkens where the ink is transparent; restore the alpha shape
  // so nothing bleeds outside the artwork.
  inkCtx.globalCompositeOperation = "destination-in";
  inkCtx.globalAlpha = 1;
  inkCtx.drawImage(ink, 0, 0);
  inkCtx.restore();
}

export type CompositeInput = {
  photo: CanvasImageSource & Pixels;
  artwork: CanvasImageSource & Pixels;
  transform: PlacementTransform;
  mode: RenderingMode;
  /* Parts of the photograph that belong in FRONT of the artwork - a hood, hair,
     a mug handle. Drawn last, from the original photo, so the design passes
     underneath them. */
  foreground?: CanvasImageSource | null;
  /* Export passes the photo's true size; the editor passes its preview size. */
  width?: number;
  height?: number;
};

export function composite({ photo, artwork, transform, mode, foreground, width, height }: CompositeInput): HTMLCanvasElement {
  const size = { width: width || photo.width, height: height || photo.height };
  const canvas = document.createElement("canvas");
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 1. the photograph, once, untouched
  ctx.drawImage(photo, 0, 0, size.width, size.height);

  // 2. the artwork, warped onto its own layer
  const ink = inkLayer(artwork, transform, mode, size);

  // 3. fabric shading, on the ink alone
  if (mode === "fabric") shadeWithFabric(ink, photo, transform.fabricStrength, size);

  // 4. the ink onto the photograph
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, transform.opacity));
  ctx.globalCompositeOperation = BLEND[transform.blendMode] || "source-over";
  ctx.drawImage(ink, 0, 0);
  ctx.restore();

  // 5. anything that belongs in front
  if (foreground) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(foreground, 0, 0, size.width, size.height);
    ctx.restore();
  }
  return canvas;
}

/* Export always renders from the ORIGINAL photograph and the ORIGINAL artwork
   plus stored settings - never from an already-composited image - so repeated
   saves cannot accumulate resolution loss or compression artifacts. */
export async function exportComposite(input: CompositeInput, type = "image/jpeg", quality = .95): Promise<Blob> {
  const canvas = composite({ ...input, width: input.photo.width, height: input.photo.height });
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("The mockup could not be exported.")), type, quality));
}
