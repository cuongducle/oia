import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectSchema, type Project } from "@pixforge/schema";

/**
 * BR-PERSIST — project store (JSON-file self-hosting; postgres for multi-user).
 * - create blank or from a scene ("Edit as project")
 * - saveScene keeps pages[] fully intact
 * - list sorted by updatedAt DESC (recent projects)
 */
export class ProjectStore {
  private items: Project[] = [];
  constructor(private file = path.join(process.env.PIXFORGE_DATA_DIR ?? ".data", "projects.json")) {}

  async load() { try { this.items = JSON.parse(await readFile(this.file, "utf8")); } catch { this.items = []; } }
  private async save() {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.items, null, 2));
  }

  async create(input: { name?: string; scene?: unknown; pages?: unknown; width?: number; height?: number }): Promise<Project> {
    const blank = {
      version: "7.3.1",
      objects: [{ type: "Rect", name: "clip", left: 0, top: 0, width: input.width ?? 1360, height: input.height ?? 2048, fill: "white", selectable: false, visible: true }],
      ...(input.scene ? (input.scene as object) : {}),
    };
    const now = Date.now();
    const p: Project = projectSchema.parse({
      id: `prj_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: input.name ?? "Untitled project",
      pages: input.pages ?? [{ id: `page_1`, name: "Board 1", width: input.width ?? 1360, height: input.height ?? 2048, canvas: blank }],
      createdAt: now, updatedAt: now,
    });
    this.items.unshift(p);
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
      p.pages = parsed.pages;
    }
    p.updatedAt = Date.now();
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
 */
let __chatSeq = 0;

export class ChatSessionStore {
  private data: Map<number, { id: number; name: string; messages: StoredMessage[]; createdAt: number; updatedAt: number }> = new Map();
  constructor(private file = path.join(process.env.PIXFORGE_DATA_DIR ?? ".data", "chat-sessions.json")) {}

  async load() {
    try {
      const arr = JSON.parse(await readFile(this.file, "utf8")) as [number, { id: number; name: string; messages: StoredMessage[]; createdAt: number; updatedAt: number }][];
      this.data = new Map(arr);
    } catch { this.data = new Map(); }
  }
  private async save() {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify([...this.data.entries()], null, 2));
  }

  create(name?: string): { id: number; name: string } {
    __chatSeq += 1;
  const id = Date.now() * 1000 + (__chatSeq % 1000); // unique even for back-to-back calls in the same ms
    this.data.set(id, { id, name: name?.slice(0, 80) || "New chat", messages: [], createdAt: id, updatedAt: id });
    void this.save();
    return { id, name: this.data.get(id)!.name };
  }

  get(id: number) { return this.data.get(id); }

/** Store one user→assistant pair; sessions are named from the first prompt. */
  async append(id: number, user: string, assistant: { content: string; renderData?: unknown }) {
    const s = this.data.get(id) ?? (() => { __chatSeq += 1; const created = { id, name: user.slice(0, 60), messages: [] as StoredMessage[], createdAt: id, updatedAt: id }; this.data.set(id, created); return created; })();
    if (s.messages.length === 0) s.name = user.slice(0, 60);
    const canvas = (assistant.renderData as { msgMeta?: { type: string; canvas?: unknown }[] } | undefined)?.msgMeta?.find((m) => m.type === "canvas")?.canvas;
    s.messages.push({ role: "user", content: user, createdAt: Date.now() });
    s.messages.push({ role: "assistant", content: assistant.content, renderData: assistant.renderData, canvas, createdAt: Date.now() });
    s.updatedAt = Date.now();
    await this.save();
    return s;
  }

  recent(limit = 20) {
    return [...this.data.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  }
  async remove(id: number) { this.data.delete(id); await this.save(); }
}
