import { describe, expect, it, vi } from "vitest";
import { normalizeImageScales } from "../src/image-scales.js";

/** deconstruct-import teardown: fabric paints min(box, element) — normalize
 * rescales the object so the paint fills the declared box. Pinned against
 * fabric 7.4.0 _renderFill (maxDestW = Math.min(w, elWidth/filterScale)). */
function fakeCanvas(imgs: { box: [number, number]; natural: [number, number]; scale?: [number, number] }[]) {
  const objects = imgs.map((i) => {
    const state: Record<string, number> = { width: i.box[0], height: i.box[1], scaleX: i.scale?.[0] ?? 1, scaleY: i.scale?.[1] ?? 1 };
    return {
      get: (k: string) => state[k],
      set: vi.fn((o: Record<string, number>) => { Object.assign(state, o); }), // stateful — idempotency is testable
      getElement: () => ({ naturalWidth: i.natural[0], naturalHeight: i.natural[1] }),
    };
  });
  return { canvas: { getObjects: () => objects }, objects };
}

describe("normalizeImageScales", () => {
  it("rescales a mismatched image: width becomes natural, scale fills the box", () => {
    const { canvas, objects } = fakeCanvas([{ box: [600, 200], natural: [8, 8] }]);
    expect(normalizeImageScales(canvas)).toBe(1);
    expect(objects[0].set).toHaveBeenCalledWith({ width: 8, height: 8, scaleX: 75, scaleY: 25 });
    // display size after: 8×75 = 600, 8×25 = 200 — the box, not 600×75
  });

  it("leaves matching images alone (scale 1, natural == box)", () => {
    const { canvas, objects } = fakeCanvas([{ box: [900, 1200], natural: [900, 1200] }]);
    expect(normalizeImageScales(canvas)).toBe(0);
    expect(objects[0].set).not.toHaveBeenCalled();
  });

  it("skips non-image objects (no element) and degenerate sizes", () => {
    const text = { get: () => undefined, set: vi.fn() }; // no getElement → not an image
    const zero = { get: (k: string) => (k === "width" ? 0 : 100), set: vi.fn(), getElement: () => ({ naturalWidth: 10, naturalHeight: 10 }) };
    expect(normalizeImageScales({ getObjects: () => [text, zero] })).toBe(0);
    expect(zero.set).not.toHaveBeenCalled();
  });

  it("is idempotent — a second pass sees width == natural and skips entirely", () => {
    const { canvas, objects } = fakeCanvas([{ box: [600, 200], natural: [8, 8] }]);
    normalizeImageScales(canvas);
    expect(normalizeImageScales(canvas)).toBe(0); // width is now 8 == natural
    expect(objects[0].set).toHaveBeenCalledTimes(1);
  });

  it("preserves a pre-existing scale: box × scale is the display contract", () => {
    const { canvas, objects } = fakeCanvas([{ box: [300, 100], natural: [8, 8], scale: [2, 2] }]);
    normalizeImageScales(canvas);
    // display was 300×2=600 wide → after: width=8, scaleX=600/8=75
    expect(objects[0].set).toHaveBeenCalledWith({ width: 8, height: 8, scaleX: 75, scaleY: 25 });
  });
});
