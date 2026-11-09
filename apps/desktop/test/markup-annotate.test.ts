import { describe, it, expect } from "vitest";
import { viewportToNatural, markerWidthFor } from "../src/renderer/lib/markup-annotate.js";

const IDENTITY = [1, 0, 0, 1, 0, 0];

describe("ME viewportToNatural, pure mapping math", () => {
  it("identity everywhere: viewport point lands on the same natural pixel", () => {
    const p = viewportToNatural({ x: 120, y: 60 }, IDENTITY, IDENTITY, 1000, 800, 1000, 800);
    expect(p).toEqual({ x: 120, y: 60 });
  });

  it("object scale: object-space 500x400 → natural 1000x800 doubles local coords", () => {
    const scaled = [0.5, 0, 0, 0.5, 0, 0]; // object drawn at half size in the scene
    const p = viewportToNatural({ x: 100, y: 80 }, IDENTITY, scaled, 500, 400, 1000, 800);
    // local = v / 0.5 = (200, 160); natural = local × (1000/500, 800/400) = (400, 320)
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(320);
  });

  it("viewport zoom 2x: a screen point halfway lands at a quarter of the scene", () => {
    const zoomed = [2, 0, 0, 2, 0, 0];
    const p = viewportToNatural({ x: 500, y: 400 }, zoomed, IDENTITY, 1000, 800, 1000, 800);
    expect(p.x).toBeCloseTo(250);
    expect(p.y).toBeCloseTo(200);
  });

  it("object translate: the offset shifts the mapping back", () => {
    const moved = [1, 0, 0, 1, 240, 120]; // object translated in the scene
    const p = viewportToNatural({ x: 340, y: 220 }, IDENTITY, moved, 1000, 800, 1000, 800);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(100);
  });

  it("object rotate 90°: screen x maps to natural y (and inverts)", () => {
    // 90° clockwise: [cos,sin,-sin,cos] with cos90=0,sin90=1
    const rotated = [0, 1, -1, 0, 0, 0];
    const p = viewportToNatural({ x: 0, y: 100 }, IDENTITY, rotated, 800, 800, 800, 800);
    // local = R⁻¹·v rotates -90°: (0,100) → (100,0)
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(0);
  });

  it("natural bitmap larger than object space keeps proportions", () => {
    const p = viewportToNatural({ x: 50, y: 40 }, IDENTITY, IDENTITY, 100, 80, 2000, 1600);
    expect(p).toEqual({ x: 1000, y: 800 });
  });

  it("naturalToViewport inverts viewportToNatural (scale + zoom combined)", async () => {
    const { naturalToViewport } = await import("../src/renderer/lib/markup-annotate.js");
    const scaled = [0.5, 0, 0, 0.5, 30, 20];
    const zoomed = [2, 0, 0, 2, 10, 5];
    const orig = { x: 431, y: 197 };
    const n = viewportToNatural(orig, zoomed, scaled, 500, 400, 1000, 800);
    const back = naturalToViewport(n, zoomed, scaled, 500, 400, 1000, 800);
    expect(back.x).toBeCloseTo(orig.x);
    expect(back.y).toBeCloseTo(orig.y);
  });
});

describe("ME markerWidthFor", () => {
  it("≈1.5% of the short side, min 3", () => {
    expect(markerWidthFor(1000, 800)).toBe(12);
    expect(markerWidthFor(200, 120)).toBe(3);
    expect(markerWidthFor(1080, 1350)).toBe(16);
  });
});
