import { describe, expect, it } from "vitest";
import type { SceneCanvas } from "@oia/schema";
import { planRegionTextEdit, regionOverlayObjects, regionPixelWindow } from "./deconstruct-region.js";

/** D24 gates: the crop window math and the crop-to-page mapping are the two
 *  things a wrong region edit silently corrupts; pin them here, the painted
 *  result is pinned by the shot gate. */

describe("regionPixelWindow", () => {
  it("rounds a scene region to an integer window of the export", () => {
    // export is 2x the scene units: a 12.4..512.4 x 12.4..72.4 region of a 600x200 scene
    const win = regionPixelWindow({ left: 12.4, top: 12.4, width: 500, height: 60 }, 1200, 400, 2);
    expect(win).toEqual({ x: 25, y: 25, w: 1000, h: 120 });
  });

  it("clamps the window inside the exported PNG, never outside", () => {
    const win = regionPixelWindow({ left: -30, top: 700, width: 900, height: 60 }, 1200, 400, 2);
    expect(win.x).toBe(0);
    expect(win.y).toBe(400);
    expect(win.w).toBeLessThanOrEqual(1200);
    expect(win.h).toBe(0);
  });
});

describe("planRegionTextEdit", () => {
  it("no readable text means the page is not touched", () => {
    const plan = planRegionTextEdit({ texts: [], note: "No readable text was found. The original image is unchanged." });
    expect(plan.kind).toBe("empty");
    if (plan.kind === "empty") expect(plan.note).toContain("No readable text");
  });

  it("falls back to an honest note when the task had none", () => {
    const plan = planRegionTextEdit({ texts: [] });
    expect(plan.kind).toBe("empty");
    if (plan.kind === "empty") expect(plan.note).toContain("Nothing was changed");
  });

  it("texts present means apply", () => {
    const plan = planRegionTextEdit({ texts: [{ text: "SALE", box: { x: 0.1, y: 0.1, w: 0.5, h: 0.1 } }] });
    expect(plan.kind).toBe("apply");
  });
});

describe("regionOverlayObjects", () => {
  const scene: SceneCanvas = {
    version: "1",
    objects: [
      { type: "Rect", name: "clip", left: 0, top: 0, width: 1000, height: 120, fill: "white" },
      { type: "Image", left: 0, top: 0, width: 1000, height: 120, src: "oia://plate.png" },
      { type: "Textbox", text: "SALE 50", left: 80, top: 25, width: 550, height: 20, fontSize: 26, angle: 0, fontSource: { family: "Georgia", url: "oia://fonts/georgia.ttf" } },
      { type: "Textbox", text: "299.000₫", left: 100, top: 86, width: 450, height: 16, fontSize: 20, angle: -8 },
    ],
  };
  // The crop was 1000x120 px for a 500x60 scene region at (12, 12): every crop
  // pixel is 0.5 scene units.
  const win = { x: 25, y: 25, w: 1000, h: 120 };
  const region = { left: 12, top: 12, width: 500, height: 60 };

  it("drops the crop's white clip and maps plate + text into the region", () => {
    const out = regionOverlayObjects(scene, region, win);
    expect(out).toHaveLength(3);
    expect(out[0].type).toBe("Image");
    expect(out[0].left).toBeCloseTo(12);
    expect(out[0].top).toBeCloseTo(12);
    expect(out[0].width).toBeCloseTo(500);
    expect(out[0].height).toBeCloseTo(60);
  });

  it("scales text geometry and font size by the crop-to-scene factor, keeps style fields", () => {
    const out = regionOverlayObjects(scene, region, win);
    const sale = out[1];
    expect(sale.left).toBeCloseTo(12 + 80 * 0.5);
    expect(sale.top).toBeCloseTo(12 + 25 * 0.5);
    expect(sale.width).toBeCloseTo(550 * 0.5);
    if (sale.type === "Textbox") expect(sale.fontSize).toBeCloseTo(26 * 0.5);
    expect(sale.angle).toBe(0);
    expect((sale as { fontSource?: unknown }).fontSource).toEqual({ family: "Georgia", url: "oia://fonts/georgia.ttf" });
    const price = out[2];
    expect(price.angle).toBe(-8);
  });

  it("returns nothing for a degenerate window", () => {
    expect(regionOverlayObjects(scene, region, { x: 0, y: 0, w: 0, h: 100 })).toEqual([]);
  });
});
