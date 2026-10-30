/**
 * One zoom truth for the whole editor: the +/- steppers, the typed percent
 * and the fit button must all land in the same range or the bar lies to the
 * user (zoomBy capped 2.0 while the input allowed 4.0 — fixed 2026-10-30).
 */
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 2;

export function clampZoom(z: number): number {
  if (Number.isNaN(z)) return MIN_ZOOM; // NaN would poison every comparison — pin to min
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}
