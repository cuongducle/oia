import type { DeconstructText, FabricObject, SceneCanvas } from "@oia/schema";

/**
 * B1 — build the deconstructed scene (deconstruct-import.md DC-6): white clip at
 * the ORIGINAL image size, the cleaned plate as the artwork layer, and one native
 * Textbox per read text line, placed by its normalized box. Pure — no fabric
 * import, no engine change; the editor loads this like any scene.
 */

const TEXT_FILL = "#1f2937";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function deconstructScene(input: { imageUrl: string; w: number; h: number; texts: DeconstructText[] }): SceneCanvas {
  const { imageUrl, w, h, texts } = input;
  const objects: FabricObject[] = [
    { type: "Rect", name: "clip", left: 0, top: 0, width: w, height: h, fill: "white", selectable: false },
    { type: "Image", left: 0, top: 0, width: w, height: h, src: imageUrl, crossOrigin: "anonymous", selectable: true },
  ];
  for (const t of texts) {
    const left = Math.round(t.box.x * w);
    const top = Math.round(t.box.y * h);
    const width = Math.max(24, Math.round(t.box.w * w));
    // Font size from the box height — a starting point the seller tunes for free
    // in the editor; clamped so a stray tiny/huge box never makes unusable text.
    const fontSize = clamp(Math.round(t.box.h * h * 0.75), 12, 200);
    objects.push({
      type: "Textbox",
      text: t.text,
      left,
      top,
      width,
      fontSize,
      fill: TEXT_FILL,
      fontFamily: "Be Vietnam Pro",
      selectable: true,
    });
  }
  return { version: "6.9.1", objects };
}
