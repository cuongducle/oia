import { fabricObjectSchema, type DeconstructText, type FabricObject, type SceneCanvas } from "@oia/schema";
import { dataUrlBytes } from "./data-url.js";

/**
 * D24: the region lane of "Make text editable". The page is exported once
 * (multiplier 1), the chosen scene-space rectangle becomes an integer pixel
 * window of that export, the window is ALL the deconstruct task ever sees
 * (wire unchanged: boxes are fractions of the sent image, D14 untouched), and
 * the result is mapped back onto the live page: cleaned plate over the region,
 * text layers moved from crop pixels to scene units. Objects outside the
 * region keep their pixels; the merge is additive, never a scene swap.
 */

export interface PixelWindow { x: number; y: number; w: number; h: number }

/** Integer crop window of the export for a scene-space region. Rounding can
 *  only shrink the window, it always stays inside the exported PNG. */
export function regionPixelWindow(region: { left: number; top: number; width: number; height: number }, exportW: number, exportH: number, scale: number): PixelWindow {
  const x0 = Math.max(0, Math.min(exportW, Math.round(region.left * scale)));
  const y0 = Math.max(0, Math.min(exportH, Math.round(region.top * scale)));
  const x1 = Math.max(x0, Math.min(exportW, Math.round((region.left + region.width) * scale)));
  const y1 = Math.max(y0, Math.min(exportH, Math.round((region.top + region.height) * scale)));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export type RegionTextEditPlan =
  | { kind: "empty"; note: string }
  | { kind: "apply"; texts: DeconstructText[] };

/** The empty-region contract (D24 gate): no readable text in the window means
 *  the page is NOT touched and no plate is layered on. The read may already be
 *  spent, an image generation never is (empty erase regions restore locally). */
export function planRegionTextEdit(result: { texts?: unknown; note?: unknown }): RegionTextEditPlan {
  const texts = Array.isArray(result.texts) ? (result.texts as DeconstructText[]) : [];
  if (!texts.length) {
    const note = typeof result.note === "string" && result.note ? result.note : "No readable text was found in the selected area. Nothing was changed.";
    return { kind: "empty", note };
  }
  return { kind: "apply", texts };
}

/** Map the crop-space deconstruct scene onto page coordinates: drop the white
 *  artboard clip (objects[0], the live page already has one under everything),
 * put the plate image exactly over the region box, scale every text layer by
 * the same crop-to-scene factors. Angle, fill, spacing, fontSource and
 * recoveredTextLine pass through untouched; boxes are fractions of the crop,
 * so the mapping is exact regardless of export zoom. */
export function regionOverlayObjects(scene: SceneCanvas, region: { left: number; top: number; width: number; height: number }, win: PixelWindow): FabricObject[] {
  if (win.w <= 0 || win.h <= 0) return [];
  const sx = region.width / win.w;
  const sy = region.height / win.h;
  return scene.objects.slice(1).map((o) => {
    const next: Record<string, unknown> = { ...o };
    if (typeof o.left === "number") next.left = region.left + o.left * sx;
    if (typeof o.top === "number") next.top = region.top + o.top * sy;
    if (typeof o.width === "number") next.width = o.width * sx;
    if (typeof o.height === "number" && o.type !== "Textbox") next.height = o.height * sy;
    if (o.type === "Textbox" && typeof o.fontSize === "number") next.fontSize = o.fontSize * sx;
    return fabricObjectSchema.parse(next);
  });
}

/** Crop an integer window out of a PNG data URL. DOM path, exercised end to
 *  end by the shot gate; the coordinate math around it is unit-tested. */
export async function cropPngBytes(dataUrl: string, win: PixelWindow): Promise<Uint8Array> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("The page export could not be read."));
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = win.w;
  canvas.height = win.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The page export could not be cropped.");
  ctx.drawImage(img, win.x, win.y, win.w, win.h, 0, 0, win.w, win.h);
  return dataUrlBytes(canvas.toDataURL("image/png"));
}
