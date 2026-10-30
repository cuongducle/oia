import { describe, expect, it, beforeAll } from "vitest";
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProjectStore, ChatSessionStore } from "../src/projects.js";

let dir: string; let projects: ProjectStore; let chats: ChatSessionStore;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "pf-persist-"));
  projects = new ProjectStore(dir);
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
const quarantineOf = (dir: string, base: string) =>
  readdirSync(dir).find((f) => f.startsWith(`${base}.corrupt-`));

describe("TP.7 durable load — corrupt file is quarantined, not overwritten", () => {
  it("projects.json (legacy monolith) corrupt → bytes preserved in a .corrupt sibling; store starts empty and SAVES do not destroy them", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-corrupt-prj-"));
    const file = path.join(dir, "projects.json");
    const poison = '{"items": [{"id": "prj_real", '; // truncated mid-write
    writeFileSync(file, poison);

    const store = new ProjectStore(dir);
    await store.load();
    expect(store.recent()).toHaveLength(0); // starts empty
    // load() MOVED the poison aside (rename) — the bytes were never overwritten or deleted
    const moved = quarantineOf(dir, "projects.json");
    expect(moved).toBeDefined();
    expect(readFileSync(path.join(dir, moved!), "utf8")).toBe(poison);

    await store.create({ name: "fresh start" }); // writes per-project files only
    const q = quarantineOf(dir, "projects.json");
    expect(q).toBe(moved); // the corrupt bytes were moved aside, not deleted
    expect(readFileSync(path.join(dir, q!), "utf8")).toBe(poison);
    expect(readdirSync(path.join(dir, "projects"))).toHaveLength(1); // fresh valid per-project file
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
    const file = path.join(dir, "projects.json");
    writeFileSync(file, "{}");
    const store = new ProjectStore(dir);
    await store.load();
    expect(store.recent()).toHaveLength(0);
    expect(quarantineOf(dir, "projects.json")).toBeDefined();
  });

  it("a MISSING store is a legitimate fresh start — no quarantine noise", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-fresh-"));
    const store = new ProjectStore(dir);
    await store.load();
    expect(store.recent()).toHaveLength(0);
    expect(readdirSync(dir)).toEqual(["projects"]); // only the (empty) per-project dir
    expect(readdirSync(path.join(dir, "projects"))).toHaveLength(0);
  });
});

/** Reorg step 5 — per-project files: the blast radius of any single bad file is ONE project. */
describe("per-project files (reorg step 5)", () => {
  const prjDir = (dir: string) => path.join(dir, "projects");

  function writeProjectFile(dir: string, id: string, over: Record<string, unknown> = {}) {
    writeFileSync(path.join(prjDir(dir), `${id}.json`), JSON.stringify({
      id, name: id, schemaVersion: 1, updatedAt: 1,
      pages: [{ id: "page_1", width: 10, height: 10, canvas: { version: "7.3.1", objects: [] } }],
      ...over,
    }));
  }

  it("create/save/remove write exactly one project file each; remove deletes the file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-perfile-"));
    const store = new ProjectStore(dir);
    await store.load();
    const a = await store.create({ name: "A" });
    const b = await store.create({ name: "B" });
    expect(readdirSync(prjDir(dir)).sort()).toEqual([`${a.id}.json`, `${b.id}.json`].sort());
    await store.saveScene(a.id, { name: "A2" });
    expect(JSON.parse(readFileSync(path.join(prjDir(dir), `${a.id}.json`), "utf8")).name).toBe("A2");
    await store.remove(a.id);
    expect(readdirSync(prjDir(dir))).toEqual([`${b.id}.json`]);
    expect(existsSync(path.join(prjDir(dir), `${a.id}.json`))).toBe(false);
  });

  it("kill app → reopen: a fresh store on the same dataDir sees the same data (the step-5 gate)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-reopen-"));
    const first = new ProjectStore(dir);
    await first.load();
    const a = await first.create({ name: "A" });
    await first.create({ name: "B" });
    await first.saveScene(a.id, { name: "A-renamed" });

    const reopened = new ProjectStore(dir); // "process restarted" — nothing in memory
    await reopened.load();
    expect(reopened.recent().map((p) => p.name)).toEqual(["A-renamed", "B"]);
    expect(reopened.get(a.id)!.name).toBe("A-renamed");
  });

  it("ONE corrupt project file is quarantined ALONE — every other project survives (the step-5 blast-radius gate)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-blast-"));
    mkdirSync(prjDir(dir), { recursive: true });
    writeProjectFile(dir, "prj_ok1");
    writeFileSync(path.join(prjDir(dir), "prj_bad.json"), "{ truncated mid-write");
    writeProjectFile(dir, "prj_ok2");

    const store = new ProjectStore(dir);
    await store.load();
    expect(store.recent().map((p) => p.id).sort()).toEqual(["prj_ok1", "prj_ok2"]); // both survive
    expect(quarantineOf(prjDir(dir), "prj_bad.json")).toBeDefined(); // the poison was isolated
    expect(readFileSync(path.join(prjDir(dir), quarantineOf(prjDir(dir), "prj_bad.json")!), "utf8")).toBe("{ truncated mid-write");
  });

  it("a misnamed file is RECOVERED to its canonical name (no data loss), a true duplicate is quarantined", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-mismatch-"));
    mkdirSync(prjDir(dir), { recursive: true });
    writeProjectFile(dir, "prj_real");
    writeProjectFile(dir, "prj_wrongname", { id: "prj_misnamed", name: "misnamed copy" });
    const store = new ProjectStore(dir);
    await store.load();
    // recovered under the id it declares — visible, exactly one copy
    expect(store.recent().map((p) => p.id).sort()).toEqual(["prj_misnamed", "prj_real"]);
    expect(readdirSync(prjDir(dir)).sort()).toEqual(["prj_misnamed.json", "prj_real.json"]);

    // a TRUE duplicate (canonical name already occupied by another file) still isolates
    writeProjectFile(dir, "extra_copy", { id: "prj_real", name: "duplicate copy" });
    const second = new ProjectStore(dir);
    await second.load();
    expect(second.recent().map((p) => p.id)).toEqual(["prj_misnamed", "prj_real"]); // one copy each
    expect(quarantineOf(prjDir(dir), "extra_copy.json")).toBeDefined(); // duplicate bytes preserved
  });

  it("a FAILED quarantine never bricks the store — the other projects still load (blast radius stays per-file)", async () => {
    if (process.getuid?.() === 0) return; // root ignores mode bits — the persistenceHealth precedent
    const dir = mkdtempSync(path.join(tmpdir(), "pf-quarantine-fail-"));
    mkdirSync(prjDir(dir), { recursive: true });
    writeProjectFile(dir, "prj_ok1");
    writeFileSync(path.join(prjDir(dir), "prj_bad1.json"), '{"broken": '); // poison — quarantine will try and FAIL
    writeFileSync(path.join(prjDir(dir), "prj_bad2.json"), "{");
    // make the directory read-only: the quarantine RENAME inside must fail (EACCES)
    chmodSync(prjDir(dir), 0o500);
    try {
      const store = new ProjectStore(dir);
      await store.load(); // must NOT throw
      expect(store.recent().map((p) => p.id)).toEqual(["prj_ok1"]); // healthy files loaded
      expect(readdirSync(prjDir(dir)).sort()).toEqual(["prj_bad1.json", "prj_bad2.json", "prj_ok1.json"]); // nothing moved, nothing destroyed
    } finally {
      chmodSync(prjDir(dir), 0o700); // restore for tmp cleanup
    }
  });

  it("an UNREADABLE file is skipped — the store still boots (per-file blast radius)", async () => {
    if (process.getuid?.() === 0) return;
    const dir = mkdtempSync(path.join(tmpdir(), "pf-read-fail-"));
    mkdirSync(prjDir(dir), { recursive: true });
    writeProjectFile(dir, "prj_ok1");
    writeProjectFile(dir, "prj_locked");
    chmodSync(path.join(prjDir(dir), "prj_locked.json"), 0o000);
    try {
      const store = new ProjectStore(dir);
      await store.load();
      expect(store.recent().map((p) => p.id)).toEqual(["prj_ok1"]);
    } finally {
      chmodSync(path.join(prjDir(dir), "prj_locked.json"), 0o600);
    }
  });

  it("legacy monolith projects.json is absorbed into per-project files and ARCHIVED (bytes never deleted)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-legacy-"));
    const monolith = JSON.stringify([
      { id: "prj_old1", name: "old 1", pages: [{ id: "page_1", width: 10, height: 10, canvas: { version: "7.3.1", objects: [] } }], updatedAt: 5 },
      { id: "prj_old2", name: "old 2", pages: [{ id: "page_1", width: 10, height: 10, canvas: { version: "7.3.1", objects: [] } }], updatedAt: 9 },
    ]);
    writeFileSync(path.join(dir, "projects.json"), monolith);

    const store = new ProjectStore(dir);
    await store.load();
    expect(store.recent().map((p) => p.name)).toEqual(["old 2", "old 1"]); // updatedAt DESC
    expect(readdirSync(prjDir(dir)).sort()).toEqual(["prj_old1.json", "prj_old2.json"]);
    const archive = readdirSync(dir).find((f) => f.startsWith("projects.json.legacy-"));
    expect(archive).toBeDefined();
    expect(readFileSync(path.join(dir, archive!), "utf8")).toBe(monolith); // original bytes kept

    // idempotent: second boot does not re-absorb, no duplicates
    const second = new ProjectStore(dir);
    await second.load();
    expect(second.recent().map((p) => p.name)).toEqual(["old 2", "old 1"]);
    expect(readdirSync(prjDir(dir)).sort()).toEqual(["prj_old1.json", "prj_old2.json"]);
  });

  it("a per-project file WINS over a legacy monolith entry with the same id (it was saved after the split)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-legacy-win-"));
    mkdirSync(prjDir(dir), { recursive: true });
    writeProjectFile(dir, "prj_dup", { name: "newer per-file copy", updatedAt: 20 });
    writeFileSync(path.join(dir, "projects.json"), JSON.stringify([
      { id: "prj_dup", name: "stale monolith copy", pages: [{ id: "page_1", width: 10, height: 10, canvas: { version: "7.3.1", objects: [] } }] },
    ]));
    const store = new ProjectStore(dir);
    await store.load();
    expect(store.get("prj_dup")!.name).toBe("newer per-file copy");
    expect(store.recent()).toHaveLength(1);
  });

  it("a legacy id that is unsafe as a file name is re-issued (absorb and import lane)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-unsafe-id-"));
    writeFileSync(path.join(dir, "projects.json"), JSON.stringify([
      { id: "../escape", name: "evil", pages: [{ id: "page_1", width: 10, height: 10, canvas: { version: "7.3.1", objects: [] } }] },
    ]));
    const store = new ProjectStore(dir);
    await store.load();
    expect(store.recent()).toHaveLength(1);
    expect(store.recent()[0].id).toMatch(/^prj_[a-z0-9_]+$/); // re-issued, not "../escape"
    expect(readdirSync(prjDir(dir))).toHaveLength(1);
  });
});
