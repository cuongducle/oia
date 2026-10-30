import type { SceneCanvas } from "@oia/schema";

/**
 * Scene artboard size — the clip Rect is the document ground truth (TP.3);
 * fallback matches the banner-mode default the planner uses when no clip exists.
 */
const DEFAULT_W = 1360;
const DEFAULT_H = 2048;

export function sceneDims(canvas: SceneCanvas): { w: number; h: number } {
  const clip = canvas.objects.find((o) => o.name === "clip");
  return { w: clip?.width || DEFAULT_W, h: clip?.height || DEFAULT_H };
}
