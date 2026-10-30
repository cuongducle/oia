import { describe, expect, it } from "vitest";
import type { SceneCanvas } from "@oia/schema";
import { sceneDims } from "../src/renderer/lib/scene-dims.js";

/** The clip Rect is the artboard ground truth — dims must come from ONE place
 * (the preview, the PNG export and the result card all call this). */
function canvas(objects: unknown[]): SceneCanvas {
  return { version: "7.3.1", objects } as unknown as SceneCanvas;
}

describe("sceneDims", () => {
  it("reads the clip rect when present", () => {
    const scene = canvas([
      { type: "Image", name: "artwork", src: "x" },
      { type: "Rect", name: "clip", width: 1080, height: 1080 },
    ]);
    expect(sceneDims(scene)).toEqual({ w: 1080, h: 1080 });
  });

  it("falls back to the banner-mode default when no clip exists", () => {
    expect(sceneDims(canvas([]))).toEqual({ w: 1360, h: 2048 });
  });

  it("falls back per-axis when only one dimension is present (defensive)", () => {
    const scene = canvas([{ type: "Rect", name: "clip", width: 800 }]);
    expect(sceneDims(scene)).toEqual({ w: 800, h: 2048 });
  });

  it("ignores non-clip objects with the same name shape", () => {
    const scene = canvas([
      { type: "Rect", name: "not-a-clip", width: 500, height: 500 },
      { type: "Rect", name: "clip", width: 1360, height: 2048 },
    ]);
    expect(sceneDims(scene)).toEqual({ w: 1360, h: 2048 });
  });
});
