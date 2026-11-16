import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProductStore } from "../src/products.js";

let dir: string; let store: ProductStore;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "oia-prd-"));
  store = new ProductStore(path.join(dir, "products.json"));
  await store.load();
});

describe("W1.1 ProductStore: owner profile model", () => {
  it("creates a profile with only the owner fields (no structured price/category)", async () => {
    const p = await store.upsert({
      name: "Serum cấp ẩm HA 30ml",
      description: "Giá 289.000đ. HA 3 kích thước phân tử.",
      tags: ["Serum", "LUMA"],
      photos: [{ ref: "/api/files/uploads/20261116/packshot.png" }],
      lockNotes: "Không đổi logo trên ảnh",
      facts: [{ id: "f1", text: "15.000 mg HA / 30 ml", source: { kind: "file", name: "tech sheet.pdf", detail: "p.1" } }],
    });
    expect(store.get(p.id)!.facts[0].kept).toBe(true); // kept defaults on
    expect(store.get(p.id)!.photos[0].note).toBe(""); // photo note defaults
    expect((store.get(p.id) as unknown as Record<string, unknown>)["price"]).toBeUndefined();
  });

  it("update keeps id + createdAt, refreshes updatedAt, preserves array order", async () => {
    const a = await store.upsert({ name: "A" });
    const b = await store.upsert({ name: "B" });
    await new Promise((r) => setTimeout(r, 5));
    const a2 = await store.upsert({ ...a, name: "A2" });
    expect(a2.id).toBe(a.id);
    expect(a2.createdAt).toBe(a.createdAt);
    expect(a2.updatedAt!).toBeGreaterThan(a.createdAt!);
    expect(store.list().map((p) => p.name)).toEqual(["Serum cấp ẩm HA 30ml", "A2", "B"]); // array order = creation order
  });

  it("rejects over-limit and malformed input (limits are the contract)", () => {
    expect(() => store.validate({ name: "x", description: "a".repeat(20_001) })).toThrow(/description/);
    expect(() => store.validate({ name: "x", tags: Array.from({ length: 31 }, (_, i) => `t${i}`) })).toThrow(/tags/);
    expect(() => store.validate({ name: "x", photos: [{ ref: "file:///etc/passwd" }] })).toThrow(/photos/);
    expect(() => store.validate({ name: "x", photos: [{ ref: "/api/files/uploads/../x" }] })).toThrow(/photos/);
    expect(() => store.validate({ name: "", })).toThrow(/name/);
    expect(() => store.validate({ name: "x", facts: [{ id: "f", text: "ok", source: { kind: "dream", name: "x" } }] })).toThrow(/facts/);
    expect(() => store.validate({ name: "x", facts: [{ id: "f", text: "x".repeat(501), source: { kind: "typed", name: "me" } }] })).toThrow(/facts/);
    // unknown keys are refused (strict), so schema drift fails loudly, not silently
    expect(() => store.validate({ name: "x", price: 129000 })).toThrow();
  });

  it("remove is truthful, and the file is an atomic JSON array on disk", async () => {
    const c = await store.upsert({ name: "C" });
    expect(await store.remove(c.id)).toBe(true);
    expect(await store.remove(c.id)).toBe(false); // never lies about a second remove
    const onDisk = JSON.parse(readFileSync(path.join(dir, "products.json"), "utf8"));
    expect(Array.isArray(onDisk)).toBe(true);
    expect(onDisk.every((p: { name: unknown }) => typeof p.name === "string")).toBe(true);
  });

  it("a profile written by one store instance loads in a fresh one (durable, no in-memory-only state)", async () => {
    await store.upsert({ name: "Durable", facts: [{ id: "f9", text: "giữ nguồn", source: { kind: "shop", name: "Shop" } }] });
    const second = new ProductStore(path.join(dir, "products.json"));
    await second.load();
    expect(second.list().some((p) => p.name === "Durable" && p.facts[0].source.kind === "shop")).toBe(true);
  });

  it("regression (W1.1 shot gate): an explicit `id: undefined` key crossing the wire creates instead of throwing", () => {
    // structured clone keeps the key, the spread used to overwrite the assigned id
    const p = store.validate({ name: "X", id: undefined });
    expect(typeof p.id).toBe("string");
    expect(p.id.startsWith("prd_")).toBe(true);
  });

  it("a corrupted products.json does not brick the store (durable load)", async () => {
    const corrDir = mkdtempSync(path.join(tmpdir(), "oia-prd-bad-"));
    const file = path.join(corrDir, "products.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, "{ not json", "utf8");
    const s = new ProductStore(file);
    await s.load(); // must not throw
    await s.upsert({ name: "After corruption" });
    expect(existsSync(file)).toBe(true);
    expect(s.list().length).toBe(1);
  });
});
