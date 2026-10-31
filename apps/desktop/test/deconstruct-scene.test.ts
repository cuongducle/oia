import { describe, expect, it } from "vitest";
import { sceneCanvasSchema, type DeconstructText } from "@oia/schema";
import { deconstructScene } from "../src/renderer/lib/deconstruct-scene.js";

/** B1 — the deconstructed scene builder (deconstruct-import.md DC-6). */
describe("deconstructScene", () => {
  const texts: DeconstructText[] = [
    { text: "SALE 50", box: { x: 0.1, y: 0.1, w: 0.5, h: 0.08 } },
    { text: "299.000₫", box: { x: 0.1, y: 0.7, w: 0.4, h: 0.06 } },
  ];

  it("builds a valid scene: white clip at image size + clean-plate artwork + one Textbox per line", () => {
    const scene = deconstructScene({ imageUrl: "/api/files/x/clean.png", w: 1000, h: 2000, texts });
    expect(() => sceneCanvasSchema.parse(scene)).not.toThrow();
    const [clip, artwork, ...boxes] = scene.objects;
    expect(clip).toMatchObject({ name: "clip", width: 1000, height: 2000, fill: "white" });
    expect(artwork).toMatchObject({ type: "Image", src: "/api/files/x/clean.png", width: 1000, height: 2000 });
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toMatchObject({ type: "Textbox", text: "SALE 50", left: 100, top: 200, width: 500 });
  });

  it("maps fraction boxes to pixels and sizes fonts from box height (clamped)", () => {
    const scene = deconstructScene({ imageUrl: "u", w: 1000, h: 2000, texts });
    expect(scene.objects[2]).toMatchObject({ fontSize: Math.round(0.08 * 2000 * 0.75) }); // 120
    const tiny: DeconstructText = { text: "x", box: { x: 0, y: 0, w: 0.01, h: 0.001 } }; // 1.5px → clamped to 12
    const huge: DeconstructText = { text: "y", box: { x: 0, y: 0.2, w: 0.9, h: 0.5 } }; // 750px → clamped to 200
    const s = deconstructScene({ imageUrl: "u", w: 1000, h: 2000, texts: [tiny, huge] });
    expect(s.objects[2]).toMatchObject({ fontSize: 12 });
    expect(s.objects[3]).toMatchObject({ fontSize: 200 });
  });

  it("zero texts is legal — a clean plate with no layers still opens in the editor", () => {
    const scene = deconstructScene({ imageUrl: "u", w: 500, h: 500, texts: [] });
    expect(scene.objects).toHaveLength(2); // clip + artwork only
    expect(() => sceneCanvasSchema.parse(scene)).not.toThrow();
  });
});
