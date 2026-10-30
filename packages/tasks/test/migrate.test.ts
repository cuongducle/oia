import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalFileStore } from "../src/storage.js";
import { migrateScene, migrateSrc, migrateRenderData, migrateProjectForSave, PersistenceError } from "../src/migrate.js";
import { ProjectStore, ChatSessionStore } from "../src/projects.js";
import type { SceneCanvas, Project } from "@oia/schema";
import { OIA_SCHEMA_VERSION } from "@oia/schema";

/** 1×1 PNG — a real decodable base64 payload. */
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`;

function makeStore(): { store: LocalFileStore; root: string } {
  const root = mkdtempSync(path.join(tmpdir(), "oia-migrate-"));
  return { store: new LocalFileStore(path.join(root, "files")), root };
}

function sceneWith(src: string): SceneCanvas {
  return {
    version: "7.3.1",
    objects: [
      { type: "Rect", name: "clip", left: 0, top: 0, width: 100, height: 100, fill: "white", visible: true },
      { type: "Image", name: "artwork", left: 0, top: 0, width: 100, height: 100, src, visible: true },
    ],
  };
}

describe("STAGE-0 TP.7: migrate-on-save — base64 → /api/files/<key>", () => {
  it("extracts a data-URL src into the store and rewrites the reference (pinned syntax)", async () => {
    const { store } = makeStore();
    const scene = sceneWith(PNG_DATA_URL);
    const extracted = await migrateScene(scene, store);
    expect(extracted).toBe(1);
    const src = scene.objects[1].src as string;
    expect(src).toMatch(/^\/api\/files\/uploads\/\d{8}\/[0-9a-f]{8}-[0-9a-z]+\.png$/);
    // bytes are retrievable through the store by the storage key (the asset ID)
    const key = src.replace(/^\/api\/files\//, "");
    const bytes = await store.read(key);
    expect(Buffer.from(bytes).toString("base64")).toBe(PNG_B64);
  });

  it("md5 dedupe: the same bytes extracted twice land on ONE asset (thumbnail === artwork src)", async () => {
    const { store } = makeStore();
    const a = sceneWith(PNG_DATA_URL);
    const b = sceneWith(PNG_DATA_URL);
    await migrateScene(a, store);
    await migrateScene(b, store);
    expect(a.objects[1].src).toBe(b.objects[1].src);
  });

  it("dedupe survives a store restart (hydrate) — migration after reload reuses the asset", async () => {
    const { store, root } = makeStore();
    const a = sceneWith(PNG_DATA_URL);
    await migrateScene(a, store);
    const reloaded = new LocalFileStore(path.join(root, "files"));
    await reloaded.hydrate();
    const b = sceneWith(PNG_DATA_URL);
    await migrateScene(b, reloaded);
    expect(a.objects[1].src).toBe(b.objects[1].src);
  });

  it("read-tolerant: http(s) and asset refs pass through untouched; zero extraction is fine", async () => {
    const { store } = makeStore();
    const scene = sceneWith("https://cdn.test/x.png");
    expect(await migrateScene(scene, store)).toBe(0);
    expect(scene.objects[1].src).toBe("https://cdn.test/x.png");
  });

  it("migrateProjectForSave enforces the rule — an unextractable data URL refuses the save", async () => {
    const { store } = makeStore();
    const project: Project = {
      id: "p1",
      name: "T",
      pages: [{ id: "page_1", width: 100, height: 100, canvas: sceneWith("data:image/png,percent-encoded-not-base64") }],
    };
    await expect(migrateProjectForSave(project, store)).rejects.toBeInstanceOf(PersistenceError);
    try {
      await migrateProjectForSave(project, store);
    } catch (err) {
      expect((err as PersistenceError).violations).toHaveLength(1);
    }
  });

  it("migrateRenderData walks msgMeta thumbnails and canvases", async () => {
    const { store } = makeStore();
    const renderData = { msgMeta: [{ id: "c1", type: "canvas", thumbnail: PNG_DATA_URL, canvas: sceneWith(PNG_DATA_URL) }] };
    const extracted = await migrateRenderData(renderData, store);
    expect(extracted).toBeGreaterThanOrEqual(2);
    expect(renderData.msgMeta[0].thumbnail).toMatch(/^\/api\/files\//);
    expect((renderData.msgMeta[0].canvas.objects[1].src as string)).toMatch(/^\/api\/files\//);
    // thumbnail and artwork dedupe to the SAME asset
    expect(renderData.msgMeta[0].thumbnail).toBe(renderData.msgMeta[0].canvas.objects[1].src);
  });

  it("migrateSrc passes non-data values through untouched (numbers, undefined)", async () => {
    const { store } = makeStore();
    expect(await migrateSrc(undefined, store)).toBeUndefined();
    expect(await migrateSrc("https://x/y.png", store)).toBe("https://x/y.png");
  });
});

describe("STAGE-0 TP.7: stores own the migration + atomic persistence", () => {
  function setup() {
    const root = mkdtempSync(path.join(tmpdir(), "oia-stores-"));
    const files = new LocalFileStore(path.join(root, "files"));
    const projects = new ProjectStore(path.join(root, "projects.json"), files);
    const chat = new ChatSessionStore(path.join(root, "chat-sessions.json"), files);
    return { root, files, projects, chat };
  }

  it("ProjectStore.create extracts base64 from the incoming scene BEFORE persisting", async () => {
    const { projects, root } = setup();
    await projects.load();
    const p = await projects.create({ name: "banner trà sữa", scene: sceneWith(PNG_DATA_URL) });
    const src = (p.pages[0].canvas.objects.find((o) => o.type === "Image")!.src as string);
    expect(src).toMatch(/^\/api\/files\//);
    // the persisted file on disk contains asset refs, not base64
    const raw = readJson(path.join(root, "projects.json"));
    expect(JSON.stringify(raw)).not.toContain("data:image");
    // reload (read-tolerant world): the project opens with the asset ref intact
    const reopened = new ProjectStore(path.join(root, "projects.json"));
    await reopened.load();
    expect(reopened.get(p.id)!.pages[0].canvas.objects.find((o) => o.type === "Image")!.src).toBe(src);
  });

  it("saveScene migrates editor autosaves (user pastes an image → asset ref on save)", async () => {
    const { projects } = setup();
    await projects.load();
    const p = await projects.create({ name: "x" });
    const page = { id: "page_1", name: "Board 1", width: 100, height: 100, canvas: sceneWith(PNG_DATA_URL) };
    await projects.saveScene(p.id, { pages: [page] });
    // zod re-creates page objects — assert on the STORE's copy, not the caller's
    const stored = projects.get(p.id)!.pages[0].canvas.objects.find((o) => o.type === "Image")!.src as string;
    expect(stored).toMatch(/^\/api\/files\//);
  });

  it("create/save stamp OIA_SCHEMA_VERSION; legacy projects without it are read-tolerant", async () => {
    const { projects, root } = setup();
    await projects.load();
    // legacy file on disk: a project saved before schemaVersion existed
    writeFileSync(path.join(root, "projects.json"), JSON.stringify([{
      id: "prj_legacy", name: "legacy", pages: [{ id: "page_1", width: 10, height: 10, canvas: { version: "7.3.1", objects: [] } }],
    }]));
    const reopened = new ProjectStore(path.join(root, "projects.json"));
    await reopened.load();
    expect(reopened.get("prj_legacy")!.schemaVersion).toBeUndefined(); // opens without error

    const fresh = await reopened.create({ name: "mới" });
    expect(fresh.schemaVersion).toBe(OIA_SCHEMA_VERSION);

    await reopened.saveScene("prj_legacy", { name: "đổi tên" }); // any save stamps the current version
    expect(reopened.get("prj_legacy")!.schemaVersion).toBe(OIA_SCHEMA_VERSION);
    const raw = readJson(path.join(root, "projects.json")) as Array<{ schemaVersion?: number }>;
    expect(raw.find((x) => x.id === "prj_legacy")!.schemaVersion).toBe(OIA_SCHEMA_VERSION);
  });

  it("concurrent saveScene calls never corrupt the store file (atomic single writer)", async () => {
    const { projects, root } = setup();
    await projects.load();
    const p = await projects.create({ name: "x" });
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        projects.saveScene(p.id, { pages: [{ id: "page_1", width: 10 + i, height: 10, canvas: sceneWith(PNG_DATA_URL) }] }),
      ),
    );
    const raw = readJson(path.join(root, "projects.json"));
    expect(Array.isArray(raw)).toBe(true); // valid JSON array, not interleaved garbage
  });

  it("ChatSessionStore.append migrates renderData — chat-sessions.json stops embedding data URLs", async () => {
    const { chat, root } = setup();
    await chat.load();
    const s = chat.create("banner trà sữa");
    await chat.append(s.id, "banner trà sữa", {
      content: "done",
      renderData: { msgMeta: [{ id: "c1", type: "canvas", thumbnail: PNG_DATA_URL, canvas: sceneWith(PNG_DATA_URL) }] },
    });
    const raw = JSON.stringify(readJson(path.join(root, "chat-sessions.json")));
    expect(raw).not.toContain("data:image/png;base64");
    expect(raw).toContain("/api/files/");
  });
});

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}
