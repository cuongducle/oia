import { describe, expect, it } from "vitest";
import { fitTextMetrics } from "../src/renderer/lib/deconstruct-typography.js";
import { deconstructScene } from "../src/renderer/lib/deconstruct-scene.js";
import { deconstructReadSchema, sceneCanvasSchema } from "@oia/schema";

describe("D22 typography fitting", () => {
  it("fits accent-inclusive ink height, not a hard-coded box-height multiplier", () => {
    const fit = fitTextMetrics({ inkWidth: 500, inkHeight: 80, targetWidth: 250, targetHeight: 40, characters: 10, spacingEm: 0 });
    expect(fit.fontSize).toBeCloseTo(50);
    expect(fit.charSpacing).toBeCloseTo(0);
  });
  it("converts inter-character pixel gap to Fabric thousandths of font size", () => {
    const fit = fitTextMetrics({ inkWidth: 200, inkHeight: 100, targetWidth: 220, targetHeight: 100, characters: 5, spacingEm: 0.05 });
    expect(fit.fontSize).toBe(100);
    expect(fit.charSpacing).toBeCloseTo(50); // 4 gaps * 5px = 20px
  });
  it.each([0, 0.05])("does not invent tracking to fill a wide box (spacing %s)", (spacingEm) => {
    const fit = fitTextMetrics({ inkWidth: 200, inkHeight: 100, targetWidth: 500, targetHeight: 40, characters: 24, spacingEm });
    expect(fit.charSpacing).toBeCloseTo(spacingEm * 1000);
    expect(fit.fontSize).toBe(40);
  });
  it("shrinks a mismatched wide font rather than making letters overlap heavily", () => {
    const fit = fitTextMetrics({ inkWidth: 800, inkHeight: 100, targetWidth: 200, targetHeight: 100, characters: 8, spacingEm: 0 });
    expect(fit.fontSize).toBeLessThan(30);
    expect(fit.charSpacing).toBeGreaterThanOrEqual(-80);
    expect(fit.charSpacing).toBeLessThanOrEqual(150);
  });
  it("single glyph and missing metrics never yield Infinity or NaN", () => {
    const single = fitTextMetrics({ inkWidth: 100, inkHeight: 80, targetWidth: 50, targetHeight: 80, characters: 1, spacingEm: 0.5 });
    expect(single).toEqual({ fontSize: 50, charSpacing: 0 });
    expect(fitTextMetrics({ inkWidth: 0, inkHeight: 0, targetWidth: 50, targetHeight: 80, characters: 1, spacingEm: 0 })).toEqual({ fontSize: 12, charSpacing: 0 });
  });
  it("preserves style through schema parse and scene save, legacy payloads still open", () => {
    const read = deconstructReadSchema.parse({ texts: [{
      text: "Chơi thứ bảy!", box: { x: 0.1, y: 0.2, w: 0.5, h: 0.1 },
      typography: { fontFamily: "monospace", fontWeight: 600, fontStyle: "italic", fill: "#ed1234", angle: -12, spacingEm: 0.08, textAlign: "center" },
    }] });
    const scene = sceneCanvasSchema.parse(deconstructScene({ imageUrl: "clean.png", w: 1000, h: 1000, texts: read.texts }));
    expect(scene.objects[2]).toMatchObject({ text: "Chơi thứ bảy!", fontFamily: "monospace", fontWeight: 600, fontStyle: "italic", fill: "#ed1234", angle: -12, charSpacing: 80, textAlign: "center", originX: "left" });
    expect(deconstructReadSchema.parse({ texts: [{ text: "old", box: { x: 0, y: 0, w: 1, h: 1 } }] }).texts[0].typography).toBeUndefined();
    expect(() => deconstructReadSchema.parse({ texts: [{ ...read.texts[0], typography: { ...read.texts[0].typography, fill: "red" } }] })).toThrow();
  });
});
