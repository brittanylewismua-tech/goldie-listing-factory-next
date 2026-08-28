/* Stage 1 of the embedded lifestyle-mockup editor.

   The division of responsibility this file exists to enforce:

     The scene tells us WHERE the product surface is in the photograph.
     Printify tells us WHERE ON THAT SURFACE the design belongs, and how big.
     The seller may correct either, and their correction outranks both.

   Everything here is normalized to 0..1 against the source photograph, never
   the editor viewport, so a placement made on a 900px-wide preview reproduces
   exactly on a 4000px export. */
import type { PrintSide, ResolvedPlacement } from "../placement-math.ts";
import { productSurfaceFamily } from "../mockup-compatibility.ts";

export const PLACEMENT_PROFILE_VERSION = 1;

/* How the artwork is mapped onto the surface. Not a physical simulation - a
   choice of renderer, so a mug is not treated as a flat rectangle. */
export type RenderingMode = "planar" | "fabric" | "cylindrical" | "perspective" | "custom";

export type NormalizedPoint = [number, number];
export type Quad = [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint];

export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "soft-light";

export type PlacementTransform = {
  /* The destination the artwork is mapped into, in source-photo fractions.
     Four corners rather than a rectangle because a poster on a wall, a folded
     tee and an angled frame are not axis-aligned. */
  corners: Quad;
  rotation: number;
  skewX: number;
  skewY: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
  blendMode: BlendMode;
  /* How strongly the garment's own luminance, wrinkles and shadows show through
     the ink. This is the apparel treatment - deliberately separate from opacity,
     because dropping opacity makes ink look washed out rather than printed. */
  fabricStrength: number;
  /* Cylindrical products only: how far the artwork wraps around the curve. */
  curvature: number;
};

/* WHAT MAY BE REUSED, and what may not.

   A scene's geometry describes the PHOTOGRAPH: where the printable surface is,
   how it curves, what sits in front of it, and how that surface corresponds to
   Printify's print area. That is true of the scene no matter which design is on
   it, so it is worth remembering and improves every future listing.

   A listing's artwork override describes ONE DESIGN on that scene. Reusing it
   for a different design is the bug that would put a 75% centred print where an
   18% pocket print belonged. It is attached to its listing and never travels.

   Every new design brings its own size, offset, rotation and print side from its
   own Printify placement contract. Goldie maps those onto the saved geometry. */
export type SceneGeometry = {
  version: number;
  sceneId: string;
  productFamily: string;
  blueprintId?: number;
  printProviderId?: number;
  printSide: PrintSide;
  renderingMode: RenderingMode;
  /* The print area as it appears in this photograph. */
  surface: Quad;
  /* How the material is rendered - properties of the scene, not of a design. */
  curvature: number;
  fabricStrength: number;
  blendMode: BlendMode;
  foregroundMaskKey?: string;
  preparationVersion?: number;
  sourceWidth: number;
  sourceHeight: number;
  updatedAt: string;
  origin: "automatic" | "seller-adjusted";
};

/* Stored against one listing and one design. Expressed as adjustments RELATIVE
   to where Printify put this design, never as absolute coordinates, so it stays
   meaningful and stays confined to the design it was made for. */
export type ArtworkOverride = {
  version: number;
  sceneId: string;
  listingId: string;
  offsetU: number;
  offsetV: number;
  scaleMultiplier: number;
  rotation: number;
  skewX: number;
  skewY: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
  updatedAt: string;
};

export const NO_OVERRIDE: Omit<ArtworkOverride, "sceneId" | "listingId" | "updatedAt" | "version"> = {
  offsetU: 0, offsetV: 0, scaleMultiplier: 1, rotation: 0, skewX: 0, skewY: 0,
  flipX: false, flipY: false, opacity: 1,
};

export type PlacementProfile = {
  version: number;
  sceneId: string;
  /* What this profile may legitimately be reused for. A mug profile must never
     be applied to a hoodie, and a front profile must never serve a back print. */
  productFamily: string;
  blueprintId?: number;
  printProviderId?: number;
  printSide: PrintSide;
  renderingMode: RenderingMode;
  transform: PlacementTransform;
  foregroundMaskKey?: string;
  preparationVersion?: number;
  sourceWidth: number;
  sourceHeight: number;
  updatedAt: string;
  /* The whole point of the editor: a seller's correction is a different kind of
     fact from an automatic guess, and must survive contact with automation. */
  origin: "automatic" | "seller-adjusted";
};

export function defaultTransform(corners: Quad, mode: RenderingMode): PlacementTransform {
  return {
    corners, rotation: 0, skewX: 0, skewY: 0, flipX: false, flipY: false,
    /* Normal preserves the uploaded ink colour. Fabric luminance is applied by
       the compositor itself; multiplying the finished ink a second time made
       Reset visibly change its colour. */
    opacity: 1, blendMode: "normal",
    fabricStrength: mode === "fabric" ? .65 : 0,
    curvature: mode === "cylindrical" ? .35 : 0,
  };
}

/* D604 - a tote is not a poster.

   productSurfaceFamily sorts by what a surface is PRINTED like, so every soft
   good that is not a garment - totes, pillows, blankets, aprons, towels - lands
   in "flat" beside posters and phone cases, and rendered as a flat sticker with
   no shading. Their prints sit on cloth that folds and shadows exactly like a
   hoodie's does.

   The analyser's own reading is also honoured now. It classifies geometry as
   flat, perspective, cylindrical, flexible or irregular, and only one of those
   five values was ever read - the same discarded-reading pattern as D601. A
   surface it saw draping is rendered as cloth. */
const FABRIC_GOODS = /tote|bag|backpack|pouch|pillow|cushion|blanket|throw|tapestry|apron|towel|napkin|placemat|duvet|comforter|sheet|curtain|flag|banner/;

export function renderingModeFor(productName: string, geometry?: string): RenderingMode {
  if (geometry === "cylindrical") return "cylindrical";
  const family = productSurfaceFamily(productName);
  /* A rigid surface stays rigid however it drapes in the photograph: glass and
     card do not fold, so a misread there must not start shading them. */
  if (geometry === "flexible" && family !== "curved") return "fabric";
  switch (family) {
    case "apparel": return "fabric";
    case "curved": return "cylindrical";
    case "flat": return FABRIC_GOODS.test((productName || "").toLowerCase()) ? "fabric" : "planar";
    default: return "perspective";
  }
}

/* Two profiles are interchangeable only when the surface AND the print location
   agree. Anything less and a back print lands on a chest. */
export function compatibilityKey(input: {
  sceneId: string; productFamily: string; printSide: PrintSide;
  blueprintId?: number; printProviderId?: number;
}) {
  return [input.sceneId, input.productFamily, input.printSide,
    input.blueprintId ?? "any", input.printProviderId ?? "any"].join("|");
}

export function profileMatches(profile: PlacementProfile | null | undefined, want: {
  sceneId: string; productName: string; printSide: PrintSide;
  blueprintId?: number; printProviderId?: number;
}) {
  if (!profile || profile.version !== PLACEMENT_PROFILE_VERSION) return false;
  if (profile.sceneId !== want.sceneId) return false;
  if (profile.printSide !== want.printSide) return false;
  if (profile.productFamily !== productSurfaceFamily(want.productName)) return false;
  // A blueprint recorded on the profile must not be applied to a different one.
  if (profile.blueprintId !== undefined && want.blueprintId !== undefined
    && profile.blueprintId !== want.blueprintId) return false;
  if (profile.printProviderId !== undefined && want.printProviderId !== undefined
    && profile.printProviderId !== want.printProviderId) return false;
  return true;
}

function quadBounds(corners: Quad) {
  const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
  const left = Math.min(...xs), right = Math.max(...xs);
  const top = Math.min(...ys), bottom = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/* Bilinear point inside the surface quad: (0,0) is its top-left corner and
   (1,1) its bottom-right, following the surface as it appears in the photo. */
export function pointInQuad(corners: Quad, u: number, v: number): NormalizedPoint {
  const [tl, tr, br, bl] = corners;
  const topX = tl[0] + (tr[0] - tl[0]) * u, topY = tl[1] + (tr[1] - tl[1]) * u;
  const bottomX = bl[0] + (br[0] - bl[0]) * u, bottomY = bl[1] + (br[1] - bl[1]) * u;
  return [topX + (bottomX - topX) * v, topY + (bottomY - topY) * v];
}

/* THE contract. `surface` is the prepared scene's print area; `placement` is what
   Printify actually did with this design. The artwork occupies `placement.scale`
   of the print area, centred on Printify's x/y within it - so a pocket print
   stays small and offset, and an oversized print stays oversized. */
export function placeArtworkOnSurface(surface: Quad, placement?: ResolvedPlacement | null): Quad {
  const scale = placement && Number.isFinite(placement.scale) && placement.scale > 0
    ? Math.min(1, Math.max(.01, placement.scale)) : 1;
  const centreU = placement && Number.isFinite(placement.x) ? placement.x : .5;
  const centreV = placement && Number.isFinite(placement.y) ? placement.y : .5;
  const half = scale / 2;
  const u0 = centreU - half, u1 = centreU + half;
  const v0 = centreV - half, v1 = centreV + half;
  return [
    pointInQuad(surface, u0, v0), pointInQuad(surface, u1, v0),
    pointInQuad(surface, u1, v1), pointInQuad(surface, u0, v1),
  ];
}

/* Reusing a saved scene setup for a NEW design: keep the seller's surface, take
   the new design's own Printify size and position within it. */
export function applyProfileToPlacement(profile: PlacementProfile, surface: Quad, placement?: ResolvedPlacement | null): PlacementTransform {
  return { ...profile.transform, corners: placeArtworkOnSurface(surface, placement) };
}

/* Automatic preparation may fill an empty slot. It may never replace a
   correction the seller made by hand. */
export function preferSellerPlacement(
  existing: PlacementProfile | null | undefined,
  incoming: PlacementProfile,
): PlacementProfile {
  if (existing?.origin === "seller-adjusted" && incoming.origin === "automatic") return existing;
  return incoming;
}

/* Shrink the artwork quad until it sits inside the product surface, preserving
   its centre and aspect. "Fit artwork inside the detected product area". */
export function fitWithinSurface(artwork: Quad, surface: Quad): Quad {
  const art = quadBounds(artwork), area = quadBounds(surface);
  if (!art.width || !art.height) return artwork;
  const scale = Math.min(1, area.width / art.width, area.height / art.height);
  const centreX = Math.min(Math.max(art.left + art.width / 2, area.left + (art.width * scale) / 2), area.right - (art.width * scale) / 2);
  const centreY = Math.min(Math.max(art.top + art.height / 2, area.top + (art.height * scale) / 2), area.bottom - (art.height * scale) / 2);
  return artwork.map(([x, y]) => [
    centreX + (x - (art.left + art.width / 2)) * scale,
    centreY + (y - (art.top + art.height / 2)) * scale,
  ] as NormalizedPoint) as Quad;
}

/* Editor viewport -> stored value. The editor may show the photo at any size and
   at any zoom; what is stored is always a fraction of the source photograph, so
   the export reproduces it at full resolution. */
export function toNormalized(point: { x: number; y: number }, viewport: { width: number; height: number }): NormalizedPoint {
  return [point.x / Math.max(1, viewport.width), point.y / Math.max(1, viewport.height)];
}

export function toViewport(point: NormalizedPoint, viewport: { width: number; height: number }) {
  return { x: point[0] * viewport.width, y: point[1] * viewport.height };
}


/* THE composition rule.

   Printify decides size and position. The scene decides where that lands in the
   photograph. A seller's override nudges the result for this listing only. Take
   any one of those away and the other two still mean what they meant. */
export function artworkQuadFor(
  geometry: Pick<SceneGeometry, "surface">,
  placement?: ResolvedPlacement | null,
  override?: Partial<ArtworkOverride> | null,
): Quad {
  const scale = placement && Number.isFinite(placement.scale) && placement.scale > 0
    ? Math.min(1, Math.max(.01, placement.scale)) : 1;
  const adjusted = Math.min(1, Math.max(.01, scale * (override?.scaleMultiplier ?? 1)));
  const centreU = (placement && Number.isFinite(placement.x) ? placement.x : .5) + (override?.offsetU ?? 0);
  const centreV = (placement && Number.isFinite(placement.y) ? placement.y : .5) + (override?.offsetV ?? 0);
  const half = adjusted / 2;
  return [
    pointInQuad(geometry.surface, centreU - half, centreV - half),
    pointInQuad(geometry.surface, centreU + half, centreV - half),
    pointInQuad(geometry.surface, centreU + half, centreV + half),
    pointInQuad(geometry.surface, centreU - half, centreV + half),
  ];
}

/* Turn the composition into what the compositor draws. The scene contributes the
   material settings; the override contributes only this design's adjustments. */
export function transformFor(
  geometry: SceneGeometry,
  placement?: ResolvedPlacement | null,
  override?: Partial<ArtworkOverride> | null,
): PlacementTransform {
  return {
    corners: artworkQuadFor(geometry, placement, override),
    rotation: (placement?.angle ?? 0) + (override?.rotation ?? 0),
    skewX: override?.skewX ?? 0,
    skewY: override?.skewY ?? 0,
    flipX: override?.flipX ?? false,
    flipY: override?.flipY ?? false,
    opacity: override?.opacity ?? 1,
    blendMode: geometry.blendMode,
    fabricStrength: geometry.fabricStrength,
    curvature: geometry.curvature,
  };
}

export function geometryMatches(geometry: SceneGeometry | null | undefined, want: {
  sceneId: string; productName: string; printSide: PrintSide;
  blueprintId?: number; printProviderId?: number;
}) {
  if (!geometry || geometry.version !== PLACEMENT_PROFILE_VERSION) return false;
  if (geometry.sceneId !== want.sceneId) return false;
  if (geometry.printSide !== want.printSide) return false;
  if (geometry.productFamily !== productSurfaceFamily(want.productName)) return false;
  if (geometry.blueprintId !== undefined && want.blueprintId !== undefined
    && geometry.blueprintId !== want.blueprintId) return false;
  if (geometry.printProviderId !== undefined && want.printProviderId !== undefined
    && geometry.printProviderId !== want.printProviderId) return false;
  return true;
}

export function preferSellerGeometry(
  existing: SceneGeometry | null | undefined,
  incoming: SceneGeometry,
): SceneGeometry {
  if (existing?.origin === "seller-adjusted" && incoming.origin === "automatic") return existing;
  return incoming;
}
