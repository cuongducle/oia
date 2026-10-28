import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
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
