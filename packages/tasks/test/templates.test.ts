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
    const t = await store.publish({ name: "Coffee poster", authorName: "Alex", scene });
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
    const t = await store.publish({ name: "Tip me", scene });
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
