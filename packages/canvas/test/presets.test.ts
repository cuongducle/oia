import { describe, expect, it } from "vitest";
import {
  TEXT_PRESETS, TEXT_PRESET_SPECS, SHAPES, SIZE_PRESETS, DEFAULT_POSTER, resizeWithLock,
} from "../src/index.js";

describe("BR-ED1 Text presets (4 presets)", () => {
  it("exactly 4 presets with the expected names", () => {
    expect([...TEXT_PRESETS]).toEqual(["textbox", "heading", "subheading", "paragraph"]);
    expect(TEXT_PRESET_SPECS.heading.label).toBe("Add a heading");
    expect(TEXT_PRESET_SPECS.paragraph.label).toBe("Paragraph");
  });
  it("heading is larger than subheading, which is larger than paragraph", () => {
    const s = TEXT_PRESET_SPECS;
    expect(s.heading.fontSize).toBeGreaterThan(s.subheading.fontSize);
    expect(s.subheading.fontSize).toBeGreaterThan(s.paragraph.fontSize);
  });
});

describe("BR-ED2 Shapes (9 shapes in 3 rows)", () => {
  it("all 9 shapes, including circle/diamond/lineDotted/arrowRight", () => {
    expect(SHAPES.length).toBe(9);
    for (const s of ["circle", "diamond", "lineDotted", "arrowRight"] as const)
      expect(SHAPES).toContain(s);
  });
});

describe("BR-ED3 Settings (Recommended Size table)", () => {
  it("all 9 presets with the exact pixel sizes", () => {
    expect(SIZE_PRESETS["Instagram Post (1:1)"]).toEqual({ width: 1080, height: 1080 });
    expect(SIZE_PRESETS["YouTube Thumbnail (16:9)"]).toEqual({ width: 2560, height: 1440 });
    expect(SIZE_PRESETS["TikTok"]).toEqual({ width: 1080, height: 1920 });
    expect(SIZE_PRESETS["RedNote"]).toEqual({ width: 1242, height: 1660 });
    expect(SIZE_PRESETS["A4 (1:1.41)"]).toEqual({ width: 2480, height: 3508 });
    expect(Object.keys(SIZE_PRESETS)).toHaveLength(9);
  });
  it("default agent poster is 1360×2048", () => {
    expect(DEFAULT_POSTER).toEqual({ width: 1360, height: 2048 });
  });
  it("resize keeps the aspect ratio locked", () => {
    const cur = { width: 1000, height: 2000 };
    expect(resizeWithLock(cur, { width: 500 })).toEqual({ width: 500, height: 1000 });
    expect(resizeWithLock(cur, { height: 1000 })).toEqual({ width: 500, height: 1000 });
  });
});
