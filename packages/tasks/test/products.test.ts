import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProductStore } from "../src/products.js";
import { LocalFileStore } from "../src/storage.js";

let dir: string; let store: ProductStore; let files: LocalFileStore;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "oia-prd-"));
  files = new LocalFileStore(path.join(dir, "files"));
  await files.hydrate();
  store = new ProductStore(dir, files);
  await store.load();
});

describe("W1.1 ProductStore: owner profile model", () => {
  it("creates a profile with only the owner fields (no structured price/category)", async () => {
    const photoRef = (await files.put(new Uint8Array([1, 2, 3]), "png")).url; // bytes are opaque to the store, it only probes existence
    const p = await store.upsert({
      name: "Serum HA 30ml",
      description: "Gia 289.000d. HA 3 kich thuoc phan tu.",
      tags: ["Serum", "LUMA"],
      photos: [{ ref: photoRef }],
      lockNotes: "Khong doi logo",
      facts: [{ id: "f1", text: "15.000 mg HA / 30 ml", source: { kind: "file", name: "tech sheet.pdf", detail: "p.1" } }],
    });
    expect(store.get(p.id)!.facts[0].kept).toBe(true); // kept defaults on
    expect(store.get(p.id)!.photos[0].note).toBe(""); // photo note defaults
    expect((store.get(p.id) as unknown as Record<string, unknown>)["price"]).toBeUndefined();
  });

  it("list() returns a copy: mutating it never corrupts the store", async () => {
    const before = store.list().length;
    store.list().push({ id: "x", name: "injected", description: "", photos: [], tags: [], lockNotes: "", facts: [] } as never);
    expect(store.list().length).toBe(before);
  });

  it("update keeps id + createdAt, refreshes updatedAt; newest-first order, edits never reorder", async () => {
    const a = await store.upsert({ name: "A" });
    await new Promise((r) => setTimeout(r, 3));
    const b = await store.upsert({ name: "B" });
    const names = () => store.list().map((p) => p.name);
    expect(names()[0]).toBe("B"); // createdAt DESC
    await new Promise((r) => setTimeout(r, 3));
    const a2 = await store.upsert({ ...a, name: "A2" });
    expect(a2.id).toBe(a.id);
    expect(a2.createdAt).toBe(a.createdAt);
    expect(a2.updatedAt!).toBeGreaterThan(a.createdAt!);
    expect(names()).toEqual(["B", "A2", "Serum HA 30ml"]); // newest first; the edit did NOT bump A2 above B
  });

  it("normalizes: name trimmed, tags deduped case-insensitively (first casing wins)", async () => {
    const p = await store.upsert({ name: "  Trimmed name  ", tags: ["Serum", "serum ", "LUMA", "lumA"] });
    expect(p.name).toBe("Trimmed name");
    expect(p.tags).toEqual(["Serum", "LUMA"]);
  });

  it("rejects over-limit, malformed, and duplicate-fact-id input (limits are the contract)", () => {
    expect(() => store.validate({ name: "x", description: "a".repeat(20_001) })).toThrow(/description/);
    expect(() => store.validate({ name: "x", tags: Array.from({ length: 31 }, (_, i) => `t${i}`) })).toThrow(/tags/);
    expect(() => store.validate({ name: "x", photos: [{ ref: "file:///etc/passwd" }] })).toThrow(/photos/);
    expect(() => store.validate({ name: "x", photos: [{ ref: "/api/files/uploads/../x" }] })).toThrow(/photos/);
    expect(() => store.validate({ name: "   " })).toThrow(/name/); // whitespace-only is NOT a name
    expect(() => store.validate({ name: "x", facts: [{ id: "f", text: "ok", source: { kind: "dream", name: "x" } }] })).toThrow(/facts/);
    expect(() => store.validate({ name: "x", facts: [{ id: "f", text: "ok", source: { kind: "typed", name: "me" } }, { id: "f", text: "dup", source: { kind: "typed", name: "me" } }] })).toThrow(/facts.*unique/);
    // unknown keys are refused (strict), so schema drift fails loudly, not silently
    expect(() => store.validate({ name: "x", price: 129000 })).toThrow();
  });

  it("photo refs pointing at missing assets are refused at the door, named", async () => {
    await expect(store.upsert({ name: "X", photos: [{ ref: "/api/files/uploads/20990101/nope.png" }] }))
      .rejects.toThrow(/not found in the asset store.*nope\.png/);
  });

  it("http photo refs skip the local probe (D15: the store never fetches)", async () => {
    const p = await store.upsert({ name: "Remote-photo product", photos: [{ ref: "https://cdn.example/packshot.png" }] });
    expect(store.get(p.id)!.photos[0].ref).toBe("https://cdn.example/packshot.png");
  });

  it("regression (W1.1 shot gate): an explicit `id: undefined` key crossing the wire creates instead of throwing", () => {
    // structured clone keeps the key, the spread used to overwrite the assigned id
    const p = store.validate({ name: "X", id: undefined });
    expect(typeof p.id).toBe("string");
    expect(p.id.startsWith("prd_")).toBe(true);
  });

  it("remove is truthful, per-file: the record file is gone, others untouched", async () => {
    const c = await store.upsert({ name: "C" });
    const file = path.join(dir, "products", `${c.id}.json`);
    expect(existsSync(file)).toBe(true);
    expect(await store.remove(c.id)).toBe(true);
    expect(await store.remove(c.id)).toBe(false); // never lies about a second remove
    expect(existsSync(file)).toBe(false);
    expect(store.list().length).toBeGreaterThan(0); // the others survived
  });

  it("a profile written by one store instance loads in a fresh one (durable, no in-memory-only state)", async () => {
    await store.upsert({ name: "Durable", facts: [{ id: "f9", text: "giu nguon", source: { kind: "shop", name: "Shop" } }] });
    const second = new ProductStore(dir, new LocalFileStore(path.join(dir, "files")));
    await second.load();
    expect(second.list().some((p) => p.name === "Durable" && p.facts[0].source.kind === "shop")).toBe(true);
  });

  it("a corrupt product file is quarantined ALONE (bytes survive, siblings load)", async () => {
    const good = await store.upsert({ name: "Good one" });
    const badId = "prd_deadbeef";
    writeFileSync(path.join(dir, "products", `${badId}.json`), "{ not json", "utf8");
    const second = new ProductStore(dir, files);
    await second.load(); // must not throw
    expect(second.get(good.id)).toBeDefined(); // the sibling survived
    const quarantined = readdirSync(path.join(dir, "products")).some((f) => f.startsWith(`${badId}.json.corrupt-`));
    expect(quarantined).toBe(true); // bytes were kept, not silently discarded
    expect(second.get(badId)).toBeUndefined();
  });

  it("the legacy monolith products.json is absorbed: entries become files, the source is archived", async () => {
    const legacyDir = mkdtempSync(path.join(tmpdir(), "oia-prd-leg-"));
    const lf = new LocalFileStore(path.join(legacyDir, "files"));
    await lf.hydrate();
    const ref = (await lf.put(new Uint8Array([7, 7]), "png")).url;
    writeFileSync(path.join(legacyDir, "products.json"), JSON.stringify([
      { id: "prd_leg1", name: "Legacy one", description: "", photos: [{ ref, note: "" }], tags: [], lockNotes: "", facts: [] },
      { id: "prd_leg2", name: "Legacy two", description: "", photos: [], tags: [], lockNotes: "", facts: [] },
    ]), "utf8");
    const s = new ProductStore(legacyDir, lf);
    await s.load();
    expect(s.get("prd_leg1")).toBeDefined();
    expect(existsSync(path.join(legacyDir, "products", "prd_leg1.json"))).toBe(true);
    expect(existsSync(path.join(legacyDir, "products.json"))).toBe(false); // archived, not left to double-load
    expect(readdirSync(legacyDir).some((f) => f.startsWith("products.json.legacy-"))).toBe(true);
    const onDisk = JSON.parse(readFileSync(path.join(legacyDir, "products", "prd_leg1.json"), "utf8"));
    expect(onDisk.name).toBe("Legacy one");
  });
});
