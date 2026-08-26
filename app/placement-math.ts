// Where Printify puts the artwork on the product.
//
// This is the single definition of that answer. The Printify draft uses it to
// build print_areas, and the lifestyle mockup renderer uses it to place the art
// on a calibrated scene - because Brittany's rule is that the mockup placement
// IS the Printify template placement, for a tee, a mug, a tote or anything else
// Printify prints. Two copies of this arithmetic would drift, and the drift
// would show up as mockups that quietly disagree with the customer's listing.
//
// Printify scales the whole uploaded PNG, transparent margin included, so a
// design with padding lands smaller than the template intended. Dividing the
// template's scale by the artwork's fractional width cancels that out, and
// shifting by the artwork's centroid keeps the art centred where the template
// centred it rather than centring the empty canvas.

export type ArtworkBox = { left: number; top: number; right: number; bottom: number };
export type TemplatePlacement = { x?: number; y?: number; scale?: number; angle?: number };
/* D573 - `side` is which Printify print area this placement belongs to: front,
   back, sleeve. It is carried so a back print is rendered onto a back-facing
   photograph instead of being collapsed onto a generic chest position. */
export type PrintSide = "front" | "back" | "left-sleeve" | "right-sleeve" | "wrap" | "other";
export type ResolvedPlacement = { x: number; y: number; scale: number; angle: number; side?: PrintSide };

export function readPrintSide(position?: string): PrintSide {
  const value = String(position || "").toLowerCase();
  if (/back/.test(value)) return "back";
  if (/left[ _-]?sleeve/.test(value)) return "left-sleeve";
  if (/right[ _-]?sleeve/.test(value)) return "right-sleeve";
  if (/sleeve|arm|cuff/.test(value)) return "left-sleeve";
  if (/wrap|around/.test(value)) return "wrap";
  if (/front|chest|pocket/.test(value)) return "front";
  return "other";
}

export function artworkPlacement(
  template: TemplatePlacement | undefined,
  bounds?: ArtworkBox,
  maxPlacementScale?: number,
): ResolvedPlacement {
  const width = Math.max(0.05, (bounds?.right ?? 1) - (bounds?.left ?? 0));
  const centerX = ((bounds?.left ?? 0) + (bounds?.right ?? 1)) / 2;
  const centerY = ((bounds?.top ?? 0) + (bounds?.bottom ?? 1)) / 2;
  const requestedScale = (template?.scale ?? 1) / width;
  const capped = Number.isFinite(maxPlacementScale) && Number(maxPlacementScale) > 0 ? Number(maxPlacementScale) : requestedScale;
  const scale = Math.min(requestedScale, capped);
  return {
    x: (template?.x ?? 0.5) - (centerX - 0.5) * scale,
    y: (template?.y ?? 0.5) - (centerY - 0.5) * scale,
    scale,
    angle: template?.angle ?? 0,
  };
}
