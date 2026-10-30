import { readFile } from "node:fs/promises";
import path from "node:path";
import { projectSchema, SCENE_VERSION, OIA_SCHEMA_VERSION, type Project } from "@oia/schema";
import { atomicWriteJson, loadJsonArrayDurable, sweepTempFiles } from "./atomic.js";
import { migrateProjectForSave, migrateRenderData } from "./migrate.js";
import type { FileStore } from "./storage.js";

/**
 * BR-PERSIST — project store (JSON-file self-hosting; postgres for multi-user).
 * - create blank or from a scene ("Edit as project")
 * - saveScene keeps pages[] fully intact
 * - list sorted by updatedAt DESC (recent projects)
 * - TP.7 (Slice 3): every save is atomic (temp+rename, EPERM/EBUSY retry, single writer)
 *   and migrate-on-save extracts base64 into the asset store (no base64 in new saves)
 */
export class ProjectStore {
  private items: Project[] = [];
  constructor(
    private file = path.join(process.env.OIA_DATA_DIR ?? ".data", "projects.json"),
    /** When provided, saves own migrate-on-save + the no-base64 rule. */
    private files?: FileStore,
  ) {}

  async load() {
    await sweepTempFiles(this.file); // C6: clear orphaned .tmp siblings from a crash mid-rename
    // corrupt → quarantined, never blanked-in-memory then overwritten (TP.7 read side)
    this.items = (await loadJsonArrayDurable<Project>(this.file)) ?? [];
  }
  private async save() {
    await atomicWriteJson(this.file, this.items);
  }

  async create(input: { name?: string; scene?: unknown; pages?: unknown; width?: number; height?: number }): Promise<Project> {
    const blank = {
      version: SCENE_VERSION,
      objects: [{ type: "Rect", name: "clip", left: 0, top: 0, width: input.width ?? 1360, height: input.height ?? 2048, fill: "white", selectable: false, visible: true }],
      ...(input.scene ? (input.scene as object) : {}),
    };
    const now = Date.now();
    const p: Project = projectSchema.parse({
      id: `prj_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: input.name ?? "Untitled project",
      schemaVersion: OIA_SCHEMA_VERSION,
      pages: input.pages ?? [{ id: `page_1`, name: "Board 1", width: input.width ?? 1360, height: input.height ?? 2048, canvas: blank }],
      createdAt: now, updatedAt: now,
    });
    this.items.unshift(p);
    if (this.files) await migrateProjectForSave(p, this.files); // TP.7: base64 → asset refs BEFORE first persist
    await this.save();
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
    await this.save();
    return p;
  }

  async remove(id: string): Promise<boolean> {
    const before = this.items.length;
    this.items = this.items.filter((p) => p.id !== id);
    await this.save();
    return this.items.length < before;
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
    void this.save();
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
}
