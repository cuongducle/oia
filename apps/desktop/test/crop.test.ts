import { describe, expect, it } from "vitest";
import { marqueeToClipRect, clampMarquee, shadeRects, type Rect } from "../src/renderer/lib/crop.js";

/**
 * SG-8 gates, pure math (no fabric): the marquee → clipPath mapping must be
 * exact for identity, translate+scale and ROTATED layers (the matrix is the
 * only truth), and the marquee must never leave the image bounds.
 */

const I = [1, 0, 0, 1, 0, 0];

describe("SG-8 marqueeToClipRect", () => {
  it("identity matrix: center-origin local rect, top-left marquee input", () => {
    // image 200x100 at origin (0,0), its local center is (100,50)
    const clip = marqueeToClipRect({ left: 50, top: 25, width: 100, height: 50 }, I);
    expect(clip).toEqual({ left: 100, top: 50, width: 100, height: 50 });
  });
  it("translated layer: marquee canvas coords map through the inverse matrix", () => {
    // layer translated by (300, 200): canvas marquee (350,225,100x50) → local (50,25,100x50) centered at (100,50)
    const clip = marqueeToClipRect({ left: 350, top: 225, width: 100, height: 50 }, [1, 0, 0, 1, 300, 200]);
    expect(clip).toEqual({ left: 100, top: 50, width: 100, height: 50 });
  });
  it("scaled layer: a half-canvas marquee is the FULL local image (scale cancels)", () => {
    // layer scaled 2x: its bounding rect on canvas is 400x200 at (0,0)
    const clip = marqueeToClipRect({ left: 0, top: 0, width: 400, height: 200 }, [2, 0, 0, 2, 0, 0]);
    expect(clip).toEqual({ left: 100, top: 50, width: 200, height: 100 });
  });
  it("rotated layer: rotation is absorbed, a 90° layer swaps the clip axes", () => {
    // matrix (0,1,-1,0) rotates +90°: canvas (0,0)-(100x50) maps to local axes swap
    const clip = marqueeToClipRect({ left: 0, top: 0, width: 100, height: 50 }, [0, 1, -1, 0, 0, 0]);
    expect(clip.width).toBeCloseTo(50);
    expect(clip.height).toBeCloseTo(100);
  });
  it("degenerate (singular) matrix never throws", () => {
    expect(() => marqueeToClipRect({ left: 0, top: 0, width: 10, height: 10 }, [0, 0, 0, 0, 0, 0])).not.toThrow();
  });
});

describe("SG-8 clampMarquee", () => {
  const bounds: Rect = { left: 0, top: 0, width: 200, height: 100 };
  it("inside rect passes through", () => {
    expect(clampMarquee({ left: 10, top: 10, width: 50, height: 30 }, bounds)).toEqual({ left: 10, top: 10, width: 50, height: 30 });
  });
  it("dragged out: clamped back inside, keeps size when it fits", () => {
    expect(clampMarquee({ left: 180, top: 90, width: 50, height: 30 }, bounds)).toEqual({ left: 150, top: 70, width: 50, height: 30 });
  });
  it("oversized: width/height capped to the bounds", () => {
    expect(clampMarquee({ left: -20, top: -20, width: 500, height: 500 }, bounds)).toEqual({ left: 0, top: 0, width: 200, height: 100 });
  });
  it("never below the min size", () => {
    expect(clampMarquee({ left: 10, top: 10, width: 1, height: 1 }, bounds, 8)).toMatchObject({ width: 8, height: 8 });
  });
});

describe("SG-8 shadeRects", () => {
  it("4 shades cover the bounds minus the marquee, zero-area when the marquee is full", () => {
    const bounds: Rect = { left: 0, top: 0, width: 100, height: 100 };
    const full = shadeRects({ left: 0, top: 0, width: 100, height: 100 }, bounds);
    expect(full.map((r) => r.width * r.height)).toEqual([0, 0, 0, 0]);
    const half = shadeRects({ left: 50, top: 0, width: 50, height: 100 }, bounds);
    expect(half[2]).toEqual({ left: 0, top: 0, width: 50, height: 100 }); // left shade
    expect(half[3].width).toBe(0);
  });
});
