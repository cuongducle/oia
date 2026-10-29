import { describe, expect, it } from "vitest";
import type { FabricObject, SceneCanvas } from "@oia/schema";
import { mergeScenePreservingUserObjects, stampUser, objectOrigin } from "../src/provenance.js";
import { SIZE_PRESETS } from "../src/presets.js";

function img(name: string, origin: FabricObject["origin"]): FabricObject {
  return { type: "Image", name, origin, left: 0, top: 0, width: 100, height: 100, src: "https://x/y.png", visible: true };
}

/** The exact scenario from the design: place a layer → run a refinement → assert it survives. */
describe("STAGE-0 TP.10: the non-destruction rule (user layers survive AI refinement)", () => {
  const current: SceneCanvas = {
    version: "7.3.1",
    objects: [
      { type: "Rect", name: "clip", left: 0, top: 0, width: 900, height: 1200, fill: "white", visible: true },
      img("artwork", "generated"), // the old generated artwork — replaced by the new one
      img("product-photo", "user"), // the user's real product photo — MUST survive
      { type: "Textbox", name: "block:price", origin: "generated", text: "20%", left: 10, top: 10, width: 100, height: 40, visible: true },
      { type: "Textbox", name: "my own note", text: "hot", left: 400, top: 900, width: 80, height: 30, visible: true }, // legacy: no origin
    ],
  };
  const incoming: SceneCanvas = {
    version: "7.3.1",
    objects: [
      { type: "Rect", name: "clip", left: 0, top: 0, width: 900, height: 1200, fill: "white", visible: true },
      img("artwork", "generated"), // the NEW artwork
      { type: "Textbox", name: "block:price", origin: "generated", text: "30%", left: 10, top: 10, width: 100, height: 40, visible: true },
    ],
  };

  it("a placed layer survives a refinement — position intact, on top of the new base", () => {
    const { scene, preserved, lostUserObjects } = mergeScenePreservingUserObjects(current, incoming);
    const names = scene.objects.map((o) => o.name);
    expect(names).toContain("product-photo"); // the design's worst-case failure is impossible
    expect(names).toContain("my own note"); // legacy no-origin objects default to "user" (conservative)
    expect(lostUserObjects).toEqual([]);
    expect(preserved.map((o) => o.name)).toEqual(["product-photo", "my own note"]);
    // position preserved
    const note = scene.objects.find((o) => o.name === "my own note")!;
    expect(note.top).toBe(900);
    // the new base replaced the generated layer (old artwork gone, new artwork + new price block in)
    expect(names.filter((n) => n === "artwork")).toHaveLength(1);
    const price = scene.objects.find((o) => o.name === "block:price")!;
    expect(price.text).toBe("30%");
    // exactly one clip rect (the incoming one)
    expect(names.filter((n) => n === "clip")).toHaveLength(1);
    // user objects stack AFTER the generated base
    expect(scene.objects.map((o) => o.name).indexOf("product-photo")).toBeGreaterThan(names.indexOf("artwork"));
  });

  it("stampUser marks an object; objectOrigin treats undefined as user (legacy default)", () => {
    const o = { type: "Textbox", text: "x" } as FabricObject;
    expect(objectOrigin(o)).toBe("user"); // legacy conservative default
    stampUser(o);
    expect(objectOrigin(o)).toBe("user");
    expect(objectOrigin(img("g", "generated"))).toBe("generated");
  });

  it("a pure-generated current scene merges to exactly the incoming scene (nothing extra)", () => {
    const genOnly: SceneCanvas = {
      version: "7.3.1",
      objects: [
        { type: "Rect", name: "clip", left: 0, top: 0, width: 1, height: 1, fill: "white", visible: true },
        img("artwork", "generated"),
      ],
    };
    const { scene, preserved } = mergeScenePreservingUserObjects(genOnly, incoming);
    expect(preserved).toEqual([]);
    expect(scene.objects.map((o) => o.name)).toEqual(["clip", "artwork", "block:price"]);
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
