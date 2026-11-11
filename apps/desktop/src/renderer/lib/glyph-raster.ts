import type { FabricText } from "fabric";

export function inkBounds(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Text measurement is unavailable.");
  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] < 32) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x1 < x0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** D22: preserve italic overhangs and detached accents, with a bounded allocation. */
export function rasterizeGlyphs(text: FabricText) {
  const padding = Math.ceil(Math.max(64, text.fontSize));
  const width = Math.ceil(text.width + padding * 2);
  const height = Math.ceil(text.height + padding * 2);
  if (!Number.isFinite(width + height) || width <= 0 || height <= 0 || width > 16384 || height > 16384 || width * height > 4_000_000) {
    throw new Error("The text region exceeds the glyph measurement limit.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Text measurement is unavailable.");
  const transform = { left: text.left, top: text.top, scaleX: text.scaleX, scaleY: text.scaleY, angle: text.angle };
  try {
    text.set({ left: padding, top: padding, scaleX: 1, scaleY: 1, angle: 0 });
    text.render(ctx);
    const bounds = inkBounds(canvas);
    if (!bounds) { canvas.width = canvas.height = 0; return null; }
    return { canvas, bounds, offsetX: bounds.x - padding, offsetY: bounds.y - padding };
  } catch (error) {
    canvas.width = canvas.height = 0;
    throw error;
  } finally { text.set(transform); }
}

/** The ranker and the emitted object must apply the same bounded transform.
 *  Anisotropic fill is allowed only within 1.25x (beyond that glyphs look
 *  broken); otherwise the scale is uniform and the ink letterboxes its box,
 *  exactly the shipped D22 geometry. */
export function glyphScale(ink: { width: number; height: number }, target: { width: number; height: number }) {
  const scaleX = target.width / ink.width, scaleY = target.height / ink.height;
  if (![scaleX, scaleY].every(v => Number.isFinite(v) && v > 0)) {
    throw new Error("The text box cannot size its glyphs. Review the recognized region.");
  }
  const ratio = Math.max(scaleX, scaleY) / Math.min(scaleX, scaleY);
  if (ratio <= 1.25) return { scaleX, scaleY };
  const uniform = Math.min(scaleX, scaleY);
  return { scaleX: uniform, scaleY: uniform };
}
