import { describe, it, expect } from "vitest";
import { importPlan, importableFile } from "../src/renderer/lib/loop-import.js";

describe("SIL import, image from the seller's own files", () => {
  it("keeps small images untouched", () => {
    expect(importPlan(1024, 1536)).toEqual({ keep: true, width: 1024, height: 1536 });
  });

  it("scales the long edge down to the cap, portrait and landscape", () => {
    expect(importPlan(3000, 4000)).toEqual({ keep: false, width: 1536, height: 2048 });
    expect(importPlan(6000, 3000)).toEqual({ keep: false, width: 2048, height: 1024 });
  });

  it("keeps exactly-at-cap images (no pointless re-encode)", () => {
    expect(importPlan(2048, 1365).keep).toBe(true);
  });

  it("rejects degenerate sizes without throwing", () => {
    expect(importPlan(0, 0)).toEqual({ keep: true, width: 0, height: 0 });
  });

  it("accepts png/jpeg/webp files only", () => {
    expect(importableFile(new File([], "a.png", { type: "image/png" }))).toBe(true);
    expect(importableFile(new File([], "a.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(importableFile(new File([], "a.webp", { type: "image/webp" }))).toBe(true);
    expect(importableFile(new File([], "a.gif", { type: "image/gif" }))).toBe(false);
    expect(importableFile(new File([], "a.txt", { type: "text/plain" }))).toBe(false);
  });
});
