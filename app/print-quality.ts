export type PrintQuality = {
  dpi: number;
  level: "High" | "Medium" | "Low";
};

/**
 * Printify stores its printable area in pixels at 300 DPI and stores artwork
 * scale relative to the width of that area. This mirrors the DPI shown in the
 * Printify editor for an unrotated placement.
 */
export function printifyDpi(imageWidth: number, printAreaWidth: number, placementScale: number): PrintQuality | null {
  if (![imageWidth, printAreaWidth, placementScale].every((value) => Number.isFinite(value) && value > 0)) return null;
  const dpi = Math.floor(imageWidth / ((printAreaWidth / 300) * placementScale));
  return { dpi, level: dpi >= 300 ? "High" : dpi >= 150 ? "Medium" : "Low" };
}

export function normalizedPlacementScale(
  placementScale: number,
  visibleBounds?: { left: number; right: number } | null,
): number {
  if (!visibleBounds) return placementScale;
  const visibleWidth = Math.max(0.05, visibleBounds.right - visibleBounds.left);
  return placementScale / visibleWidth;
}
