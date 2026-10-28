import { describe, expect, it } from "vitest";
import { createPages, addPage, removePage, duplicatePage, switchTo, applySizeToAllPages } from "../src/pages.js";
import { planExport } from "../src/actions.js";

describe("BR-PG multi-page (numbered from 1, add page, always at least one board)", () => {
  it("initializes exactly one blank page with a clip Rect", () => {
    const pages = createPages(1360, 2048);
    expect(pages).toHaveLength(1);
    expect(pages[0].canvas.objects[0]).toMatchObject({ type: "Rect", name: "clip", width: 1360, height: 2048 });
  });
  it("BR-PG1: addPage appends at the end and points activeIndex at it", () => {
    const p = createPages();
    const r = addPage(p, 1000, 2000);
    expect(r.pages).toHaveLength(2);
    expect(r.activeIndex).toBe(1);
    expect(r.pages[1].canvas.objects[0]).toMatchObject({ width: 1000, height: 2000 });
  });
  it("BR-PG2: the last page cannot be deleted — state unchanged", () => {
    const p = createPages();
    const r = removePage(p, 0);
    expect(r.pages).toHaveLength(1);
    expect(r).toEqual({ pages: p, activeIndex: 0 });
  });
  it("BR-PG2: deleting a middle page moves active to a valid index", () => {
    const p3 = addPage(addPage(createPages()).pages).pages;
    const r = removePage(p3, 1);
    expect(r.pages).toHaveLength(2);
    expect(r.activeIndex).toBe(1);
  });
  it("BR-PG3: duplicate inserts after the source with an equal scene but a new id", () => {
    const p = createPages();
    p[0].canvas.objects.push({ type: "Textbox", text: "50% OFF", left: 10, top: 10 } as never);
    const r = duplicatePage(p, 0);
    expect(r.pages).toHaveLength(2);
    expect(r.activeIndex).toBe(1);
    expect(r.pages[1].canvas.objects).toHaveLength(2);
    expect(r.pages[1].id).not.toBe(r.pages[0].id);
  });
  it("switchTo clamp index", () => {
    const p = addPage(createPages()).pages;
    expect(switchTo(p, 99)).toBe(1);
    expect(switchTo(p, -5)).toBe(0);
  });
});

describe("BR-ED5' multi-page export: png/jpg with ALL scope become a ZIP", () => {
  it("one page: png downloads directly", () => {
    expect(planExport("png", "all", 1).strategy).toBe("canvas-dataurl");
  });
  it("three pages: png ALL → jszip with the right file name", () => {
    const p = planExport("png", "all", 3, "Deck");
    expect(p.strategy).toBe("jszip");
    expect(p.fileName).toBe("deck-png.zip");
    expect(p.pages).toBe(3);
  });
  it("three pages with current scope → a single plain png", () => {
    expect(planExport("png", "current", 3).strategy).toBe("canvas-dataurl");
  });
  it("multi-page pptx: pptxgenjs strategy with pages=N", () => {
    expect(planExport("pptx", "all", 5).pages).toBe(5);
  });
});

describe("BR-ED3' Apply to all design boards", () => {
  it("resize updates every page: clip Rect + page dims stay in sync", () => {
    const p = addPage(addPage(createPages(1360, 2048)).pages).pages;
    p[1].canvas.objects.push({ type: "Textbox", text: "x", left: 5, top: 5 } as never);
    const out = applySizeToAllPages(p, 1080, 1080);
    expect(out).toHaveLength(3);
    for (const pg of out) {
      expect(pg.width).toBe(1080);
      expect(pg.height).toBe(1080);
      expect(pg.canvas.objects.find((o) => o.name === "clip")).toMatchObject({ width: 1080, height: 1080 });
    }
    // other objects keep their position
    expect(out[1].canvas.objects.at(-1)).toMatchObject({ type: "Textbox", text: "x" });
  });
  it("a page missing its clip gets one inserted at the front", () => {
    const p = createPages();
    delete (p[0].canvas as { objects: unknown[] }).objects[0];
    const out = applySizeToAllPages(p, 500, 500);
    expect(out[0].canvas.objects[0]).toMatchObject({ name: "clip", width: 500 });
  });
});
