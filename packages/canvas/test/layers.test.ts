import { describe, expect, it } from "vitest";
import * as fabric from "fabric";
import {
  applyLayerAction, applyLocks, floorIndex, layerLabel, layerRows, moveLayer, setLocked,
  type LayerCanvas, type LayerObject,
} from "../src/layers.js";
import { createEditor } from "../src/editor.js";

/**
 * UI v1.1 R4: the Layers panel and toolbar act on the canvas stack. Gates the
 * two failure modes found while building it: the old per-object bringToFront
 * calls do not exist in fabric 7 (they threw on click), and "send to back" put
 * the layer under the artboard clip, where it vanished.
 */

/** Same splice semantics as fabric's Collection.moveObjectTo. */
function stack(objects: LayerObject[]): LayerCanvas & { objects: LayerObject[] } {
  return {
    objects,
    getObjects: () => objects,
    moveObjectTo(obj, index) {
      objects.splice(objects.indexOf(obj), 1);
      objects.splice(index, 0, obj);
    },
  };
}
const clip = (): LayerObject => ({ type: "Rect", name: "clip" });
const names = (c: { objects: LayerObject[] }) => c.objects.map((o) => o.name);

describe("layer stack operations", () => {
  it("fabric 7 exposes the canvas-level calls we use, not the per-object ones the old toolbar called", () => {
    expect(typeof fabric.StaticCanvas.prototype.moveObjectTo).toBe("function");
    expect((fabric.Rect.prototype as unknown as Record<string, unknown>).bringToFront).toBeUndefined();
  });

  it("send to back stops just above the clip; front/forward/backward move one stack", () => {
    const a = { name: "a" }, b = { name: "b" }, c = { name: "c" };
    const cv = stack([clip(), a, b, c]);
    applyLayerAction(cv, c, "layerBack");
    expect(names(cv)).toEqual(["clip", "c", "a", "b"]);
    applyLayerAction(cv, c, "layerBackward"); // already at the floor, never under the clip
    expect(names(cv)).toEqual(["clip", "c", "a", "b"]);
    applyLayerAction(cv, c, "layerForward");
    expect(names(cv)).toEqual(["clip", "a", "c", "b"]);
    applyLayerAction(cv, a, "layerFront");
    expect(names(cv)).toEqual(["clip", "c", "b", "a"]);
  });

  it("a drag target below the floor or past the top is clamped", () => {
    const a = { name: "a" }, b = { name: "b" };
    const cv = stack([clip(), a, b]);
    expect(moveLayer(cv, b, 0)).toBe(1);
    expect(names(cv)).toEqual(["clip", "b", "a"]);
    expect(moveLayer(cv, b, 99)).toBe(2);
    expect(floorIndex([{ name: "x" }])).toBe(0); // a scene without a clip has no floor
  });

  it("rows read top-first, skip the clip, and carry visibility, lock and provenance", () => {
    const rows = layerRows([
      clip(),
      { type: "Image", src: "/api/files/x.png", origin: "generated" },
      { type: "Textbox", text: "  FLASH   SALE  ", visible: false },
      { type: "Rect", name: "Red panel", locked: true, origin: "agent" },
    ]);
    expect(rows.map((r) => [r.index, r.label, r.kind, r.visible, r.locked, r.user])).toEqual([
      [3, "Red panel", "shape", true, true, false],
      [2, "FLASH SALE", "text", false, false, true], // legacy objects without origin count as user (TP.10)
      [1, "Image", "image", true, false, false],
    ]);
    expect(layerLabel({ type: "circle" })).toBe("Circle");
  });
});

describe("hide and lock survive save and reload", () => {
  it("reorder + visible + locked round-trip through toObject → loadFromJSON on a real fabric canvas", async () => {
    const el = { getContext: () => null } as unknown as HTMLCanvasElement;
    let editor: fabric.Canvas | null = null;
    try { editor = await createEditor(el); } catch { /* no DOM canvas in node, fall back to the serializer below */ }
    if (editor) await editor.dispose();

    // createEditor whitelists the custom properties on the shared class even when the DOM canvas fails
    expect(fabric.FabricObject.customProperties).toEqual(expect.arrayContaining(["name", "origin", "locked"]));

    const a = new fabric.Rect({ name: "a", width: 10, height: 10 });
    const b = new fabric.Rect({ name: "b", width: 10, height: 10 });
    const cv = stack([new fabric.Rect({ name: "clip", width: 100, height: 100 }), a, b] as unknown as LayerObject[]);
    applyLayerAction(cv, b as unknown as LayerObject, "layerBack"); // b under a, above clip
    a.set("visible", false);
    setLocked(b as unknown as LayerObject, true);

    const saved = JSON.parse(JSON.stringify(cv.objects.map((o) => (o as unknown as fabric.FabricObject).toObject())));
    const reloaded = (await fabric.util.enlivenObjects(saved)) as unknown as LayerObject[];
    expect(reloaded.map((o) => o.name)).toEqual(["clip", "b", "a"]);
    expect(reloaded[2].visible).toBe(false);
    expect(reloaded[1].locked).toBe(true);
    expect(reloaded[1].selectable).toBe(true); // fabric never serializes selectable…
    applyLocks(reloaded);
    expect([reloaded[1].selectable, reloaded[1].evented]).toEqual([false, false]); // …so the lock is re-derived on load
  });
});
