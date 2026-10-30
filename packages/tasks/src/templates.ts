import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { templateSchema, type Template } from "@oia/schema";
import { atomicWriteJson, loadJsonArrayDurable } from "./atomic.js";

/** BR-TPL store: publish designs as templates; paginated + featured listing; author tip credits. */
export class TemplateStore {
  private items: Template[] = [];
  constructor(private file = path.join(process.env.OIA_DATA_DIR ?? ".data", "templates.json")) {}

  async load() { this.items = (await loadJsonArrayDurable<Template>(this.file)) ?? []; }
  private async save() {
    await atomicWriteJson(this.file, this.items);
  }

/** Publish: scene JSON stored intact (BR-TPL1) — thumbnail taken from the first Image object. */
  async publish(input: { name: string; authorName?: string; scene: unknown; featured?: boolean }): Promise<Template> {
    const tpl = templateSchema.parse({
      id: `tpl_${Date.now().toString(36)}`,
      name: input.name.trim().slice(0, 120) || "Untitled template",
  authorName: input.authorName?.slice(0, 80) || "Anonymous",
      scene: input.scene,
      featured: input.featured ?? false,
      tipCredits: 0,
      createdAt: Date.now(),
    });
    this.items.unshift(tpl);
    await this.save();
    return tpl;
  }

/** BR-TPL2: page/pageSize pagination + featured filter. */
  list(q: { page?: number; pageSize?: number; featured?: boolean } = {}): { items: Template[]; total: number; page: number; pageSize: number } {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const filtered = q.featured === undefined ? this.items : this.items.filter((t) => t.featured === q.featured);
    const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize };
  }

/** BR-TPL3: tip +n credits to the template author. */
  async tip(id: string, credits = 1): Promise<Template | null> {
    const tpl = this.items.find((t) => t.id === id);
    if (!tpl) return null;
    tpl.tipCredits += credits;
    await this.save();
    return tpl;
  }

  get(id: string): Template | undefined { return this.items.find((t) => t.id === id); }
}
