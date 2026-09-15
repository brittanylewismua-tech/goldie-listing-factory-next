/**
 * NORMALIZATION MUST NOT CHANGE THE DESIGN.
 *
 * Every field the scanner extracts — layout, text-to-art ratio, composition
 * density, print-area coverage — is a statement about proportion. Stretching
 * a 4:1 banner into a square would make every one of those statements false
 * before the model ever saw the picture, and cropping would delete the part
 * of the design that ran off the edge.
 *
 * So the artwork keeps its aspect ratio and the canvas is padded around it.
 * The padding is recorded, so the fraction of the frame that is real artwork
 * is known rather than guessed.
 *
 * THE ORIGINAL FILE IS PRESERVED SEPARATELY AND UNCHANGED. Everything here
 * describes a derived analysis copy.
 */
export type Placement = {
  canvas: number;
  drawWidth: number; drawHeight: number;
  offsetX: number; offsetY: number;
  scale: number;
  /* How much of the analysis image is artwork rather than padding. Anything
     reading coverage off this image has to divide by it. */
  artworkShare: number;
};

export function placeOnCanvas(width: number, height: number, canvas = 768): Placement {
  if (!(width > 0) || !(height > 0))
    return { canvas, drawWidth: canvas, drawHeight: canvas, offsetX: 0, offsetY: 0, scale: 1, artworkShare: 1 };
  /* Never scale up: enlarging a small file invents detail that the model
     would then describe as if it were in the artwork. */
  const scale = Math.min(canvas / width, canvas / height, 1);
  const drawWidth = Math.max(1, Math.round(width * scale));
  const drawHeight = Math.max(1, Math.round(height * scale));
  return {
    canvas, drawWidth, drawHeight,
    offsetX: Math.floor((canvas - drawWidth) / 2),
    offsetY: Math.floor((canvas - drawHeight) / 2),
    scale,
    artworkShare: (drawWidth * drawHeight) / (canvas * canvas),
  };
}

/**
 * TWO GROUNDS IN ONE IMAGE.
 *
 * A white design on transparency disappears on a white canvas, and a black
 * one disappears on a black canvas. Either way the model is shown an empty
 * square and reports, correctly, that it contains nothing — the single worst
 * failure available to this feature, because print files for dark garments
 * are overwhelmingly white.
 *
 * The analysis image therefore carries the same artwork twice, side by side,
 * on a controlled light ground and a controlled dark one. Whatever vanishes
 * on one half is plainly visible on the other, and the model is told that the
 * two halves are one design, not two.
 *
 * Mid-greys are used rather than pure white and black so that a design
 * containing genuine white AND genuine black still shows an edge on both.
 */
export const LIGHT_GROUND = "#f2f2f2";
export const DARK_GROUND = "#2b2b2b";

export type AnalysisLayout = {
  width: number; height: number;
  panels: Array<{ ground: string; x: number; y: number; width: number; height: number }>;
  placement: Placement;
  /* Only produced for artwork that actually carries transparency — an opaque
     JPEG gains nothing from being shown twice and would double the image
     tokens for no reason. */
  doubled: boolean;
};

export function analysisLayout(
  { width, height, hasAlpha }: { width: number; height: number; hasAlpha: boolean },
  panel = 768,
): AnalysisLayout {
  const placement = placeOnCanvas(width, height, panel);
  if (!hasAlpha)
    return {
      width: panel, height: panel,
      panels: [{ ground: LIGHT_GROUND, x: 0, y: 0, width: panel, height: panel }],
      placement, doubled: false,
    };
  /*
    Side by side at half width each, so the finished analysis image is the
    same 768x768 as an opaque one and costs the same ~786 image tokens. The
    artwork is drawn smaller, but a design has to survive a thumbnail anyway —
    that is one of the fields being measured.
  */
  const half = Math.floor(panel / 2);
  return {
    width: panel, height: panel,
    panels: [
      { ground: LIGHT_GROUND, x: 0, y: 0, width: half, height: panel },
      { ground: DARK_GROUND, x: half, y: 0, width: panel - half, height: panel },
    ],
    placement: placeOnCanvas(width, height, half),
    doubled: true,
  };
}

/* Image tokens are charged by area. Stated here so the cost model and the
   thing being billed cannot drift apart silently. */
export const imageTokens = (width: number, height: number) => Math.ceil((width * height) / 750);

/**
 * WHAT THE BROWSER CAN ACTUALLY DECODE.
 *
 * HEIC is the iPhone default and Chrome, Firefox and Edge do not decode it in
 * canvas. Safari does. A member on an Android phone or a desktop browser who
 * uploads a HEIC from their photo library gets a blank canvas — silently, with
 * no error — unless this is checked before drawing.
 *
 * The check is a real decode of a tiny file rather than a user-agent guess,
 * because user-agent strings are wrong constantly and this has a cheap
 * ground truth available.
 */
export type DecodeSupport = { heic: boolean; webp: boolean; checked: boolean };

export const HEIC_FALLBACK_MESSAGE =
  "This browser cannot read HEIC photos. Upload the design as PNG or JPEG, "
  + "or on iPhone set Camera to Most Compatible and try again.";

/** Does this look like a HEIC/HEIF file, whatever the extension claims? */
export function looksLikeHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const brand = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (brand !== "ftyp") return false;
  const kind = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return ["heic", "heix", "hevc", "heim", "heis", "hevm", "mif1", "msf1"].includes(kind);
}
