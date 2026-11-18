import type { SceneCanvas } from "@oia/schema";
import { sceneDims } from "./scene-dims.js";
import { mapAssetUrls } from "../../shared/assets.js";

/**
 * SIL (single-image-loop.md): the loop works on ONE flat image, never a layer
 * scene. The designer pipeline answers with a SceneCanvas, so the loop view
 * renders it once at natural size on an offscreen fabric canvas and hands the
 * PNG data URL to the <img> stage. Same load path as the Home preview
 * (mapAssetUrls → loadFromJSON) and the same export path as Home's exportPng,
 * so oia:// sources stay un-tainted for toDataURL.
 */
export async function flattenScenePng(scene: SceneCanvas): Promise<{ dataUrl: string; width: number; height: number }> {
  const { createEditor } = await import("@oia/canvas");
  const el = document.createElement("canvas");
  const c = (await createEditor(el)) as import("fabric").Canvas;
  try {
    await c.loadFromJSON(mapAssetUrls(scene));
    const { w, h } = sceneDims(scene);
    c.setZoom(1);
    c.setDimensions({ width: w, height: h });
    c.requestRenderAll();
    return { dataUrl: c.toDataURL({ format: "png", multiplier: 1 }), width: w, height: h };
  } finally {
    void c.dispose();
  }
}
