import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { BrandKitStore, ChatSessionStore, LocalFileStore, ProjectStore, TemplateStore } from "../src/index.js";
import { DataImportError, importWebData, resolveWebDataDir, type WebImportTarget } from "../src/importWebData.js";
import type { BrandKit, Template } from "@oia/schema";

/** Reorg step 5 — the web `.data` import lane (owner's real data crosses here). */

const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cfc0f01f0005050201edb5ca9f0000000049454e44ae426082",
  "hex",
);
const PNG_DATA_URL = `data:image/png;base64,${PNG_BYTES.toString("base64")}`;

/** A realistic legacy web asset: md5-32 name under a day dir, referenced by projects. */
const LEGACY_MD5 = createHash("md5").update(PNG_BYTES).digest("hex");
const LEGACY_KEY = `uploads/20240501/${LEGACY_MD5}-m1a2b3c4.png`;

function makeWebData(): string {
  const web = mkdtempSync(path.join(tmpdir(), "oia-webdata-"));
  mkdirSync(path.join(web, "files", "uploads", "20240501"), { recursive: true });
  writeFileSync(path.join(web, "files", LEGACY_KEY), PNG_BYTES);

  writeFileSync(
    path.join(web, "projects.json"),
    JSON.stringify([
      {
        id: "prj_web1",
        name: "web banner",
        updatedAt: 200,
        pages: [
          {
            id: "page_1",
            width: 1360,
            height: 2048,
            canvas: { version: "7.3.1", objects: [{ type: "Image", src: `/api/files/${LEGACY_KEY}`, left: 0, top: 0, width: 10, height: 10 }] },
          },
        ],
      },
      {
        id: "prj_web2",
        name: "legacy base64 project",
        updatedAt: 100,
        pages: [
          { id: "page_1", width: 100, height: 100, canvas: { version: "7.3.1", objects: [{ type: "Image", src: PNG_DATA_URL }] } },
        ],
      },
    ]),
  );

  writeFileSync(
    path.join(web, "chat-sessions.json"),
    JSON.stringify([
      [42, { id: 42, name: "coffee poster", messages: [{ role: "user", content: "make a banner", createdAt: 1 }], createdAt: 1, updatedAt: 2 }],
    ]),
  );

  writeFileSync(
    path.join(web, "brandkits.json"),
    JSON.stringify([
      {
        id: "bk_web",
        name: "Cà phê Rang Xay",
        guidance: "tone ấm, nâu đỏ",
        colors: ["#5d4037", "#d7ccc8"],
        fonts: ["Be Vietnam Pro"],
        logos: [`/api/files/${LEGACY_KEY}`],
        applyByDefault: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ]),
  );

  writeFileSync(
    path.join(web, "templates.json"),
    JSON.stringify([
      {
        id: "tpl_web",
        name: "Sale 20%",
        authorName: "owner",
        scene: { version: "7.3.1", objects: [] },
        featured: false,
        tipCredits: 0,
        createdAt: 1,
      },
    ]),
  );

  return web;
}

function makeDesktop(): { dataDir: string; target: WebImportTarget } {
  const dataDir = mkdtempSync(path.join(tmpdir(), "oia-desktop-"));
  const files = new LocalFileStore(path.join(dataDir, "files"));
  const target: WebImportTarget = {
    files,
    projects: new ProjectStore(dataDir, files),
    chatSessions: new ChatSessionStore(path.join(dataDir, "chat-sessions.json"), files),
    brandKits: new BrandKitStore(path.join(dataDir, "brandkits.json")),
    templates: new TemplateStore(path.join(dataDir, "templates.json")),
  };
  return { dataDir, target };
}

async function boot(t: WebImportTarget): Promise<void> {
  await t.files.hydrate();
  await t.projects.load();
  await t.chatSessions.load();
  await t.brandKits.load();
  await t.templates.load();
}

describe("resolveWebDataDir", () => {
  it("accepts the .data folder itself and its parent", async () => {
    const web = makeWebData();
    expect(await resolveWebDataDir(web)).toBe(web);
    const holder = mkdtempSync(path.join(tmpdir(), "oia-holder-"));
    mkdirSync(path.join(holder, ".data"), { recursive: true });
    writeFileSync(path.join(holder, ".data", "projects.json"), "[]");
    expect(await resolveWebDataDir(holder)).toBe(path.join(holder, ".data"));
  });

  it("a folder with none of the markers is rejected with a clear message", async () => {
    const junk = mkdtempSync(path.join(tmpdir(), "oia-junk-"));
    await expect(resolveWebDataDir(junk)).rejects.toThrow(DataImportError);
  });
});

describe("importWebData — the happy lane", () => {
  it("imports projects + assets + sessions + kits + templates; every reference still resolves", async () => {
    const web = makeWebData();
    const { dataDir, target } = makeDesktop();
    await boot(target);

    const counts = await importWebData({ sourceDir: web, target });
    expect(counts).toMatchObject({ assets: 1, projects: 2, sessions: 1, brandKits: 1, templates: 1 });

    // projects: both landed, one file each, sorted by updatedAt DESC
    expect(target.projects.recent().map((p) => p.name)).toEqual(["web banner", "legacy base64 project"]);
    expect(readdirSync(path.join(dataDir, "projects")).sort()).toEqual(["prj_web1.json", "prj_web2.json"]);

    // the referenced legacy asset copied under its ORIGINAL key and resolves
    expect(existsSync(path.join(dataDir, "files", LEGACY_KEY))).toBe(true);
    expect(Buffer.from(await target.files.read(LEGACY_KEY)).equals(PNG_BYTES)).toBe(true);

    // the base64 legacy project got migrated v0→v1 (asset ref, version stamped)
    const web2 = target.projects.get("prj_web2")!;
    expect(web2.schemaVersion).toBe(1);
    expect(web2.pages[0].canvas.objects[0].src).toMatch(/^\/api\/files\//);

    // session landed with a REMAPPED id (no numeric-id collision risk)
    expect(target.chatSessions.recent()).toHaveLength(1);
    expect(target.chatSessions.recent()[0].name).toBe("coffee poster");
    expect(target.chatSessions.recent()[0].id).not.toBe(42);

    // kit + template landed intact
    expect(target.brandKits.list().map((k: BrandKit) => k.id)).toContain("bk_web");
    expect(target.templates.list().items.map((t: Template) => t.id)).toContain("tpl_web");
  });

  it("a reopen (app restart) sees the imported data intact — the step-5 persistence gate", async () => {
    const web = makeWebData();
    const { dataDir } = makeDesktop();
    const first: WebImportTarget = (() => {
      const files = new LocalFileStore(path.join(dataDir, "files"));
      return {
        files,
        projects: new ProjectStore(dataDir, files),
        chatSessions: new ChatSessionStore(path.join(dataDir, "chat-sessions.json"), files),
        brandKits: new BrandKitStore(path.join(dataDir, "brandkits.json")),
        templates: new TemplateStore(path.join(dataDir, "templates.json")),
      };
    })();
    await boot(first);
    await importWebData({ sourceDir: web, target: first });

    const files = new LocalFileStore(path.join(dataDir, "files"));
    const reopened: WebImportTarget = {
      files,
      projects: new ProjectStore(dataDir, files),
      chatSessions: new ChatSessionStore(path.join(dataDir, "chat-sessions.json"), files),
      brandKits: new BrandKitStore(path.join(dataDir, "brandkits.json")),
      templates: new TemplateStore(path.join(dataDir, "templates.json")),
    };
    await boot(reopened);
    expect(reopened.projects.recent().map((p) => p.name)).toEqual(["web banner", "legacy base64 project"]);
    expect(Buffer.from(await reopened.files.read(LEGACY_KEY)).equals(PNG_BYTES)).toBe(true);
    expect(reopened.chatSessions.recent()[0].name).toBe("coffee poster");
  });
});

describe("importWebData — safety lanes", () => {
  it("is IDEMPOTENT: a second run imports nothing and duplicates nothing", async () => {
    const web = makeWebData();
    const { target } = makeDesktop();
    await boot(target);
    await importWebData({ sourceDir: web, target });
    const before = {
      projects: target.projects.recent(50).map((p) => p.id),
      sessions: target.chatSessions.recent(100).length,
    };
    const counts = await importWebData({ sourceDir: web, target });
    expect(counts).toMatchObject({ assets: 0, assetsSkipped: 1, projects: 0, projectsSkipped: 2, sessions: 0, brandKits: 0, templates: 0 });
    expect(target.projects.recent(50).map((p) => p.id).sort()).toEqual(before.projects.sort());
    expect(target.chatSessions.recent(100)).toHaveLength(before.sessions);
  });

  it("desktop WINS on a project id collision — imported data never overwrites", async () => {
    const web = makeWebData();
    const { dataDir, target } = makeDesktop();
    await boot(target);
    await target.projects.create({ name: "desktop copy", pages: [{ id: "page_1", width: 1, height: 1, canvas: { version: "7.3.1", objects: [] } }] });
    const desktopId = target.projects.recent()[0].id;
    // force the collision: rewrite the source entry to carry the desktop id
    const src = JSON.parse(readFileSync(path.join(web, "projects.json"), "utf8"));
    src[0].id = desktopId;
    writeFileSync(path.join(web, "projects.json"), JSON.stringify(src));

    const counts = await importWebData({ sourceDir: web, target });
    expect(counts.projects).toBe(1); // only prj_web2 landed
    expect(counts.projectsSkipped).toBe(1);
    expect(target.projects.get(desktopId)!.name).toBe("desktop copy");
    expect(readdirSync(path.join(dataDir, "projects"))).toHaveLength(2);
  });

  it("a corrupt source projects.json aborts with NOTHING imported (source untouched)", async () => {
    const web = makeWebData();
    const poison = '{"broken": ';
    writeFileSync(path.join(web, "projects.json"), poison);
    const { target } = makeDesktop();
    await boot(target);

    await expect(importWebData({ sourceDir: web, target })).rejects.toThrow(DataImportError);
    expect(readFileSync(path.join(web, "projects.json"), "utf8")).toBe(poison); // source untouched
    expect(target.projects.recent()).toHaveLength(0);
    expect(target.chatSessions.recent()).toHaveLength(0); // nothing else landed either
  });

  it("an empty-but-valid source imports cleanly as a no-op", async () => {
    const web = mkdtempSync(path.join(tmpdir(), "oia-emptyweb-"));
    writeFileSync(path.join(web, "projects.json"), "[]");
    const { target } = makeDesktop();
    await boot(target);
    const counts = await importWebData({ sourceDir: web, target });
    expect(counts).toMatchObject({ projects: 0, sessions: 0, assets: 0 });
  });

  it("invalid entries are skipped and counted, valid ones still land", async () => {
    const web = makeWebData();
    const src = JSON.parse(readFileSync(path.join(web, "projects.json"), "utf8"));
    src.push({ id: "prj_broken", name: "no pages" }); // fails projectSchema (pages missing)
    writeFileSync(path.join(web, "projects.json"), JSON.stringify(src));
    const { target } = makeDesktop();
    await boot(target);
    const counts = await importWebData({ sourceDir: web, target });
    expect(counts.projects).toBe(2);
    expect(counts.projectsInvalid).toBe(1);
    expect(target.projects.get("prj_broken")).toBeUndefined();
  });
});
