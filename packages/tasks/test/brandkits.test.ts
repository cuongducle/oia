import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BrandKitStore, extractBrandKit } from "../src/brandkits.js";
import type { LlmProvider } from "@oia/providers";

let dir: string; let store: BrandKitStore;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "pf-bk-"));
  store = new BrandKitStore(path.join(dir, "bk.json"));
  await store.load();
});

  describe("BR-BK brand kit limits", () => {
    it("BR-BK1: guidance over 2000 characters is rejected", () => {
    expect(() => store.validate({ name: "x", guidance: "a".repeat(2001) })).toThrow(/guidance/);
  });
    it("BR-BK2: logos > 3, colors > 10, or fonts > 10 are rejected", () => {
    expect(() => store.validate({ name: "x", logos: ["https://a/1.png", "https://a/2.png", "https://a/3.png", "https://a/4.png"] })).toThrow(/logos/);
    expect(() => store.validate({ name: "x", colors: Array.from({ length: 11 }, () => "#123456") })).toThrow(/colors/);
    expect(() => store.validate({ name: "x", fonts: Array.from({ length: 11 }, (_, i) => `Font ${i}`) })).toThrow(/fonts/);
  });
    it("BR-BK4: a malformed hex color is rejected", () => {
    expect(() => store.validate({ name: "x", colors: ["red"] })).toThrow(/colors/);
    expect(() => store.validate({ name: "x", colors: ["#12g45z"] })).toThrow(/colors/);
    expect(() => store.validate({ name: "x", colors: ["#A1B2C3"] })).not.toThrow();
  });
    it("BR-BK3: defaulting a new kit disables the old one (exactly one active)", async () => {
    const a = await store.upsert({ name: "A", applyByDefault: true });
    const b = await store.upsert({ name: "B", applyByDefault: true });
    expect(store.get(a.id)!.applyByDefault).toBe(false);
    expect(store.get(b.id)!.applyByDefault).toBe(true);
    expect(store.active()?.name).toBe("B");
  });
});

describe("BR-EX Extract-from-file (auto-build brand kit)", () => {
  const llm: LlmProvider = {
    name: "stub",
    async chat() {
      return JSON.stringify({
        name: "Matcha Studio",
        guidance: "Pastel, friendly",
        colors: ["#F9A8D4", "#A7F3D0", "#bad-hex", "#FFFFFF", "#000000", "#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777"],
        fonts: ["Inter", "Be Vietnam Pro", "", "Roboto", "Slab", "F1", "F2", "F3", "F4", "F5", "F6", "F7"],
        logos: ["https://cdn/logo.png", "not-a-url"],
      });
    },
  };
    it("BR-EX1: a kit can be drafted from a brand book", async () => {
    const kit = await extractBrandKit(llm, { fileUrl: "https://x/brandbook.pdf" });
      expect(kit.name).toBe("Matcha Studio");
    expect(kit.colors).toContain("#F9A8D4");
  });
    it("BR-EX2: results are always clamped to limits + bad items filtered (bad hex, bad url, empty)", async () => {
    const kit = await extractBrandKit(llm, {});
    expect(kit.colors.length).toBeLessThanOrEqual(10);
    expect(kit.colors).not.toContain("#bad-hex");
    expect(kit.fonts.length).toBeLessThanOrEqual(10);
    expect(kit.fonts).not.toContain("");
    expect(kit.logos.length).toBeLessThanOrEqual(3);
    expect(kit.logos).not.toContain("not-a-url");
  });
});
