import type * as fabric from "fabric";

/**
 * Paint-scale normalization for FabricImage objects (deconstruct-import.md
 * teardown find; the fabric source is the authority):
 *
 *   FabricImage._renderFill paints the element at min(object box, element
 *   natural size) — an object that declares a box different from its
 *   element's natural size paints a small patch in the box's corner, NOT a
 *   stretched image (checked against fabric 7.4.0 dist source: maxDestW =
 *   Math.min(w, elWidth / filterScaleX - cropX)).
 *
 * Scenes legitimately declare target boxes without knowing the element's
 * natural size (deconstruct clean plates, "New from image" uploads, variant
 * replaces with a different aspect). Scaling the OBJECT makes the transform
 * matrix stretch the painted patch to the intended box — the box itself
 * (left/top/width/height) never moves.
 */

interface ImageLike {
  get(key: string): unknown;
  set(opts: Record<string, number>): unknown;
  getElement?(): { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number } | undefined;
}

/** Rescale every FabricImage whose paint would not fill its declared box:
 * width/height become the ELEMENT size (what fabric paints), and scaleX/scaleY
 * stretch the paint to the originally declared box (display size preserved).
 * Idempotent — a second pass sees width == natural and skips. */
export function normalizeImageScales(canvas: { getObjects(): unknown[] }): number {
  let fixed = 0;
  for (const raw of canvas.getObjects()) {
    const o = raw as ImageLike;
    const el = o.getElement?.();
    if (!el) continue;
    const nw = el.naturalWidth ?? el.width ?? 0;
    const nh = el.naturalHeight ?? el.height ?? 0;
    const ow = Number(o.get("width") ?? 0);
    const oh = Number(o.get("height") ?? 0);
    const sx = Number(o.get("scaleX") ?? 1) || 1;
    const sy = Number(o.get("scaleY") ?? 1) || 1;
    if (!nw || !nh || !ow || !oh) continue;
    if (nw === ow && nh === oh) continue;
    // display size (box × current scale) is the contract — the paint must fill it
    o.set({ width: nw, height: nh, scaleX: (ow * sx) / nw, scaleY: (oh * sy) / nh });
    fixed++;
  }
  return fixed;
}

/** Type shim so callers can pass a real fabric.Canvas without casts. */
export type ImageScaleCanvas = fabric.Canvas | { getObjects(): unknown[] };
