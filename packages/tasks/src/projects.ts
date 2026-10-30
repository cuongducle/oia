import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { projectSchema, SCENE_VERSION, OIA_SCHEMA_VERSION, type Project } from "@oia/schema";
import { atomicWriteJson, fireAndForgetWrite, loadJsonArrayDurable, renameWithRetry, sweepTempFiles } from "./atomic.js";
import { migrateProjectForSave, migrateRenderData } from "./migrate.js";
import { migrateProjectToCurrent } from "./projectMigrations.js";
import type { FileStore } from "./storage.js";

/** Reorg step 5 — per-project files: one bad file costs ONE project, never all of them. */
const SAFE_PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/; // no separators, no leading dot

function newProjectId(): string {
  return `prj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * BR-PERSIST — project store (JSON-file self-hosting; postgres for multi-user).
 * - create blank or from a scene ("Edit as project")
 * - saveScene keeps pages[] fully intact
 * - list sorted by updatedAt DESC (recent projects)
 * - TP.7 (Slice 3): every save is atomic (temp+rename, EPERM/EBUSY retry, single writer)
 *   and migrate-on-save extracts base64 into the asset store (no base64 in new saves)
 * - reorg step 5: `dataDir/projects/<id>.json` — one file per project. The legacy
 *   monolith `projects.json` is absorbed on load and archived (bytes never deleted);
 *   a corrupt single file is quarantined alone, every other project survives.
 */
export class ProjectStore {
  private items: Project[] = [];
  private readonly projectsDir: string;
  private readonly legacyFile: string;
  constructor(
    dataDir = process.env.OIA_DATA_DIR ?? ".data",
    /** When provided, saves own migrate-on-save + the no-base64 rule. */
    private files?: FileStore,
  ) {
    this.projectsDir = path.join(dataDir, "projects");
    this.legacyFile = path.join(dataDir, "projects.json");
  }

  private fileFor(id: string): string {
    if (!SAFE_PROJECT_ID.test(id)) throw new Error(`unsafe project id "${id}" — refusing to build a file path from it`);
    return path.join(this.projectsDir, `${id}.json`);
  }

  private async writeProject(p: Project): Promise<void> {
    await atomicWriteJson(this.fileFor(p.id), p);
  }

  private async quarantine(file: string, why: string): Promise<void> {
    const to = `${file}.corrupt-${Date.now()}`;
    await renameWithRetry(file, to);
    console.error(
      `[projects] ${path.basename(file)} was ${why} — moved to ${path.basename(to)}; ` +
        `the other projects are untouched. Recover what you need from the quarantined file.`,
    );
  }

  private async sweepTempFiles(): Promise<void> {
    // orphaned `.name.json.tmp-*` siblings from a crash between write and rename
    for (const f of await readdir(this.projectsDir).catch(() => [] as string[])) {
      if (f.startsWith(".") && f.includes(".tmp-")) await rm(path.join(this.projectsDir, f), { force: true }).catch(() => {});
    }
  }

  /** Absorb the pre-split monolith: every project becomes its own file; the source
   *  file is archived (never deleted). A per-project file with the same id wins —
   *  it was saved AFTER the split, so it is newer by construction. */
  private async absorbLegacyMonolith(): Promise<void> {
    const legacy = await loadJsonArrayDurable<Project>(this.legacyFile); // corrupt → self-quarantines inside
    if (legacy) {
      for (const raw of legacy) {
        const parsed = projectSchema.safeParse(raw);
        if (!parsed.success) {
          console.error(`[projects] legacy monolith entry failed schema validation (${parsed.error.issues[0]?.path.join(".")}) — kept in the archive file, skipped`);
          continue;
        }
        let p = parsed.data;
        if (!SAFE_PROJECT_ID.test(p.id)) {
          const old = p.id;
          p = { ...p, id: newProjectId() };
          console.error(`[projects] legacy id "${old}" is unsafe as a file name — re-issued as ${p.id}`);
        }
        const target = this.fileFor(p.id);
        if (existsSync(target)) continue; // per-project file wins (newer)
        if (this.files) {
          try {
            p = await migrateProjectToCurrent(p, this.files);
          } catch {
            // read-tolerant: keep the unmigrated project, strict refusal stays at save time
          }
        }
        await atomicWriteJson(target, p);
      }
      await renameWithRetry(this.legacyFile, `${this.legacyFile}.legacy-${Date.now().toString(36)}`);
    }
  }

  async load() {
    await mkdir(this.projectsDir, { recursive: true });
    await this.sweepTempFiles();
    await this.absorbLegacyMonolith();
    this.items = [];
    for (const f of await readdir(this.projectsDir)) {
      if (f.startsWith(".") || !f.endsWith(".json")) continue; // temps swept; archives/corrupt live elsewhere
      const file = path.join(this.projectsDir, f);
      let raw: string;
      try {
        raw = await readFile(file, "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
      let parsed: Project;
      try {
        parsed = projectSchema.parse(JSON.parse(raw));
      } catch {
        await this.quarantine(file, "unparseable or not a valid project"); // TP.7 read side: bytes survive
        continue;
      }
      if (f !== `${parsed.id}.json`) {
        // the one-file-one-project invariant: a mismatched file would duplicate its id
        // on the next save. Bytes preserved; deterministic single copy.
        await this.quarantine(file, `id "${parsed.id}" does not match its file name`);
        continue;
      }
      if (this.files) {
        try {
          const migrated = await migrateProjectToCurrent(parsed, this.files);
          if (migrated.schemaVersion !== parsed.schemaVersion) {
            parsed = migrated;
            await this.writeProject(parsed); // self-migrating store: one write-back, then no-op boots
          }
        } catch {
          // read-tolerant: opens unmigrated; the strict refusal stays at save time
        }
      }
      this.items.push(parsed);
    }
    this.items.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }

  async create(input: { name?: string; scene?: unknown; pages?: unknown; width?: number; height?: number }): Promise<Project> {
    const blank = {
      version: SCENE_VERSION,
      objects: [{ type: "Rect", name: "clip", left: 0, top: 0, width: input.width ?? 1360, height: input.height ?? 2048, fill: "white", selectable: false, visible: true }],
      ...(input.scene ? (input.scene as object) : {}),
    };
    const now = Date.now();
    const p: Project = projectSchema.parse({
      id: newProjectId(),
      name: input.name ?? "Untitled project",
      schemaVersion: OIA_SCHEMA_VERSION,
      pages: input.pages ?? [{ id: `page_1`, name: "Board 1", width: input.width ?? 1360, height: input.height ?? 2048, canvas: blank }],
      createdAt: now, updatedAt: now,
    });
    this.items.unshift(p);
    if (this.files) await migrateProjectForSave(p, this.files); // TP.7: base64 → asset refs BEFORE first persist
    await this.writeProject(p);
    return p;
  }

  get(id: string): Project | undefined { return this.items.find((p) => p.id === id); }

  async saveScene(id: string, patch: { name?: string; pages?: unknown }): Promise<Project | null> {
    const p = this.get(id);
    if (!p) return null;
    if (patch.name !== undefined) p.name = patch.name.slice(0, 120);
    if (patch.pages !== undefined) {
      const parsed = projectSchema.pick({ pages: true }).parse({ pages: patch.pages });
      // migrate the INCOMING copy before it becomes shared state — concurrent saves stay
      // self-consistent (p.pages is replaced only after its own migration+validation passed)
      if (this.files) await migrateProjectForSave({ ...p, pages: parsed.pages } as Project, this.files);
      p.pages = parsed.pages;
    } else if (this.files) {
      await migrateProjectForSave(p, this.files); // legacy base64 discovered on a name-only save
    }
    p.updatedAt = Date.now();
    p.schemaVersion = OIA_SCHEMA_VERSION; // every save stamps the current format version
    // keep the recent order: move to the front
    this.items = [p, ...this.items.filter((x) => x.id !== id)];
    await this.writeProject(p);
    return p;
  }

  async remove(id: string): Promise<boolean> {
    const before = this.items.length;
    this.items = this.items.filter((p) => p.id !== id);
    if (this.items.length === before) return false;
    await rm(this.fileFor(id), { force: true });
    return true;
  }

  /** Reorg step 5 — web `.data` import lane: an external project joins the store
   *  as its own file. Existing ids are refused (desktop data wins), returns false.
   *  Runs the schemaVersion chain read-tolerantly (a step that fails keeps the
   *  project unmigrated but imported — strict refusal stays at save time). */
  async addImported(project: Project): Promise<boolean> {
    let p = project;
    if (!SAFE_PROJECT_ID.test(p.id)) {
      p = { ...p, id: newProjectId() };
      console.error(`[projects] imported id "${project.id}" is unsafe as a file name — re-issued as ${p.id}`);
    }
    if (this.get(p.id)) return false;
    if (this.files) {
      try {
        p = await migrateProjectToCurrent(p, this.files);
      } catch {
        // read-tolerant: opens unmigrated; the strict refusal stays at save time
      }
    }
    this.items.push(p);
    this.items.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    await this.writeProject(p);
    return true;
  }

/** Recent projects — newest first, limited to n. */
  recent(limit = 20): Project[] { return this.items.slice(0, limit); }
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  renderData?: unknown;
  canvas?: unknown;     // latest canvas msgMeta, if any
  createdAt: number;
}

/**
 * BR-PERSIST’ — chat session store: names derive from the first prompt;
 * messages keep renderData for timeline replay.
 * TP.7 (Slice 3): atomic writes + migrate-on-save — chat-sessions.json stops
 * embedding data-URL canvases (asset references instead, same rule as scenes).
 */
let __chatSeq = 0;

type StoredSessionEntry = [number, { id: number; name: string; messages: StoredMessage[]; createdAt: number; updatedAt: number }];

export class ChatSessionStore {
  private data: Map<number, { id: number; name: string; messages: StoredMessage[]; createdAt: number; updatedAt: number }> = new Map();
  private __lastUpdated = 0;
  constructor(
    private file = path.join(process.env.OIA_DATA_DIR ?? ".data", "chat-sessions.json"),
    private files?: FileStore,
  ) {}

  async load() {
    await sweepTempFiles(this.file); // C6: clear orphaned .tmp siblings
    // corrupt → quarantined, never blanked-in-memory then overwritten (TP.7 read side)
    const arr = await loadJsonArrayDurable<StoredSessionEntry>(this.file);
    this.data = new Map(arr ?? []);
  }
  private async save() {
    await atomicWriteJson(this.file, [...this.data.entries()]);
  }

  create(name?: string): { id: number; name: string } {
    __chatSeq += 1;
  const id = Date.now() * 1000 + (__chatSeq % 1000); // unique even for back-to-back calls in the same ms
    this.data.set(id, { id, name: name?.slice(0, 80) || "New chat", messages: [], createdAt: id, updatedAt: id });
    this.__lastUpdated = Math.max(this.__lastUpdated + 1, id); // monotonic — same-ms bursts must not tie
    fireAndForgetWrite(this.save()); // sync API: failure is recorded by atomicWriteJson (B7), not silently dropped
    return { id, name: this.data.get(id)!.name };
  }

  get(id: number) { return this.data.get(id); }

/** Store one user→assistant pair; sessions are named from the first prompt. */
  async append(id: number, user: string, assistant: { content: string; renderData?: unknown }) {
    const s = this.data.get(id) ?? (() => { __chatSeq += 1; const created = { id, name: user.slice(0, 60), messages: [] as StoredMessage[], createdAt: id, updatedAt: id }; this.data.set(id, created); return created; })();
    if (s.messages.length === 0) s.name = user.slice(0, 60);
    if (this.files) await migrateRenderData(assistant.renderData, this.files); // thumbnails + canvases → asset refs
    const canvas = (assistant.renderData as { msgMeta?: { type: string; canvas?: unknown }[] } | undefined)?.msgMeta?.find((m) => m.type === "canvas")?.canvas;
    s.messages.push({ role: "user", content: user, createdAt: Date.now() });
    s.messages.push({ role: "assistant", content: assistant.content, renderData: assistant.renderData, canvas, createdAt: Date.now() });
    // monotonic updatedAt: equal timestamps in a same-ms burst made recent() return the
    // OLDEST session first (stable sort keeps insertion order) — found via the retry test
    s.updatedAt = Math.max(this.__lastUpdated + 1, Date.now());
    this.__lastUpdated = s.updatedAt;
    await this.save();
    return s;
  }

  recent(limit = 20) {
    return [...this.data.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  }
  async remove(id: number) { this.data.delete(id); await this.save(); }

  /** Reorg step 5 — web `.data` import lane: external sessions join with FRESH ids
   *  (numeric ids from another install would collide). Idempotent: a session whose
   *  fingerprint (name + timestamps + message count) already exists is skipped.
   *  Returns how many landed. */
  async importSessions(
    entries: Array<[number, { id: number; name: string; messages: StoredMessage[]; createdAt: number; updatedAt: number }]>,
  ): Promise<number> {
    const fingerprint = (e: { name: string; messages: StoredMessage[]; createdAt: number; updatedAt: number }) =>
      `${e.name}|${e.createdAt}|${e.updatedAt}|${e.messages.length}`;
    const known = new Set([...this.data.values()].map(fingerprint));
    let nextId = Math.max(0, ...this.data.keys()) + 1;
    let imported = 0;
    for (const [, entry] of entries) {
      if (known.has(fingerprint(entry))) continue; // already imported in an earlier run
      const id = nextId++;
      this.data.set(id, {
        id,
        name: entry.name.slice(0, 80) || "Imported chat",
        messages: entry.messages ?? [],
        createdAt: entry.createdAt ?? id,
        updatedAt: entry.updatedAt ?? id,
      });
      imported++;
    }
    if (imported) await this.save();
    return imported;
  }
}
