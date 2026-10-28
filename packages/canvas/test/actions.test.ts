import { describe, expect, it, vi } from "vitest";
import { TEXT_TOOLBAR_ACTIONS, applyLayerAction, planExport } from "../src/index.js";

describe("BR-ED4 Text toolbar (16 actions)", () => {
it("covers style (B/I/U/S), align, size, 4 layer orders, spacing, duplicate, color, font", () => {
    const a = TEXT_TOOLBAR_ACTIONS;
    expect(a).toContain("strike"); // strikethrough is included
    expect(a).toContain("charSpacing");
    expect(a.filter((x) => x.startsWith("layer"))).toHaveLength(4);
    expect(a).toHaveLength(16);
  });
it("applyLayerAction maps to the right fabric call", () => {
    const obj = {
      bringToFront: vi.fn(), bringForward: vi.fn(), sendBackwards: vi.fn(), sendToBack: vi.fn(),
    };
    applyLayerAction(obj, "layerFront"); expect(obj.bringToFront).toHaveBeenCalledTimes(1);
    applyLayerAction(obj, "layerForward"); expect(obj.bringForward).toHaveBeenCalledTimes(1);
    applyLayerAction(obj, "layerBackward"); expect(obj.sendBackwards).toHaveBeenCalledTimes(1);
    applyLayerAction(obj, "layerBack"); expect(obj.sendToBack).toHaveBeenCalledTimes(1);
  });
});

describe("BR-ED5 Export matrix (editor: JPG/PNG + scope; chat: ZIP(jpg)/PDF/PPTX)", () => {
  it("png/jpg → canvas-dataurl", () => {
    const p = planExport("png", "current", 3);
    expect(p).toMatchObject({ strategy: "canvas-dataurl", pages: 1, fileName: "project.png" });
    expect(planExport("jpg", "all", 3).pages).toBe(3);
  });
  it("pdf → jspdf, pptx → pptxgenjs, zip → jszip (default 'ZIP(jpg)')", () => {
    expect(planExport("pdf", "all", 5).strategy).toBe("jspdf");
    expect(planExport("pptx", "all", 5).strategy).toBe("pptxgenjs");
    const z = planExport("zip", "all", 5);
    expect(z.strategy).toBe("jszip");
    expect(z.fileName).toMatch(/-jpg\.zip$/);
  });
it("current scope always exports one page", () => {
    expect(planExport("pptx", "current", 10).pages).toBe(1);
  });
it("file name is slugged from the project name", () => {
    // non-ASCII characters are stripped during slugging
    expect(planExport("png", "all", 1, "Café Deluxe!").fileName).toBe("caf-deluxe.png");
  });
  it("0 pages → error", () => {
    expect(() => planExport("png", "all", 0)).toThrow();
  });
});
