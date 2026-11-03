import { describe, expect, it } from "vitest";
import { fitCoverWithZones } from "../src/copy-zones.js";
import { buildScene } from "../src/designer.js";

/**
 * Regression: the 2026-11-03 real codex run shipped a poster whose first letters
 * ("BL"ack, "GI"ảm, "2"0%, "H"ôm) were missing — NOT a model defect (the in-app
 * critic transcribed all four lines correct on the ORIGINAL artwork). The cause:
 * fitCoverWithZones anchored the horizontal overflow crop to the RIGHT
 * (clean-plate zone policy), cropping 191px off the LEFT of a poster whose text
 * is baked anywhere. Poster mode must CENTER the crop; clean-plate keeps its
 * zone anchors (TP.8). Mock images never hit this path (exact ratio) — only a
 * real pair could, which is why these pins use the production numbers.
 */
describe("fitCoverWithZones — mode-aware horizontal overflow (poster center-crop)", () => {
  // production numbers: artwork 1122×1402 (4:5), canvas 1360×2048 (2:3)
  const IMG_W = 1122, IMG_H = 1402, CANVAS_W = 1360, CANVAS_H = 2048;

  it("poster: wider artwork crops CENTERED — never eats one side's leading letters", () => {
    const fit = fitCoverWithZones(IMG_W, IMG_H, CANVAS_W, CANVAS_H, "poster");
    expect(fit.cropX).toBe(Math.floor((IMG_W - fit.cropW) / 2));
    expect(fit.cropX).toBeGreaterThan(0); // a crop happened at all
    expect(fit.cropW * fit.scale).toBeCloseTo(CANVAS_W, 3);
    expect(fit.cropH * fit.scale).toBeCloseTo(CANVAS_H, 3);
  });

  it("clean-plate: wider artwork keeps the RIGHT anchor (copy zones live top+right, TP.8)", () => {
    const fit = fitCoverWithZones(IMG_W, IMG_H, CANVAS_W, CANVAS_H, "clean-plate");
    expect(fit.cropX).toBe(IMG_W - fit.cropW); // right-anchored: crop comes off the LEFT
    expect(fit.cropX).toBeCloseTo(190.984, 2); // the exact production cropX that ate "BL"/"GI"/"2"/"H"
  });

  it("default (no mode arg) stays clean-plate — additive signature, old callers unchanged", () => {
    expect(fitCoverWithZones(IMG_W, IMG_H, CANVAS_W, CANVAS_H).cropX).toBeCloseTo(190.984, 2);
  });

  it("taller image: TOP anchor in both modes (topBand carries copy zones)", () => {
    for (const mode of ["poster", "clean-plate"] as const) {
      const fit = fitCoverWithZones(1000, 2000, 1000, 1200, mode);
      expect(fit.cropY).toBe(0);
    }
  });

  it("matching ratio: no crop at all", () => {
    const fit = fitCoverWithZones(1360, 2048, 1360, 2048, "poster");
    expect(fit).toMatchObject({ cropX: 0, cropY: 0, cropW: 1360, cropH: 2048 });
  });
});

describe("buildScene — poster mode passes through to the placement (end-to-end pin)", () => {
  it("poster artwork object carries a CENTERED cropX, not the clean-plate right anchor", () => {
    const scene = buildScene({
      artworkUrl: "/api/files/x.png",
      artworkW: 1122, artworkH: 1402,
      width: 1360, height: 2048,
      mode: "poster",
      blocks: [],
    });
    const img = scene.objects.find((o) => o.name === "artwork");
    expect(img).toBeTruthy();
    expect(img!.cropX).toBe(95); // floor((1122 - 931.02)/2) — centered, NOT 191
  });
});
