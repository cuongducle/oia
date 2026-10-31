import { describe, expect, it } from "vitest";
import { DEFAULT_POSTER, SIZE_PRESETS } from "@oia/canvas";
import { sceneCanvasSchema } from "@oia/schema";
import { CREATE_SIZES, sizeScene } from "../src/renderer/lib/create-sheet.js";
import { sceneDims, sceneShape } from "../src/renderer/lib/scene-dims.js";

/**
 * UI v1.1 R2 — the Create sheet's size lane. A preset must open a project at
 * exactly its size (the clip is the document ground truth, TP.3), and the sheet
 * must not upgrade any size into an "official" platform spec (LV-10).
 */
const all = CREATE_SIZES.flatMap((g) => g.items);

describe("Create sheet sizes", () => {
  it("every preset opens a schema-valid scene at exactly its size", () => {
    for (const a of all) {
      const scene = sizeScene(a);
      expect(sceneCanvasSchema.safeParse(scene).success, a.id).toBe(true);
      expect(sceneDims(scene), a.id).toEqual({ w: a.w, h: a.h });
    }
  });

  it("marketplace sizes come from SIZE_PRESETS, not a second copy of the numbers", () => {
    const byId = Object.fromEntries(all.map((a) => [a.id, { width: a.w, height: a.h }]));
    expect(byId["shopee-1x1"]).toEqual(SIZE_PRESETS["Shopee Product (1:1)"]);
    expect(byId["lazada-1x1"]).toEqual(SIZE_PRESETS["Lazada Product (1:1)"]);
    expect(byId["tiktokshop-1x1"]).toEqual(SIZE_PRESETS["TikTok Shop Product (1:1)"]);
    expect(byId.poster).toEqual({ width: DEFAULT_POSTER.width, height: DEFAULT_POSTER.height });
  });

  it("only the two C3 live covers claim official, and the overlay stays transparent", () => {
    expect(all.filter((a) => a.official).map((a) => a.id).sort()).toEqual(["shopee-live-cover", "tiktok-live-cover"]);
    expect(all.filter((a) => a.transparent).map((a) => a.id)).toEqual(["live-overlay-916"]);
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length); // ids key the buttons
  });
});

describe("sceneShape (Projects filters)", () => {
  it("buckets by aspect; 9:16 wins over portrait", () => {
    expect(sceneShape(1080, 1920)).toBe("916");
    expect(sceneShape(1360, 2048)).toBe("portrait");
    expect(sceneShape(1024, 1024)).toBe("square");
    expect(sceneShape(1030, 1000)).toBe("square");
    expect(sceneShape(1920, 1080)).toBe("landscape");
  });
});
