import { printAreaBounds, productSurfaceFamily } from "../mockup-compatibility.ts";
import type { PrintSide } from "../placement-math.ts";

export const SCENE_PREPARATION_VERSION = 1;

export type SceneGeometry = "flat" | "perspective" | "cylindrical" | "flexible" | "irregular";
export type NormalizedPoint = [number, number];
export type ScenePreparation = {
  version: number;
  status: "ready";
  productFamily: string;
  geometry: SceneGeometry;
  printSide: PrintSide;
  corners: [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint];
  occluded: boolean;
  surfaceMaskKey?: string;
  occlusionKey?: string;
  depthKey?: string;
  preparedAt: string;
};

const sides = new Set<PrintSide>(["front", "back", "left-sleeve", "right-sleeve", "wrap", "other"]);
const geometries = new Set<SceneGeometry>(["flat", "perspective", "cylindrical", "flexible", "irregular"]);

function finiteFraction(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -.05 && value <= 1.05;
}

export function normalizeSceneAnalysis(value: unknown, productName: string) {
  const candidate = value as { corners?: unknown; side?: unknown; geometry?: unknown; occluded?: unknown };
  if (!Array.isArray(candidate?.corners) || candidate.corners.length !== 4) return null;
  if (!candidate.corners.every(point => Array.isArray(point) && point.length === 2 && finiteFraction(point[0]) && finiteFraction(point[1]))) return null;
  const corners = candidate.corners.map(point => [Math.min(1, Math.max(0, point[0])), Math.min(1, Math.max(0, point[1]))] as NormalizedPoint) as ScenePreparation["corners"];
  const xs = corners.map(point => point[0]), ys = corners.map(point => point[1]);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  const top = Math.min(...ys), centreY = top + height / 2, bounds = printAreaBounds(productName);
  if (width < bounds.minWidth || width > bounds.maxWidth || height < bounds.minHeight || height > bounds.maxHeight) return null;
  if (centreY < bounds.minCentreY || centreY > bounds.maxCentreY) return null;
  if ((width / Math.max(.001, height)) > bounds.maxRatio || (height / Math.max(.001, width)) > bounds.maxRatio) return null;
  const side = sides.has(candidate.side as PrintSide) ? candidate.side as PrintSide : "front";
  const family = productSurfaceFamily(productName);
  const fallbackGeometry: SceneGeometry = family === "curved" ? "cylindrical" : family === "apparel" ? "flexible" : "perspective";
  const geometry = geometries.has(candidate.geometry as SceneGeometry) ? candidate.geometry as SceneGeometry : fallbackGeometry;
  return { corners, side, geometry, occluded: Boolean(candidate.occluded) };
}

export function preparationMatchesProduct(preparation: ScenePreparation | null | undefined, productName: string) {
  if (!preparation || preparation.version !== SCENE_PREPARATION_VERSION || preparation.status !== "ready") return false;
  const family = productSurfaceFamily(productName);
  return !preparation.productFamily || !family || preparation.productFamily === family;
}

export function sceneAnalysisPrompt(productName: string) {
  return `Prepare this exact photograph as a reusable print-on-demand mockup scene for ${productName || "the product"}.

Identify the visible PRINTABLE SURFACE, not the whole object. Preserve the product and camera perspective. A garment may be front, back, sleeve, pocket-scale, oversized, folded or partly covered. A mug or tumbler is cylindrical and excludes its handle. A poster, card, case, tote, pillow, blanket or other product uses the visible printable face.

Return four corners of the complete Printify print area as it appears in this photograph, ordered top-left, top-right, bottom-right, bottom-left. Use fractions from 0 to 1. Do not choose a default centre box.

Classify geometry as flat, perspective, cylindrical, flexible or irregular. Classify the visible print side as front, back, left-sleeve, right-sleeve, wrap or other. Set occluded true when a hood, hair, hand, arm, strap, seam flap or another foreground object crosses the printable surface.

Return only compact JSON: {"corners":[[x,y],[x,y],[x,y],[x,y]],"side":"front","geometry":"flexible","occluded":true}`;
}
