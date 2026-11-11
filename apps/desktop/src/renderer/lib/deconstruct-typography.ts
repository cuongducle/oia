import { fabricObjectSchema, type DeconstructText, type SceneCanvas } from "@oia/schema";
import { deconstructScene } from "./deconstruct-scene.js";
import { fabricV6OriginDefaults } from "@oia/canvas";
import { glyphScale, rasterizeGlyphs } from "./glyph-raster.js";
export { inkBounds } from "./glyph-raster.js";

export function fitTextMetrics(input: { inkWidth: number; inkHeight: number; targetWidth: number; targetHeight: number; characters: number; spacingEm: number }) {
  const { inkWidth, inkHeight, targetWidth, targetHeight, characters } = input;
  if (inkWidth <= 0 || inkHeight <= 0 || !Number.isFinite(inkWidth + inkHeight)) return { fontSize: 12, charSpacing: 0 };
  let fontSize = Math.max(4, Math.min(600, targetHeight * 100 / inkHeight));
  const gaps = Math.max(0, characters - 1);
  // D22: preserve the height first; shrink if matching width would over-compress letters.
  if (gaps && inkWidth / 100 - gaps * 0.02 > 0) {
    fontSize = Math.min(fontSize, targetWidth / (inkWidth / 100 - gaps * 0.02));
  } else if (!gaps) fontSize = Math.min(fontSize, targetWidth * 100 / inkWidth);
  fontSize = Math.max(4, fontSize);
  const gapEm = gaps ? (targetWidth - inkWidth * fontSize / 100) / (gaps * fontSize) : 0;
  // Do not manufacture widely spaced lettering when the vision read says it is normal.
  const maxGap = Math.max(0.15, Math.min(1, input.spacingEm + 0.15));
  return { fontSize, charSpacing: 1000 * Math.max(-0.02, Math.min(maxGap, gapEm)) };
}

export interface DeconstructFit { fontSize: number; charSpacing: number; offsetX?: number; offsetY?: number }

/** Measure actual Fabric glyph pixels, including accents, before placing rotated text. */
export async function fittedDeconstructScene(input: { imageUrl: string; w: number; h: number; texts: DeconstructText[]; fits?: Map<number, DeconstructFit> }): Promise<SceneCanvas> {
  const scene = deconstructScene(input);
  if (!input.texts.some((t) => t.typography)) return scene;
  const { FabricText } = await import("fabric");
  fabricV6OriginDefaults();
  for (const [index, t] of input.texts.entries()) {
    if (!t.typography || !t.box.w || !t.box.h) continue;
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
      const sample = rasterizeGlyphs(text);
      if (!sample) continue;
      const bounds = sample.bounds;
      sample.canvas.width = sample.canvas.height = 0;
      const fit: DeconstructFit = input.fits?.get(index) ?? fitTextMetrics({
        inkWidth: bounds.width * 100 / 48, inkHeight: bounds.height * 100 / 48,
        targetWidth: t.box.w * input.w, targetHeight: t.box.h * input.h,
        characters: Array.from(t.text).length, spacingEm: style.spacingEm,
      });
      text.set({ fontSize: fit.fontSize, charSpacing: fit.charSpacing, fill: style.fill, textAlign: style.textAlign });
      const final = rasterizeGlyphs(text);
      if (!final) continue;
      try {
        const { scaleX, scaleY } = glyphScale(final.bounds, { width: t.box.w * input.w, height: t.box.h * input.h });
        const dx = (fit.offsetX ?? 0) - final.offsetX * scaleX;
        const dy = (fit.offsetY ?? 0) - final.offsetY * scaleY;
        const rad = style.angle * Math.PI / 180;
        text.set({
          scaleX, scaleY,
          left: t.box.x * input.w + dx * Math.cos(rad) - dy * Math.sin(rad),
          top: t.box.y * input.h + dx * Math.sin(rad) + dy * Math.cos(rad),
          angle: style.angle,
        });
      } finally { final.canvas.width = final.canvas.height = 0; }
      // Single-line Textbox remains compatible with the inspector and text-edit tools.
      scene.objects[index + 2] = fabricObjectSchema.parse({ ...text.toObject(), type: "Textbox", recoveredTextLine: !/[\r\n]/u.test(t.text), width: text.width + 2 });
    } finally { text.dispose(); }
  }
  return scene;
}
