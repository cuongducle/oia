import { describe, expect, it } from "vitest";
import { fitCoverWithZones } from "../src/copy-zones.js";
import { buildScene, runDesignerAgent } from "../src/designer.js";
import type { ImageProvider, LlmProvider } from "@oia/providers";
import type { ChatEvent } from "@oia/schema";

/**
 * DEF-1 regression (2026-11-03): the real codex run shipped a poster whose first
 * letters ("BL"ack, "GI"ảm, "2"0%, "H"ôm) vanished — the model rendered them
 * correctly (the critic transcribed all lines on the ORIGINAL artwork); the
 * placement cover-cropped 191px off the LEFT because fitCoverWithZones used the
 * clean-plate right-anchor in poster mode. Mock images never hit this (exact
 * ratio), so these pins use the production numbers: artwork 1122×1402 (4:5),
 * canvas 1360×2048 (2:3).
 *
 * Honest scope: a centered crop HALVES the loss (95.49 vs 190.98px); it does NOT
 * make edge-hugging text safe — that is the planner safe-area instruction plus
 * DEF-1's open post-place-verify follow-up.
 */
describe("fitCoverWithZones — mode-aware horizontal overflow", () => {
  const IMG_W = 1122, IMG_H = 1402, CANVAS_W = 1360, CANVAS_H = 2048;

  it("poster: overflow split evenly — halves the edge loss vs the old right-anchor", () => {
    const fit = fitCoverWithZones(IMG_W, IMG_H, CANVAS_W, CANVAS_H, "poster");
    expect(fit.cropX).toBeCloseTo((IMG_W - fit.cropW) / 2, 6);
    expect(fit.cropX).toBeCloseTo(95.49, 2);   // was 190.98 — the defect's exact number
    expect(fit.cropW * fit.scale).toBeCloseTo(CANVAS_W, 3);
    expect(fit.cropH * fit.scale).toBeCloseTo(CANVAS_H, 3);
  });

  it("clean-plate: RIGHT anchor keeps the copy zones (top+right, TP.8)", () => {
    const fit = fitCoverWithZones(IMG_W, IMG_H, CANVAS_W, CANVAS_H, "clean-plate");
    expect(fit.cropX).toBe(IMG_W - fit.cropW); // crop comes off the LEFT
    expect(fit.cropX).toBeCloseTo(190.984, 2);
  });

  it("mode is REQUIRED — the dangerous placement never gets a silent default", () => {
    // @ts-expect-error — the whole point: omitting the mode must not compile
    fitCoverWithZones(IMG_W, IMG_H, CANVAS_W, CANVAS_H);
  });

  it("taller image: TOP anchor in both modes (topBand carries copy zones)", () => {
    for (const mode of ["poster", "clean-plate"] as const) {
      expect(fitCoverWithZones(1000, 2000, 1000, 1200, mode).cropY).toBe(0);
    }
  });

  it("matching ratio: no crop at all", () => {
    const fit = fitCoverWithZones(1360, 2048, 1360, 2048, "poster");
    expect(fit).toMatchObject({ cropX: 0, cropY: 0, cropW: 1360, cropH: 2048 });
  });
});

describe("buildScene — poster placement carries a centered crop", () => {
  it("buildScene({mode:'poster'}) yields cropX ≈ 95.49 on the production pair", () => {
    const scene = buildScene({
      artworkUrl: "/api/files/x.png",
      artworkW: 1122, artworkH: 1402,
      width: 1360, height: 2048,
      mode: "poster",
      blocks: [],
    });
    const img = scene.objects.find((o) => o.name === "artwork");
    if (!img) throw new Error("artwork object missing from scene");
    expect(img.cropX).toBeCloseTo(95.49, 2);
  });
});

/**
 * The WIRING regression: DEF-1 lived at the call site (buildScene ran without a
 * mode long after fitCoverWithZones existed). Unit pins above would stay green
 * if the designer loop forgot to pass the mode again — this test drives the real
 * agent loop with a WRONG-ratio image (what only the codex channel produces)
 * and asserts the emitted canvas is centered, not right-anchored.
 */
describe("runDesignerAgent — poster pipeline wires the mode through (DEF-1)", () => {
  it("a 4:5 image on a 2:3 poster page emits a CENTERED artwork crop", async () => {
    const caps = { referenceImages: false, sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false }, transparentBg: false, isMock: false };
    const llm: LlmProvider = {
      name: "stub", capabilities: caps,
      async isAvailable() { return { ok: true }; },
      async chat() { return JSON.stringify({ title: "t", imagePrompt: "poster prompt", copy: "" }); },
    };
    // the codex-channel behavior: ignores the requested size, returns its own ratio
    const image: ImageProvider = {
      name: "stub", capabilities: caps,
      async isAvailable() { return { ok: true }; },
      async generate() { return { url: "data:image/png;base64,x", provider: "stub", model: "m", width: 1122, height: 1402 }; },
    };
    const evs: ChatEvent[] = [];
    for await (const ev of runDesignerAgent({ prompt: "poster", mode: "poster" }, { llm, image })) evs.push(ev);

    const canvasEv = evs.find((e) => e.renderData?.msgMeta?.some((m) => m.type === "canvas"));
    const meta = canvasEv?.renderData?.msgMeta?.find((m) => m.type === "canvas") as
      | { canvas?: { objects?: { name?: string; cropX?: number }[] } } | undefined;
    const artwork = meta?.canvas?.objects?.find((o) => o.name === "artwork");
    if (!artwork) throw new Error("no artwork object in the emitted canvas");
    expect(artwork.cropX).toBeCloseTo(95.49, 2); // centered — the right-anchor value was 190.98
  });
});
