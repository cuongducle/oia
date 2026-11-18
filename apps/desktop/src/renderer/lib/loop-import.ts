/** Import of an existing image as the loop's starting point (the seller's own
 * photo, not a generation). Pure transforms, unit-tested: decode size is
 * caller-provided, downscale is a canvas draw kept out of this module except
 * for the decision itself.
 *
 * Why a cap: the edit round composites and sends the image to the model, a
 * 4000px phone shot would burn quota for pixels the model cannot use. 2048 on
 * the long edge matches the generate path's output scale. */
export const IMPORT_MAX_EDGE = 2048;

export type ImportPlan =
  | { keep: true; width: number; height: number }
  | { keep: false; width: number; height: number };

export function importPlan(width: number, height: number, maxEdge: number = IMPORT_MAX_EDGE): ImportPlan {
  if (width <= 0 || height <= 0) return { keep: true, width: 0, height: 0 };
  const long = Math.max(width, height);
  if (long <= maxEdge) return { keep: true, width, height };
  const s = maxEdge / long;
  return { keep: false, width: Math.round(width * s), height: Math.round(height * s) };
}

export function importableFile(file: File): boolean {
  return /^image\/(png|jpeg|webp)$/.test(file.type);
}
