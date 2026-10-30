import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProjectStore, ChatSessionStore } from "../src/projects.js";

let dir: string; let projects: ProjectStore; let chats: ChatSessionStore;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "pf-persist-"));
  projects = new ProjectStore(path.join(dir, "prj.json"));
  chats = new ChatSessionStore(path.join(dir, "chats.json"));
  await projects.load(); await chats.load();
});

describe("BR-PERSIST Project store", () => {
  it("create blank có 1 page + clip Rect 1360×2048", async () => {
    const p = await projects.create({});
    expect(p.pages).toHaveLength(1);
    expect(p.pages[0].canvas.objects[0]).toMatchObject({ name: "clip", width: 1360, height: 2048 });
  });
  it("saveScene updates pages and moves the project to the front of Recent", async () => {
    const a = await projects.create({ name: "A" });
    const b = await projects.create({ name: "B" });
    await projects.saveScene(a.id, { name: "A2", pages: a.pages });
    expect(projects.recent()[0].name).toBe("A2");
    expect(projects.get(b.id)!.name).toBe("B");
  });
  it("an invalid pages schema throws (nothing corrupt is saved)", async () => {
    const p = await projects.create({});
    await expect(projects.saveScene(p.id, { pages: [] })).rejects.toThrow();
  });
});

describe("BR-PERSIST' Chat session store", () => {
  it("append names the session from the first prompt", async () => {
    const s = chats.create();
      await chats.append(s.id, "coffee poster 20% off", { content: "Done creating" });
      expect(chats.get(s.id)!.name).toBe("coffee poster 20% off");
  });
  it("assistant messages keep the latest canvas for replay", async () => {
    const s = chats.create();
    await chats.append(s.id, "test", {
      content: "x",
      renderData: { msgMeta: [{ type: "canvas", id: "c1", canvas: { version: "7.3.1", objects: [] } }] },
    });
    const m = chats.get(s.id)!.messages.at(-1)!;
    expect(m.canvas).toMatchObject({ version: "7.3.1" });
  });
  it("recent sorts by updatedAt DESC", async () => {
    const s1 = chats.create("old"); await new Promise((r) => setTimeout(r, 5));
    const s2 = chats.create("new");
    await chats.append(s2.id, "hi", { content: "" });
    const names = chats.recent().map((x) => x.name);
    expect(names.indexOf("new")).toBeLessThan(names.indexOf("old"));
  });
});

/**
 * T2 regression — a corrupt store file must never be silently blanked and then
 * overwritten with `[]` by the next autosave (the old `catch { items = [] }`
 * pattern destroyed every project the first time one byte went bad).
 */
describe("TP.7 durable load — corrupt file is quarantined, not overwritten", () => {
  const quarantineOf = (dir: string, base: string) =>
    readdirSync(dir).find((f) => f.startsWith(`${base}.corrupt-`));

  it("projects.json corrupt → bytes preserved in a .corrupt sibling; store starts empty and SAVES do not destroy them", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-corrupt-prj-"));
    const file = path.join(dir, "prj.json");
    const poison = '{"items": [{"id": "prj_real", '; // truncated mid-write
    writeFileSync(file, poison);

    const store = new ProjectStore(file);
    await store.load();
    expect(store.recent()).toHaveLength(0); // starts empty
    // load() MOVED the poison aside (rename) — the bytes were never overwritten or deleted
    const moved = quarantineOf(dir, "prj.json");
    expect(moved).toBeDefined();
    expect(readFileSync(path.join(dir, moved!), "utf8")).toBe(poison);

    await store.create({ name: "fresh start" }); // triggers save()
    const q = quarantineOf(dir, "prj.json");
    expect(q).toBe(moved); // the corrupt bytes were moved aside, not deleted
    expect(readFileSync(path.join(dir, q!), "utf8")).toBe(poison);
    expect(JSON.parse(readFileSync(file, "utf8"))).toBeInstanceOf(Array); // fresh valid file
  });

  it("chat-sessions.json corrupt → quarantined the same way", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-corrupt-chats-"));
    const file = path.join(dir, "chats.json");
    writeFileSync(file, "not json at all");
    const store = new ChatSessionStore(file);
    await store.load();
    expect(quarantineOf(dir, "chats.json")).toBeDefined(); // load() moved the poison
    store.create("after corruption"); // save() is fire-and-forget here — poll for the fresh file
    let fresh = false;
    for (let i = 0; i < 40 && !fresh; i++) {
      await new Promise((r) => setTimeout(r, 25));
      fresh = existsSync(file);
    }
    expect(fresh).toBe(true);
    expect(readFileSync(path.join(dir, quarantineOf(dir, "chats.json")!), "utf8")).toBe("not json at all");
  });

  it("valid JSON that is NOT an array is corruption too ({} would break every consumer)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-corrupt-shape-"));
    const file = path.join(dir, "prj.json");
    writeFileSync(file, "{}");
    const store = new ProjectStore(file);
    await store.load();
    expect(store.recent()).toHaveLength(0);
    expect(quarantineOf(dir, "prj.json")).toBeDefined();
  });

  it("a MISSING file is a legitimate fresh start — no quarantine noise", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-fresh-"));
    const store = new ProjectStore(path.join(dir, "prj.json"));
    await store.load();
    expect(store.recent()).toHaveLength(0);
    expect(readdirSync(dir)).toHaveLength(0);
  });
});
