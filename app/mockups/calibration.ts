/* Has a person marked where the print goes on this scene?
 *
 * Every mockup template is created with the same placeholder box - the middle
 * 70% of the photograph - and the Mockup Library has always had a calibrator
 * that replaces it with four clicks. A template still carrying the placeholder
 * has never been calibrated; one that differs from it has been marked by hand.
 *
 * This matters more than it looks. Every professional mockup tool - Placeit,
 * Smartmockups, Printful, any Photoshop PSD template - stores a placement marked
 * once per photo. None of them work out the print surface at render time, because
 * it cannot be done reliably: on a mug the printable face is offset from the
 * handle and foreshortened by the camera angle, and no bounding box describes
 * that. Four clicks do.
 */
export type Corner = [number, number];
export const PLACEHOLDER_QUAD: Corner[] = [[.15, .12], [.85, .12], [.85, .88], [.15, .88]];

export function isCalibratedQuad(corners: Corner[] | undefined, normalized: boolean | undefined) {
  if (!corners || corners.length !== 4) return false;
  // Pixel corners were set deliberately; only normalised ones can be the placeholder.
  if (!normalized) return true;
  return corners.some((point, index) =>
    Math.abs(point[0] - PLACEHOLDER_QUAD[index][0]) > .005 ||
    Math.abs(point[1] - PLACEHOLDER_QUAD[index][1]) > .005);
}
