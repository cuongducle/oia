/**
 * SG-8 (surgepix-parity-todo.md): non-destructive image crop as a fabric
 * clipPath. Pure math lives here (matrix helpers are local copies of the
 * markup-annotate ones, matrices are plain arrays) so the mapping is unit
 * testable without fabric; the Editor owns the marquee interaction.
 *
 * Why clipPath and not a resize: the original pixels survive (undo is a
 * property change, not a bitmap edit), every export path already renders
 * through fabric so the clip applies everywhere, and serialization is a
 * standard fabric field the scene schema already carries.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Invert a 2D affine matrix [a,b,c,d,e,f] (fabric's layout). */
function invert(m: number[]): number[] {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (!det) return [1, 0, 0, 1, 0, 0];
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

function apply(m: number[], p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/**
 * Canvas-space marquee rect → object-local clipPath rect with originX/Y
 * "center" semantics (fabric positions a non-absolute clipPath relative to the
 * TARGET's center, in its untransformed space, and it rotates/scales along).
 */
export function marqueeToClipRect(marquee: Rect, objectMatrix: number[]): Rect {
  const inv = invert(objectMatrix);
  const p1 = apply(inv, { x: marquee.left, y: marquee.top });
  const p2 = apply(inv, { x: marquee.left + marquee.width, y: marquee.top + marquee.height });
  return {
    left: (p1.x + p2.x) / 2,
    top: (p1.y + p2.y) / 2,
    width: Math.abs(p2.x - p1.x),
    height: Math.abs(p2.y - p1.y),
  };
}

/** Clamp a marquee rect inside bounds, keeping at least `min` px of it. */
export function clampMarquee(rect: Rect, bounds: Rect, min = 8): Rect {
  const width = Math.min(Math.max(min, rect.width), bounds.width);
  const height = Math.min(Math.max(min, rect.height), bounds.height);
  const left = Math.min(Math.max(rect.left, bounds.left), bounds.left + bounds.width - width);
  const top = Math.min(Math.max(rect.top, bounds.top), bounds.top + bounds.height - height);
  return { left, top, width, height };
}

/** The 4 shade rects that darken everything outside the marquee. */
export function shadeRects(marquee: Rect, bounds: Rect): Rect[] {
  return [
    { left: bounds.left, top: bounds.top, width: bounds.width, height: Math.max(0, marquee.top - bounds.top) },
    { left: bounds.left, top: marquee.top + marquee.height, width: bounds.width, height: Math.max(0, bounds.top + bounds.height - marquee.top - marquee.height) },
    { left: bounds.left, top: marquee.top, width: Math.max(0, marquee.left - bounds.left), height: marquee.height },
    { left: marquee.left + marquee.width, top: marquee.top, width: Math.max(0, bounds.left + bounds.width - marquee.left - marquee.width), height: marquee.height },
  ];
}

/** Marker prop on the clipPath rect applyCrop writes. A clip without it is
 *  FOREIGN (some future feature): treated as "no crop" (v1 replace) instead of
 *  guessing geometry, see readableCropClip. Must survive serialization: pinned
 *  by the shot gate reload check (name rides FabricObject.customProperties). */
export const OIA_CROP_CLIP = "oia-crop-clip";

/** The existing clip, but ONLY when it is exactly the shape applyCrop writes
 *  (marker name + center origin + finite numbers). Anything else returns null.
 *  Pure: unit-tested without fabric. */
export function readableCropClip(clip: unknown): Rect | null {
  const c = clip as (Partial<Rect> & { originX?: string; originY?: string; type?: string; name?: string }) | null | undefined;
  if (!c || c.type !== "rect" || c.name !== OIA_CROP_CLIP || c.originX !== "center" || c.originY !== "center") return null;
  if (![c.left, c.top, c.width, c.height].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  return { left: c.left!, top: c.top!, width: c.width!, height: c.height! };
}

/** Center-origin rect (fabric clipPath layout) → top-left rect. */
export function centerRectToTL(r: Rect): Rect {
  return { left: r.left - r.width / 2, top: r.top - r.height / 2, width: r.width, height: r.height };
}

/** Top-left rect → center-origin rect. */
export function tlRectToCenter(r: Rect): Rect {
  return { left: r.left + r.width / 2, top: r.top + r.height / 2, width: r.width, height: r.height };
}

/** Axis-aligned intersection in top-left space; null when disjoint or degenerate. */
export function intersectRect(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right - left <= 0 || bottom - top <= 0) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/** The local-space AABB of a center-origin clip rect mapped through the object
 *  matrix into canvas space. Exact for axis-aligned layers; for rotated layers
 *  the AABB only CLAMPS the marquee, the apply-time local intersection stays exact. */
export function clipWorldAABB(clipCenter: Rect, matrix: number[]): Rect {
  const tl = centerRectToTL(clipCenter);
  const corners: Point[] = [
    { x: tl.left, y: tl.top },
    { x: tl.left + tl.width, y: tl.top },
    { x: tl.left, y: tl.top + tl.height },
    { x: tl.left + tl.width, y: tl.top + tl.height },
  ].map((p) => apply(matrix, p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
