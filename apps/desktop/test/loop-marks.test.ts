import { describe, it, expect } from "vitest";
import { chipAnchor, arrowHead, marksPrompt, zoomAt, clampPan, clampChipAnchor, MIN_ARROW_PX, MIN_BOX_PX, type LoopMark } from "../src/renderer/lib/loop-marks.js";

describe("SIL chipAnchor, pure math", () => {
  it("box: the chip sits on the box's top-left corner", () => {
    const mark: LoopMark = { id: "a", kind: "box", note: "", x: 40, y: 60, w: 100, h: 80 };
    expect(chipAnchor(mark)).toEqual({ x: 40, y: 60 });
  });

  it("horizontal arrow: the chip sits below the tail, capped at 42px", () => {
    const mark: LoopMark = { id: "b", kind: "arrow", note: "", from: { x: 100, y: 100 }, to: { x: 300, y: 100 } };
    // direction (1,0), normal (0,1): offset min(200*0.4, 42) = 42
    expect(chipAnchor(mark)).toEqual({ x: 100, y: 142 });
  });

  it("long arrow keeps the chip near the tail (cap), short arrow stays proportional", () => {
    const long: LoopMark = { id: "c", kind: "arrow", note: "", from: { x: 0, y: 0 }, to: { x: 1000, y: 0 } };
    expect(chipAnchor(long).y).toBe(42);
    const short: LoopMark = { id: "d", kind: "arrow", note: "", from: { x: 0, y: 0 }, to: { x: 40, y: 0 } };
    expect(chipAnchor(short).y).toBeCloseTo(16); // 40 * 0.4
  });
});

describe("SIL arrowHead, pure math", () => {
  it("points along the arrow direction with the given size", () => {
    const [tip, a, b] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(tip).toEqual({ x: 100, y: 0 });
    // base center should be 10 behind the tip, wings spread perpendicular
    expect(a.x).toBeCloseTo(90);
    expect(b.x).toBeCloseTo(90);
    expect(a.y).toBeCloseTo(5);
    expect(b.y).toBeCloseTo(-5);
  });

  it("vertical arrow: direction down", () => {
    const [tip, a, b] = arrowHead({ x: 50, y: 50 }, { x: 50, y: 150 }, 8);
    expect(tip).toEqual({ x: 50, y: 150 });
    expect(a.x).toBeCloseTo(46);
    expect(b.x).toBeCloseTo(54);
    expect(a.y).toBeCloseTo(142);
    expect(b.y).toBeCloseTo(142);
  });
});

describe("SIL marksPrompt, the per-region instruction block", () => {
  it("numbers regions in array order and names the mark kind", () => {
    const marks: LoopMark[] = [
      { id: "a", kind: "box", note: "make this area cleaner  ", x: 0, y: 0, w: 10, h: 10 },
      { id: "b", kind: "arrow", note: "point this label to the cup", from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
    ];
    expect(marksPrompt(marks)).toBe(
      "Region 1 (red box): make this area cleaner\nRegion 2 (red arrow): point this label to the cup",
    );
  });

  it("empty list stays empty, no stray punctuation (the send gate owns emptiness)", () => {
    expect(marksPrompt([])).toBe("");
  });
});

describe("SIL zoomAt, cursor-pinned zoom (pure math)", () => {
  it("the point under the cursor stays exactly where it was", () => {
    const v = { s: 1, tx: 40, ty: 30 };
    const cx = 220;
    const cy = 130;
    const out = zoomAt(v, cx, cy, 1.25);
    // the world point under the cursor maps to the same viewport pixel
    expect((cx - v.tx) / v.s).toBeCloseTo((cx - out.tx) / out.s);
    expect((cy - v.ty) / v.s).toBeCloseTo((cy - out.ty) / out.s);
  });

  it("clamps at both ends instead of running away", () => {
    expect(zoomAt({ s: 0.2, tx: 0, ty: 0 }, 10, 10, 0.5).s).toBe(0.15);
    expect(zoomAt({ s: 10, tx: 0, ty: 0 }, 10, 10, 2).s).toBe(12);
  });
});

describe("SIL clampPan, the image stays reachable", () => {
  const stage = { w: 800, h: 600 };
  const fit = { w: 400, h: 300 };

  it("a reasonable pan passes through untouched", () => {
    const v = { s: 1, tx: 200, ty: 150 };
    expect(clampPan(v, stage.w, stage.h, fit.w, fit.h)).toEqual(v);
  });

  it("flinging the image off-screen clamps back to the keep fraction", () => {
    const out = clampPan({ s: 1, tx: -5000, ty: 9000 }, stage.w, stage.h, fit.w, fit.h);
    expect(out.tx).toBe(stage.w * 0.12 - fit.w);
    expect(out.ty).toBe(stage.h * 0.88);
  });

  it("bounds stay non-empty when the image is larger than the stage", () => {
    const out = clampPan({ s: 4, tx: 3000, ty: -3000 }, stage.w, stage.h, fit.w, fit.h);
    expect(out.tx).toBe(stage.w * 0.88);
    expect(out.ty).toBe(stage.h * 0.12 - fit.h * 4);
  });
});

describe("SIL clampChipAnchor, numbers never clip away", () => {
  it("an interior anchor is untouched", () => {
    expect(clampChipAnchor({ x: 100, y: 100 }, 1024, 1536, 22)).toEqual({ x: 100, y: 100 });
  });

  it("a negative anchor slides to the half-size edge", () => {
    expect(clampChipAnchor({ x: -5, y: -5 }, 1024, 1536, 22)).toEqual({ x: 11, y: 11 });
    expect(clampChipAnchor({ x: 2000, y: 2000 }, 1024, 1536, 22)).toEqual({ x: 1013, y: 1525 });
  });
});

describe("SIL minimum drag sizes exist as constants (UI gate uses them)", () => {
  it("box and arrow thresholds are sane natural-pixel values", () => {
    expect(MIN_BOX_PX).toBeGreaterThan(0);
    expect(MIN_ARROW_PX).toBeGreaterThan(0);
  });
});
