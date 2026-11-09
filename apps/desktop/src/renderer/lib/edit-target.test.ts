import { describe, expect, it } from "vitest";
import { resolveEditTarget } from "./edit-target.js";

const objects = [
  { name: "block:headline" },            // a text layer, never a target
  { name: "artwork", src: "oia://files/a.png" },
  { name: "sticker", src: "oia://files/b.png" },
];

describe("resolveEditTarget (A3-lite #1, selection can drop mid-flow)", () => {
  it("the live selection wins when it is an image", () => {
    expect(resolveEditTarget({ name: "sticker", src: "x" }, objects, "artwork")).toEqual({ src: "x", name: "sticker" });
  });
  it("selection dropped → falls back to the LAST image the user picked, by name", () => {
    expect(resolveEditTarget(null, objects, "sticker")).toEqual({ src: "oia://files/b.png", name: "sticker" });
  });
  it("a stale name that no longer exists on the canvas is ignored, no fabricated target", () => {
    expect(resolveEditTarget(null, objects, "deleted-layer")).toBeNull();
  });
  it("no selection and no memory → null (the honest no-selection branch)", () => {
    expect(resolveEditTarget(null, objects, null)).toBeNull();
    expect(resolveEditTarget({ name: "block:headline" }, objects, null)).toBeNull(); // text selection is not a target
  });
});
