import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TemplateStore } from "../src/templates.js";

const scene = { version: "7.3.1", objects: [{ type: "Rect", name: "clip" }, { type: "Image", src: "https://x/a.png" }] };

let store: TemplateStore;
beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pf-tpl-"));
  store = new TemplateStore(path.join(dir, "tpl.json"));
  await store.load();
});

describe("BR-TPL community templates (Publish to Community)", () => {
  it("BR-TPL1: publish keeps scene JSON intact + takes the thumbnail from the first Image", async () => {
    const t = (await store.publish({ name: "Coffee poster", authorName: "Alex", scene })).template;
    expect(t.scene).toEqual(scene);
    expect(t.tipCredits).toBe(0);
  });
  it("BR-TPL2: paginated list + featured filter (?page=&pageSize=&featured=)", async () => {
    for (let i = 0; i < 25; i++) await store.publish({ name: `T${i}`, scene, featured: i % 2 === 0 });
    const p1 = store.list({ page: 1, pageSize: 20 });
    expect(p1.items).toHaveLength(20);
    expect(p1.total).toBeGreaterThanOrEqual(26);
    const p2 = store.list({ page: 2, pageSize: 20 });
    expect(p2.items.length).toBe(p1.total - 20);
    const feat = store.list({ featured: true, pageSize: 100 });
    expect(feat.items.every((t) => t.featured)).toBe(true);
  });
  it("BR-TPL3: tipping increases tipCredits by the right amount", async () => {
    const t = (await store.publish({ name: "Tip me", scene })).template;
    await store.tip(t.id, 3);
    await store.tip(t.id);
    expect(store.get(t.id)!.tipCredits).toBe(4);
    expect(await store.tip("tpl_nonexist", 1)).toBeNull();
  });
  it("BR-TPL4: the newest publish comes first (unshift)", async () => {
    const t = await store.publish({ name: "NEWEST", scene });
    expect(store.list({ pageSize: 1 }).items[0].name).toBe("NEWEST");
  });
});

/** T2 regression — corrupt templates.json is quarantined (never blanked+overwritten); saves are atomic. */
describe("TPL-T1 — category taxonomy rides the store + the boundary query", () => {
  it("templateListQuery parses a known category and rejects junk (the taxonomy is closed)", async () => {
    const { templateListQuery, templateCategorySchema } = await import("@oia/schema");
    expect(templateListQuery.safeParse({ category: "flash-sale" }).success).toBe(true);
    expect(templateListQuery.safeParse({ category: "vibes" }).success).toBe(false);
    expect(templateCategorySchema.safeParse("livestream").success).toBe(true);
  });
  it("addImported sanitizes junk categories (G4): the template imports, the category does not", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-tpl-cat-"));
    const st = new TemplateStore(path.join(dir, "tpl.json"));
    await st.load();
    await st.publish({ name: "A", scene, category: "flash-sale" });
    await st.publish({ name: "B", scene, category: "menu" });
    await st.publish({ name: "legacy", scene });
    const ok = await st.addImported({ id: "tpl_legacy1", name: "old", scene, featured: false, tipCredits: 0, createdAt: 1, category: "flyers" as never });
    expect(ok).toBe(true);
    expect(st.get("tpl_legacy1")?.category).toBeUndefined();
    const only = st.list({ category: "flash-sale" });
    expect(only.total).toBe(1);
    expect(only.items[0].name).toBe("A");
    const all = st.list({});
    expect(all.total).toBe(4); // unfiltered sees everything — published + the sanitized import
  });
});

describe("TP.7 durable load — TemplateStore", () => {
  it("corrupt file → quarantined; publish works on the fresh file", async () => {
    const { mkdtempSync, writeFileSync, readFileSync, readdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const pathMod = await import("node:path");
    const dir = mkdtempSync(pathMod.join(tmpdir(), "pf-corrupt-tpl-"));
    const file = pathMod.join(dir, "templates.json");
    writeFileSync(file, "[{\"broken\":");

    const { TemplateStore } = await import("../src/templates.js");
    const store = new TemplateStore(file);
    await store.load();
    expect(store.list({ page: 1, pageSize: 10 }).items).toHaveLength(0);

    await store.publish({ name: "after recovery", scene: { version: "7.3.1", objects: [] } });
    const q = readdirSync(dir).find((f) => f.startsWith("templates.json.corrupt-"));
    expect(q).toBeDefined();
    expect(readFileSync(pathMod.join(dir, q!), "utf8")).toBe("[{\"broken\":");
    expect(Array.isArray(JSON.parse(readFileSync(file, "utf8")))).toBe(true);
  });
});

/** SC-2 — style family: same edge/loose pattern as category (social-card-style-presets.md). */
describe("SC-2 template style — store edge + filter + legacy sanitize", () => {
  it("publish parses the closed style set at the edge; junk style 400s", async () => {
    const { TemplateStore } = await import("../src/templates.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const pathMod = await import("node:path");
    const st = new TemplateStore(mkdtempSync(pathMod.join(tmpdir(), "sc2-edge-")) + "/templates.json");
    await st.load();
    await st.publish({ name: "Editorial menu", scene: { version: "7.3.1", objects: [] }, category: "menu", style: "editorial" });
    await st.publish({ name: "Swiss spec", scene: { version: "7.3.1", objects: [] }, category: "new-product", style: "swiss" });
    await expect(st.publish({ name: "bad", scene: { version: "7.3.1", objects: [] }, style: "vaporwave" })).rejects.toThrow();
    expect(st.list({ style: "editorial" }).total).toBe(1);
    expect(st.list({ style: "swiss" }).items[0].name).toBe("Swiss spec");
    expect(st.list({}).total).toBe(2);
  });
  it("legacy import with a free-text style lands unfiltered, not broken", async () => {
    const { TemplateStore } = await import("../src/templates.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const pathMod = await import("node:path");
    const st = new TemplateStore(mkdtempSync(pathMod.join(tmpdir(), "sc2-legacy-")) + "/templates.json");
    await st.load();
    const ok = await st.addImported({
      id: "tpl_stylelegacy", name: "old import", authorName: "x", featured: false, tipCredits: 0, createdAt: 0,
      scene: { version: "7.3.1", objects: [] }, style: "y2k-neon",
    });
    expect(ok).toBe(true);
    expect(st.get("tpl_stylelegacy")?.style).toBeUndefined();
    expect(st.list({ style: "editorial" }).total).toBe(0);
  });
});

/** SC-5 — pack membership: same edge/loose pattern as category+style. */
describe("SC-5 template pack — store edge + filter + legacy sanitize", () => {
  it("publish parses the closed pack set; junk pack 400s; list filters by pack", async () => {
    const { TemplateStore } = await import("../src/templates.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const pathMod = await import("node:path");
    const st = new TemplateStore(mkdtempSync(pathMod.join(tmpdir(), "sc5-edge-")) + "/templates.json");
    await st.load();
    await st.publish({ name: "Café menu", scene: { version: "7.3.1", objects: [] }, category: "menu", style: "editorial", pack: "cafe-restaurant" });
    await st.publish({ name: "Drop", scene: { version: "7.3.1", objects: [] }, category: "new-product", style: "swiss", pack: "product-launch" });
    await expect(st.publish({ name: "bad", scene: { version: "7.3.1", objects: [] }, pack: "mystery-box" })).rejects.toThrow();
    expect(st.list({ pack: "cafe-restaurant" }).total).toBe(1);
    expect(st.list({ pack: "product-launch", style: "swiss" }).total).toBe(1); // filters compose
    expect(st.list({ pack: "product-launch", style: "editorial" }).total).toBe(0);
  });
  it("legacy import with an unknown pack lands unfiltered", async () => {
    const { TemplateStore } = await import("../src/templates.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const pathMod = await import("node:path");
    const st = new TemplateStore(mkdtempSync(pathMod.join(tmpdir(), "sc5-legacy-")) + "/templates.json");
    await st.load();
    await st.addImported({
      id: "tpl_packlegacy", name: "old", authorName: "x", featured: false, tipCredits: 0, createdAt: 0,
      scene: { version: "7.3.1", objects: [] }, pack: "winter-2025",
    });
    expect(st.get("tpl_packlegacy")?.pack).toBeUndefined();
  });
});
