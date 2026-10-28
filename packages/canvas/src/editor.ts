import * as fabric from "fabric";
import type { SceneCanvas } from "@oia/schema";
import { TEXT_PRESET_SPECS, SHAPES, SIZE_PRESETS, DEFAULT_POSTER, type TextPreset, type ShapeKind, type SizePresetName } from "./presets.js";

/** Fabric wrapper — canvas setup + scene JSON loading. */
export async function createEditor(canvasEl: HTMLCanvasElement, scene?: SceneCanvas) {
  // Artboard identity must survive editor autosave and thumbnail serialization.
  fabric.FabricObject.customProperties = [...new Set([...fabric.FabricObject.customProperties, "name"])];
  const canvas = new fabric.Canvas(canvasEl, {
    preserveObjectStacking: true,
    selection: true,
    backgroundColor: "#f4f4f5",
  });
  if (scene) await loadScene(canvas, scene);
  return canvas;
}

export async function loadScene(canvas: fabric.Canvas, scene: SceneCanvas): Promise<void> {
  await canvas.loadFromJSON(scene);
  canvas.requestRenderAll();
}

export function exportDataUrl(canvas: fabric.Canvas, format: "png" | "jpg" = "png", quality = 0.92): string {
  return canvas.toDataURL({ format, quality, multiplier: 1 } as never);
}

/* ---------------- Text presets (BR-ED1) ---------------- */

export function addTextPreset(canvas: fabric.Canvas, kind: TextPreset, fontFamily = "Arial"): fabric.Textbox {
  const spec = TEXT_PRESET_SPECS[kind];
  const text = new fabric.Textbox(kind === "textbox" ? "" : spec.label, {
    left: (canvas.getWidth() / canvas.getZoom()) * 0.15,
    top: (canvas.getHeight() / canvas.getZoom()) * 0.4,
    width: (canvas.getWidth() / canvas.getZoom()) * 0.7,
    fontFamily,
    fontSize: spec.fontSize,
    fontWeight: spec.fontSize >= 40 ? "bold" : "normal",
    fill: "#18181b",
    textAlign: "center",
    editable: true,
  });
  canvas.add(text);
  canvas.setActiveObject(text);
  canvas.requestRenderAll();
  return text;
}

/* ---------------- Shapes (BR-ED2) ---------------- */

export function addShape(canvas: fabric.Canvas, kind: ShapeKind): fabric.Object {
  const documentWidth = canvas.getWidth() / canvas.getZoom(), documentHeight = canvas.getHeight() / canvas.getZoom();
  const w = Math.round(documentWidth * 0.25);
  const x = documentWidth / 2 - w / 2, y = documentHeight / 2 - w / 2;
  let obj: fabric.Object;
  const stroke = { stroke: "#18181b", strokeWidth: 3, fill: "transparent" } as const;
  switch (kind) {
    case "circle": obj = new fabric.Ellipse({ ...stroke, rx: w / 2, ry: w / 2, left: x, top: y }); break;
    case "rectRounded": obj = new fabric.Rect({ ...stroke, rx: 24, width: w, height: w, left: x, top: y }); break;
    case "rect": obj = new fabric.Rect({ ...stroke, width: w, height: w, left: x, top: y }); break;
    case "triangleUp": obj = new fabric.Triangle({ ...stroke, width: w, height: w, left: x, top: y }); break;
    case "triangleDown": obj = new fabric.Triangle({ ...stroke, width: w, height: w, left: x, top: y, flipY: true }); break;
    case "diamond":
      obj = new fabric.Rect({ ...stroke, width: w, height: w, left: x, top: y, angle: 45 });
      break;
    case "line":
    case "lineDotted":
      obj = new fabric.Line([x, y + w / 2, x + w, y + w / 2], {
        stroke: "#18181b", strokeWidth: 3,
        ...(kind === "lineDotted" ? { strokeDashArray: [6, 6] } : {}),
      });
      break;
    case "arrowRight":
      obj = new fabric.Group(
        [
          new fabric.Line([x, y + w / 2, x + w - 14, y + w / 2], { stroke: "#18181b", strokeWidth: 3 }),
          new fabric.Triangle({ fill: "#18181b", width: 18, height: 18, left: x + w - 16, top: y + w / 2 - 9, angle: 90 }),
        ],
        {},
      );
      break;
    default: throw new Error(`unknown shape: ${kind satisfies never}`);
  }
  canvas.add(obj);
  canvas.setActiveObject(obj);
  canvas.requestRenderAll();
  return obj;
}

/* ---------------- Settings (BR-ED3) ---------------- */

export function applySizePreset(canvas: fabric.Canvas, name: SizePresetName): void {
  const { width, height } = SIZE_PRESETS[name];
  resizeCanvas(canvas, width, height);
}

export function applyPosterDefault(canvas: fabric.Canvas): void {
  resizeCanvas(canvas, DEFAULT_POSTER.width, DEFAULT_POSTER.height);
}

export function resizeCanvas(canvas: fabric.Canvas, width: number, height: number): void {
  const clip = canvas.getObjects().find(o => (o as fabric.Object & { name?:string }).name === "clip");
  if (clip) { clip.set({ width, height }); canvas.fire("object:modified", { target:clip }); }
  canvas.setDimensions({ width, height });
  canvas.requestRenderAll();
}

/* ---------------- Text toolbar (BR-ED4) ---------------- */

export interface TextPropPatch {
  fill?: string; fontFamily?: string; fontSize?: number;
  bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean;
  align?: "left" | "center" | "right"; charSpacing?: number;
}

export function patchSelectedText(canvas: fabric.Canvas, patch: TextPropPatch): void {
  const obj = canvas.getActiveObject() as fabric.Textbox | undefined;
  if (!obj || obj.type !== "textbox") return;
  if (patch.fill !== undefined) obj.set("fill", patch.fill);
  if (patch.fontFamily !== undefined) obj.set("fontFamily", patch.fontFamily);
  if (patch.fontSize !== undefined) obj.set("fontSize", patch.fontSize);
  const weightParts: string[] = [];
  if (patch.bold !== undefined) weightParts.push(patch.bold ? "bold" : "normal");
  const styleParts: string[] = [];
  if (patch.italic !== undefined) styleParts.push(patch.italic ? "italic" : "normal");
  if (weightParts.length) obj.set("fontWeight", weightParts[0]);
  if (styleParts.length) obj.set("fontStyle", styleParts[0]);
  if (patch.underline !== undefined) obj.set("underline", patch.underline);
  if (patch.strike !== undefined) obj.set("linethrough", patch.strike);
  if (patch.align !== undefined) obj.set("textAlign", patch.align);
  if (patch.charSpacing !== undefined) obj.set("charSpacing", patch.charSpacing);
  canvas.fire("object:modified", { target:obj });
  canvas.requestRenderAll();
}

export function duplicateSelected(canvas: fabric.Canvas): void {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  obj.clone().then((cloned: fabric.Object) => {
    cloned.set({ left: (cloned.left ?? 0) + 24, top: (cloned.top ?? 0) + 24 });
    canvas.add(cloned);
    canvas.setActiveObject(cloned);
    canvas.requestRenderAll();
  });
}

export function deleteSelected(canvas: fabric.Canvas): void {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  canvas.remove(obj);
  canvas.requestRenderAll();
}


