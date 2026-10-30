import { describe, expect, it } from "vitest";
import { clampZoom, MIN_ZOOM, MAX_ZOOM } from "../src/renderer/lib/zoom.js";

/** Regression: the typed-percent path once allowed 4.0 while zoomBy capped at
 * 2.0 — one bar, two truths. Both paths now share clampZoom. */
describe("clampZoom", () => {
  it("keeps in-range values", () => {
    expect(clampZoom(0.29)).toBe(0.29);
    expect(clampZoom(1)).toBe(1);
  });

  it("clamps underflow to MIN_ZOOM", () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
  });

  it("clamps overflow to MAX_ZOOM — the same cap the +/- steppers use", () => {
    expect(clampZoom(4)).toBe(MAX_ZOOM);
    expect(clampZoom(999)).toBe(MAX_ZOOM);
    expect(MAX_ZOOM).toBe(2);
  });

  it("treats non-finite input as the minimum, never NaN", () => {
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(MAX_ZOOM);
  });
});
