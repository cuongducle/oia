import { describe, expect, it } from "vitest";
import type { FabricObject, SceneCanvas } from "@oia/schema";
import { variantArtworkObject, replaceObjectSrc, stampUser, objectOrigin } from "../src/provenance.js";
import { SIZE_PRESETS } from "../src/presets.js";

function img(name: string, origin: FabricObject["origin"], src = "https://x/y.png"): FabricObject {
  return { type: "Image", name, origin, left: 0, top: 0, width: 100, height: 100, src, visible: true };
}

/** A1 preview-apply (docs/designs/variant-preview-apply.md): the editor dock never
 * auto-mutates the page. TP.10 non-destruction is now the src swap of exactly one
 * user-designated object — these tests pin that mechanism. */
describe("A1 preview-apply: variantArtworkObject picks the swap-in image (VA-5)", () => {
  const variant: SceneCanvas = {
    version: "7.3.1",
    objects: [
      { type: "Rect", name: "clip", left: 0, top: 0, width: 900, height: 1200, fill: "white", visible: true, src: "https://x/clip.png" },
      img("artwork", "generated", "https://x/new-artwork.png"),
      { type: "Textbox", name: "block:price", origin: "generated", text: "30%", left: 10, top: 10, width: 100, height: 40, visible: true },
      img("user upload", "user", "https://x/user.png"), // rode along in the scene — never the swap source
    ],
  };

  it("returns the largest-area generated image, skipping clip / user / text layers", () => {
    expect(variantArtworkObject(variant)).toEqual({ src: "https://x/new-artwork.png" });
  });

  it("largest displayed area wins (scale factored), not z-order", () => {
    const collage: SceneCanvas = {
      version: "7.3.1",
      objects: [
        { ...img("small", "generated", "https://x/s.png") },
        { type: "Image", name: "big", origin: "generated", left: 0, top: 0, width: 100, height: 100, scaleX: 3, scaleY: 3, src: "https://x/b.png", visible: true },
      ],
    };
    expect(variantArtworkObject(collage)).toEqual({ src: "https://x/b.png" });
  });

  it("returns null when the variant has no artwork image (VA-5) — the UI disables Replace", () => {
    const textOnly: SceneCanvas = {
      version: "7.3.1",
      objects: [
        { type: "Rect", name: "clip", left: 0, top: 0, width: 1, height: 1, fill: "white", visible: true },
        { type: "Textbox", name: "block:t", origin: "generated", text: "30%", left: 0, top: 0, width: 10, height: 10, visible: true },
      ],
    };
    expect(variantArtworkObject(textOnly)).toBeNull();
  });

  it("legacy objects without origin default to user (conservative) — never picked", () => {
    const legacy: SceneCanvas = { version: "7.3.1", objects: [img("legacy", undefined as unknown as FabricObject["origin"])] };
    expect(variantArtworkObject(legacy)).toBeNull();
  });
});

describe("A1 preview-apply: replaceObjectSrc swaps exactly one src (VA-4, TP.10)", () => {
  const current: SceneCanvas = {
    version: "7.3.1",
    objects: [
      { type: "Rect", name: "clip", left: 0, top: 0, width: 900, height: 1200, fill: "white", visible: true },
      { ...img("artwork", "generated", "https://x/old.png"), left: 37, top: 42, scaleX: 1.5, scaleY: 1.5, angle: 7 },
      img("product-photo", "user", "https://x/keep-me.png"),
      { type: "Textbox", name: "my own note", text: "hot", left: 400, top: 900, width: 80, height: 30, visible: true },
    ],
  };

  it("swaps the target src; geometry, order, and every other object stay identical", () => {
    const next = replaceObjectSrc(current, 1, "https://x/new.png");
    expect(next.objects[1].src).toBe("https://x/new.png");
    // geometry untouched — the layer stays exactly where the user placed it
    expect(next.objects[1]).toMatchObject({ left: 37, top: 42, scaleX: 1.5, scaleY: 1.5, angle: 7 });
    // everything else is the SAME reference values (no reordering, no copies of siblings)
    expect(next.objects[0]).toBe(current.objects[0]);
    expect(next.objects[2]).toBe(current.objects[2]);
    expect(next.objects[3]).toBe(current.objects[3]);
    expect(next.version).toBe(current.version);
    // copy-on-write: the input scene is not mutated
    expect(current.objects[1].src).toBe("https://x/old.png");
  });

  it("error path: out-of-range index throws (a stale index must never corrupt the page)", () => {
    expect(() => replaceObjectSrc(current, 9, "x")).toThrow(RangeError);
    expect(() => replaceObjectSrc(current, -1, "x")).toThrow(RangeError);
  });

  it("error path: a target without src throws (not an image layer)", () => {
    expect(() => replaceObjectSrc(current, 3, "x")).toThrow(TypeError);
  });

  it("stampUser marks an object; objectOrigin treats undefined as user (legacy default)", () => {
    const o = { type: "Textbox", text: "x" } as FabricObject;
    expect(objectOrigin(o)).toBe("user"); // legacy conservative default
    stampUser(o);
    expect(objectOrigin(o)).toBe("user");
    expect(objectOrigin(img("g", "generated"))).toBe("generated");
  });
});

describe("STAGE-0 Slice 5: Vietnamese marketplace size presets", () => {
  it("Shopee/Lazada/TikTok Shop product frames exist with 1:1 dimensions", () => {
    expect(SIZE_PRESETS["Shopee Product (1:1)"]).toEqual({ width: 1024, height: 1024 });
    expect(SIZE_PRESETS["Lazada Product (1:1)"]).toEqual({ width: 800, height: 800 });
    expect(SIZE_PRESETS["TikTok Shop Product (1:1)"]).toEqual({ width: 1080, height: 1080 });
    // the existing TikTok (9:16) stays — no collision
    expect(SIZE_PRESETS["TikTok (9:16)"]).toEqual({ width: 1080, height: 1920 });
  });
});
