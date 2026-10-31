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

/** Shared aspect tolerance — the variant-tray stretch warning and the 9:16
 * live-guide eligibility must agree on what "same ratio" means (live-overlay-presets.md LV-6). */
export const ASPECT_TOLERANCE = 0.05;

const NINE_SIXTEEN = 9 / 16;

/** Live safe-zone guides assume a 9:16 stage (1080×1920) — showing them on a
 * 3:4 poster would be a lie, so the toggle refuses (CUJ 4). */
export function isNineSixteen(w: number, h: number): boolean {
  if (w <= 0 || h <= 0) return false;
  return Math.abs(w / h - NINE_SIXTEEN) / NINE_SIXTEEN <= ASPECT_TOLERANCE;
}
