import { fabricObjectSchema, type DeconstructText, type SceneCanvas } from "@oia/schema";
import { deconstructScene } from "./deconstruct-scene.js";
import { fabricV6OriginDefaults } from "@oia/canvas";

export function fitTextMetrics(input: { inkWidth: number; inkHeight: number; targetWidth: number; targetHeight: number; characters: number; spacingEm: number }) {
  const { inkWidth, inkHeight, targetWidth, targetHeight, characters } = input;
  if (inkWidth <= 0 || inkHeight <= 0 || !Number.isFinite(inkWidth + inkHeight)) return { fontSize: 12, charSpacing: 0 };
  let fontSize = Math.max(4, Math.min(600, targetHeight * 100 / inkHeight));
  const gaps = Math.max(0, characters - 1);
  // D22: preserve the height first; shrink if matching width would over-compress letters.
  if (gaps && inkWidth / 100 - gaps * 0.08 > 0) {
    fontSize = Math.min(fontSize, targetWidth / (inkWidth / 100 - gaps * 0.08));
  } else if (!gaps) fontSize = Math.min(fontSize, targetWidth * 100 / inkWidth);
  fontSize = Math.max(4, fontSize);
  const gapEm = gaps ? (targetWidth - inkWidth * fontSize / 100) / (gaps * fontSize) : 0;
  // Do not manufacture widely spaced lettering when the vision read says it is normal.
  const maxGap = Math.max(0.15, Math.min(1, input.spacingEm + 0.15));
  return { fontSize, charSpacing: 1000 * Math.max(-0.08, Math.min(maxGap, gapEm)) };
}

export function inkBounds(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Text measurement is unavailable.");
  const { width: w, height: h } = canvas;
  const { data } = ctx.getImageData(0, 0, w, h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] < 32) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x1 < x0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export interface DeconstructFit { fontSize: number; charSpacing: number; offsetX?: number; offsetY?: number }

/** Measure actual Fabric glyph pixels, including accents, before placing rotated text. */
export async function fittedDeconstructScene(input: { imageUrl: string; w: number; h: number; texts: DeconstructText[]; fits?: Map<number, DeconstructFit> }): Promise<SceneCanvas> {
  const scene = deconstructScene(input);
  if (!input.texts.some((t) => t.typography)) return scene;
  const { FabricText } = await import("fabric");
  fabricV6OriginDefaults();
  for (const [index, t] of input.texts.entries()) {
    if (!t.typography) continue;
    const style = t.typography;
    let family = style.fontFamily;
    const cssFamily = family.includes(" ") ? `"${family}"` : family;
    const descriptor = `${style.fontStyle} ${style.fontWeight} 100px ${cssFamily}`;
    try { await document.fonts.load(descriptor, t.text); } catch { /* Missing system font uses the bundled fallback below. */ }
    if (!document.fonts.check(descriptor, t.text)) {
      family = "Be Vietnam Pro";
      await document.fonts.load(`${style.fontWeight} 100px "${family}"`, t.text);
    }
    const text = new FabricText(t.text, {
      fontFamily: family, fontWeight: style.fontWeight, fontStyle: style.fontStyle,
      fontSize: 48, charSpacing: 0, fill: "#000000", strokeWidth: 0,
      originX: "left", originY: "top", left: 0, top: 0,
    });
    try {
      const sample = text.toCanvasElement();
      const bounds = inkBounds(sample);
      sample.width = sample.height = 0;
      if (!bounds) continue;
      const fit: DeconstructFit = input.fits?.get(index) ?? fitTextMetrics({
        inkWidth: bounds.width * 100 / 48, inkHeight: bounds.height * 100 / 48,
        targetWidth: t.box.w * input.w, targetHeight: t.box.h * input.h,
        characters: Array.from(t.text).length, spacingEm: style.spacingEm,
      });
      text.set({ fontSize: fit.fontSize, charSpacing: fit.charSpacing, fill: style.fill, textAlign: style.textAlign });
      const canvas = text.toCanvasElement();
      const final = inkBounds(canvas);
      if (!final) continue;
      const dx = final.x - (canvas.width - text.width) / 2;
      const dy = final.y - (canvas.height - text.height) / 2;
      canvas.width = canvas.height = 0;
      const rad = style.angle * Math.PI / 180;
      text.set({
        left: t.box.x * input.w + ((fit.offsetX ?? 0) - dx) * Math.cos(rad) - ((fit.offsetY ?? 0) - dy) * Math.sin(rad),
        top: t.box.y * input.h + ((fit.offsetX ?? 0) - dx) * Math.sin(rad) + ((fit.offsetY ?? 0) - dy) * Math.cos(rad),
        angle: style.angle,
      });
      // Single-line Textbox remains compatible with the inspector and text-edit tools.
      scene.objects[index + 2] = fabricObjectSchema.parse({ ...text.toObject(), type: "Textbox", recoveredTextLine: !/[\r\n]/u.test(t.text), width: text.width + 2 });
    } finally { text.dispose(); }
  }
  return scene;
}
