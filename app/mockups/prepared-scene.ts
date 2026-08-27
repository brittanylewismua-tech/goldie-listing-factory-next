import { printAreaBounds, productSurfaceFamily } from "../mockup-compatibility.ts";
import type { PrintSide } from "../placement-math.ts";

/* D580 changed what preparation produces: a validated reading is no longer
   discarded when an optional, unread asset fails to arrive. Every stored version
   1 record was produced by the code that discarded them, so all 19 of her scenes
   carry a derived fallback that the current code would not have produced.
   Bumping this invalidates them and re-reads each scene the next time it is
   used - which is exactly the migration path that already exists and cannot
   fail. */
export const SCENE_PREPARATION_VERSION = 13;

export type SceneGeometry = "flat" | "perspective" | "cylindrical" | "flexible" | "irregular";
export type NormalizedPoint = [number, number];
export type ScenePreparation = {
  version: number;
  status: "ready";
  productFamily: string;
  geometry: SceneGeometry;
  printSide: PrintSide;
  corners: [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint];
  productBox?: ProductBox;
  productBoundsVerified?: boolean;
  productSilhouetteVerified?: boolean;
  /* D606 - where the print-area corners came from: matched against the product
     silhouette, read by the analyser alone, or computed blind from the product
     box. Only the last is an emergency. */
  cornersSource?: "silhouette" | "analyser" | "computed";
  occluded: boolean;
  surfaceMaskKey?: string;
  occlusionKey?: string;
  /* D600 - a hoodie can have a hood AND hair AND a drawstring across the chest
     at once. One mask cannot hold three unrelated objects, so every isolated
     foreground layer is kept. occlusionKey stays as the first of these so
     anything reading a single layer keeps working. */
  occlusionKeys?: string[];
  /* Which foreground classes were looked for and which were actually isolated.
     Recorded so a scene can be answered for without re-running the analyser. */
  occlusionClasses?: Record<string, boolean>;
  /* D601 - the print side the analyser read from the photograph, recorded
     alongside the side actually in use. Not yet authoritative: changing a
     scene's side rekeys its saved placements, so the disagreement is measured
     before it is acted on. */
  analyserSide?: PrintSide | null;
  /* D602 - occluded above is now what was ISOLATED. This is what the analyser
     predicted, kept beside it so the gate's accuracy stays measurable. */
  analyserOccluded?: boolean;
  depthKey?: string;
  /* D577 - true when the surface was computed from product geometry rather than
     read from this photograph. The scene is ready either way. */
  derived?: boolean;
  preparedAt: string;
};

const sides = new Set<PrintSide>(["front", "back", "left-sleeve", "right-sleeve", "wrap", "other"]);
const geometries = new Set<SceneGeometry>(["flat", "perspective", "cylindrical", "flexible", "irregular"]);

function finiteFraction(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -.05 && value <= 1.05;
}

export function normalizedProductBox(value: unknown): ProductBox | null {
  const candidate = value as Partial<ProductBox> | null | undefined;
  if (!candidate || !finiteFraction(candidate.left) || !finiteFraction(candidate.top)
    || !finiteFraction(candidate.right) || !finiteFraction(candidate.bottom)) return null;
  const box = {
    left: Math.max(0, candidate.left), top: Math.max(0, candidate.top),
    right: Math.min(1, candidate.right), bottom: Math.min(1, candidate.bottom),
  };
  if (box.right - box.left < .08 || box.bottom - box.top < .08) return null;
  return box;
}

export function boxFromCxCyWh(value: unknown): ProductBox | null {
  if (!Array.isArray(value) || value.length < 4 || !value.slice(0, 4).every(finiteFraction)) return null;
  const [cx, cy, width, height] = value as number[];
  return normalizedProductBox({ left: cx - width / 2, top: cy - height / 2, right: cx + width / 2, bottom: cy + height / 2 });
}

export function cornersStayOnProduct(corners: ScenePreparation["corners"], box: ProductBox, tolerance = .015) {
  const inside = ([x, y]: NormalizedPoint) => x >= box.left - tolerance && x <= box.right + tolerance
    && y >= box.top - tolerance && y <= box.bottom + tolerance;
  if (!corners.every(inside)) return false;
  const centre: NormalizedPoint = [corners.reduce((sum, point) => sum + point[0], 0) / 4, corners.reduce((sum, point) => sum + point[1], 0) / 4];
  return inside(centre);
}

/* D601 - what the analyser SAW is not the same thing as whether its print-area
   quad survived validation, and the two must not share a fate.

   normalizeSceneAnalysis returns null on eight separate geometric checks. Each
   of those returns was also discarding the model's reading of the photograph -
   whether a hood crosses the chest, which side is facing the camera - because
   those facts happened to travel in the same object as the corners. A quad one
   percent too wide erased the knowledge that the design must pass under a hood.

   D600 fixed the caller that read this. This fixes the source: the observation
   is extracted before any corner is validated, so it survives regardless. */
export type SceneObservation = { occluded: boolean; side: PrintSide | null; geometry: SceneGeometry | null };

export function readSceneObservation(value: unknown): SceneObservation {
  const candidate = value as { side?: unknown; geometry?: unknown; occluded?: unknown };
  return {
    occluded: Boolean(candidate?.occluded),
    side: sides.has(candidate?.side as PrintSide) ? candidate.side as PrintSide : null,
    geometry: geometries.has(candidate?.geometry as SceneGeometry) ? candidate.geometry as SceneGeometry : null,
  };
}

/* D608 - a product box that cannot be a product.

   Scene 04 of her poster set contains a large blank frame on the wall and a
   small already-printed "ciao bella" frame in the bottom corner. The analyser
   picked the decoy, its corners failed validation, and the blind fallback then
   computed a print area from that box: 14% wide, 15% tall, jammed against the
   bottom-right edge of the photograph. The design would have printed onto the
   decor.

   A believable printable surface in a mockup photograph is not a scrap in a
   corner. This does not guess where the product is - it refuses a box that
   cannot be one, so the fallback centres instead of committing to nonsense. */
/* D609 - a photographed surface almost never gives perfectly equal coordinates.

   Measured across her five poster scenes: four came back with all four corners
   sharing an x or y with a neighbour, including a frame leaning visibly against
   a wall. A perfectly upright rectangle is what a model returns when it has
   given a bounding box instead of reading the corners, so it is treated as a
   suspicion worth one more question - not as an answer, and not as an error. */
export function isUprightRectangle(corners: ScenePreparation["corners"] | undefined | null) {
  if (!corners || corners.length !== 4) return false;
  const [tl, tr, br, bl] = corners;
  return tl[1] === tr[1] && bl[1] === br[1] && tl[0] === bl[0] && tr[0] === br[0];
}

export function believableProductBox(box: ProductBox | null | undefined) {
  if (!box) return false;
  const width = box.right - box.left, height = box.bottom - box.top;
  if (width <= 0 || height <= 0) return false;
  if (width * height < .06) return false;
  const touching = [box.left <= .01, box.top <= .01, box.right >= .99, box.bottom >= .99].filter(Boolean).length;
  /* Hugging two or more edges at once is a corner scrap, not a photographed
     product. One edge is ordinary: garments and posters are often cropped. */
  return touching < 2;
}

export function normalizeSceneAnalysis(value: unknown, productName: string, detectedProductBox?: ProductBox | null) {
  const candidate = value as { corners?: unknown; productBox?: unknown; side?: unknown; geometry?: unknown; occluded?: unknown };
  if (!Array.isArray(candidate?.corners) || candidate.corners.length !== 4) return null;
  if (!candidate.corners.every(point => Array.isArray(point) && point.length === 2 && finiteFraction(point[0]) && finiteFraction(point[1]))) return null;
  const corners = candidate.corners.map(point => [Math.min(1, Math.max(0, point[0])), Math.min(1, Math.max(0, point[1]))] as NormalizedPoint) as ScenePreparation["corners"];
  const xs = corners.map(point => point[0]), ys = corners.map(point => point[1]);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  const top = Math.min(...ys), centreY = top + height / 2, bounds = printAreaBounds(productName);
  if (width < bounds.minWidth || width > bounds.maxWidth || height < bounds.minHeight || height > bounds.maxHeight) return null;
  if (centreY < bounds.minCentreY || centreY > bounds.maxCentreY) return null;
  if ((width / Math.max(.001, height)) > bounds.maxRatio || (height / Math.max(.001, width)) > bounds.maxRatio) return null;
  const productBox = detectedProductBox || normalizedProductBox(candidate.productBox);
  if (!productBox || !cornersStayOnProduct(corners, productBox)) return null;
  const side = sides.has(candidate.side as PrintSide) ? candidate.side as PrintSide : "front";
  const family = productSurfaceFamily(productName);
  const fallbackGeometry: SceneGeometry = family === "curved" ? "cylindrical" : family === "apparel" ? "flexible" : "perspective";
  const geometry = geometries.has(candidate.geometry as SceneGeometry) ? candidate.geometry as SceneGeometry : fallbackGeometry;
  return { corners, productBox, productBoundsVerified: true, side, geometry, occluded: Boolean(candidate.occluded), derived: false };
}

export function preparationMatchesProduct(preparation: ScenePreparation | null | undefined, productName: string) {
  if (!preparation || preparation.version !== SCENE_PREPARATION_VERSION || preparation.status !== "ready") return false;
  if (!preparation.productBoundsVerified) return false;
  /* A rectangle is not a product boundary. Keep re-preparing any emergency
     fallback until the surface has actually been read for this photograph.

     D606 - corners the analyser measured and that passed every geometric check
     ARE a reading, even without a silhouette to confirm them against. Treating
     them as an emergency fallback re-ran the whole analysis on every single use
     and never kept the answer. */
  if (!preparation.productSilhouetteVerified && preparation.cornersSource !== "analyser") return false;
  const family = productSurfaceFamily(productName);
  return !preparation.productFamily || !family || preparation.productFamily === family;
}

export function sceneAnalysisPrompt(productName: string) {
  return `Prepare this exact photograph as a reusable print-on-demand mockup scene for ${productName || "the product"}.

Identify the visible PRINTABLE SURFACE, not the whole object. Preserve the product and camera perspective. A garment may be front, back, sleeve, pocket-scale, oversized, folded or partly covered. A mug or tumbler is cylindrical and excludes its handle. A poster, card, case, tote, pillow, blanket or other product uses the visible printable face.

This is a BLANK mockup scene. The printable surface is the empty one waiting for artwork: a plain frame, an unprinted garment, a bare mug. Any object in the photograph that ALREADY carries artwork, a picture, lettering or a pattern is decoration and is never the printable surface, however prominent it is. If several candidates are visible, choose the largest blank one.

The four corners must sit on the actual visible corners of that printable face. If the face is tilted, leaning, angled or seen from the side, its corners DO NOT form an upright rectangle: the top two corners have different heights, the sides have different lengths, and no two corners share an x or y value. Return the true quadrilateral you can see, not the upright box that surrounds it. Only return an upright rectangle when the face really is square to the camera.

First identify the complete visible product boundary as productBox: left, top, right and bottom. Then return four corners of the complete Printify print area as it appears in this photograph, inside that product, ordered top-left, top-right, bottom-right, bottom-left. Use fractions from 0 to 1. Every print-area corner and its centre must stay inside productBox. Do not choose a default centre box. A hoodie print area stays above the pouch pocket. A mug print area stays below the rim and excludes the handle.

Classify geometry as flat, perspective, cylindrical, flexible or irregular. Use perspective whenever the printable face is tilted or angled away from the camera, and flat only when it squarely faces the camera. Classify the visible print side as front, back, left-sleeve, right-sleeve, wrap or other. Set occluded true when a hood, hair, hand, arm, strap, seam flap or another foreground object crosses the printable surface.

Return only compact JSON: {"productBox":{"left":0.1,"top":0.1,"right":0.9,"bottom":0.9},"corners":[[x,y],[x,y],[x,y],[x,y]],"side":"front","geometry":"flexible","occluded":true}`;
}

/* D577 - preparation always terminates in a ready scene.

   Every earlier version had a way to end without one: a validation failure, a
   model that would not answer, a provider that was down. Each of those became a
   scene that could not render, and a scene that cannot render is a seller who
   cannot list. There is no such state any more.

   This is not the old 42% constant wearing a new hat. That number decided where
   the ARTWORK went and overrode Printify. This decides only where the SURFACE
   is - the destination the artwork is mapped into - and Printify still owns the
   artwork's side, scale, position and rotation inside it. A pocket print stays a
   small pocket print on a computed surface exactly as it does on a measured one.

   The geometry is real, not invented: a print area's placement on a product is
   standardised by the blueprint, so given where the product sits in the frame
   the print area follows by arithmetic. */
export type ProductBox = { left: number; top: number; right: number; bottom: number };

export function printAreaWithinProduct(productName: string): { x: number; y: number; width: number; height: number } {
  switch (productSurfaceFamily(productName)) {
    // A chest or back panel: centred, upper torso, a little under half the width.
    case "apparel": return { x: .5, y: .38, width: .42, height: .40 };
    // The face turned toward the camera, clear of the handle and the rim.
    case "curved": return { x: .5, y: .52, width: .46, height: .46 };
    // Printed nearly edge to edge, inset so the design does not bleed off.
    case "flat": return { x: .5, y: .5, width: .92, height: .92 };
    default: return { x: .5, y: .5, width: .72, height: .72 };
  }
}

export function computedSceneCorners(productName: string, productBox?: ProductBox | null): ScenePreparation["corners"] {
  const box = productBox
    && Number.isFinite(productBox.left) && Number.isFinite(productBox.top)
    && Number.isFinite(productBox.right) && Number.isFinite(productBox.bottom)
    && productBox.right > productBox.left && productBox.bottom > productBox.top
    ? productBox
    : { left: .08, top: .08, right: .92, bottom: .92 };
  const boxWidth = box.right - box.left, boxHeight = box.bottom - box.top;
  const area = printAreaWithinProduct(productName);
  const halfWidth = (area.width * boxWidth) / 2, halfHeight = (area.height * boxHeight) / 2;
  const centreX = box.left + area.x * boxWidth, centreY = box.top + area.y * boxHeight;
  const clamp = (value: number) => Math.min(.999, Math.max(.001, value));
  const l = clamp(centreX - halfWidth), r = clamp(centreX + halfWidth);
  const t = clamp(centreY - halfHeight), b = clamp(centreY + halfHeight);
  return [[l, t], [r, t], [r, b], [l, b]];
}

/* The scene that is always produced. `derived` records that the surface came
   from product geometry rather than from reading this photograph, so a render
   can be explained later - but the scene is ready either way. */
export function computedPreparation(productName: string, productBox?: ProductBox | null, side?: PrintSide): ScenePreparation {
  const family = productSurfaceFamily(productName);
  return {
    version: SCENE_PREPARATION_VERSION,
    status: "ready",
    productFamily: family,
    geometry: family === "curved" ? "cylindrical" : family === "apparel" ? "flexible" : "perspective",
    printSide: side && sides.has(side) ? side : "front",
    corners: computedSceneCorners(productName, productBox),
    productBox: normalizedProductBox(productBox) || undefined,
    productBoundsVerified: Boolean(normalizedProductBox(productBox)),
    occluded: false,
    derived: true,
    preparedAt: new Date().toISOString(),
  };
}
