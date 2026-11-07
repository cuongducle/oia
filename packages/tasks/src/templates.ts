import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { templateSchema, templateCategorySchema, templateStyleSchema, templatePackSchema, type Template } from "@oia/schema";
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
  async publish(input: { name: string; authorName?: string; scene: unknown; featured?: boolean; category?: string; style?: string; pack?: string }): Promise<{ template: Template; warnings: string[] }> {
    const tpl = templateSchema.parse({
      id: `tpl_${Date.now().toString(36)}`,
      name: input.name.trim().slice(0, 120) || "Untitled template",
  authorName: input.authorName?.slice(0, 80) || "Anonymous",
      scene: input.scene,
      featured: input.featured ?? false,
      // TPL-T1: the closed taxonomy is enforced HERE (the edge), so a junk id 400s instead of drifting into the store
      ...(input.category ? { category: templateCategorySchema.parse(input.category) } : {}),
      // SC-2: same edge enforcement for the style family
      ...(input.style ? { style: templateStyleSchema.parse(input.style) } : {}),
      // SC-5: same edge enforcement for pack membership
      ...(input.pack ? { pack: templatePackSchema.parse(input.pack) } : {}),
      tipCredits: 0,
      createdAt: Date.now(),
    });
    this.items.unshift(tpl);
    await this.save();
    return { template: tpl, warnings: templatePublishWarnings(tpl) };
  }

/** BR-TPL2: page/pageSize pagination + featured/category/style/pack filters (TPL-T1, SC-2, SC-5). */
  list(q: { page?: number; pageSize?: number; featured?: boolean; category?: string; style?: string; pack?: string } = {}): { items: Template[]; total: number; page: number; pageSize: number } {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    let filtered = q.featured === undefined ? this.items : this.items.filter((t) => t.featured === q.featured);
    if (q.category !== undefined) filtered = filtered.filter((t) => t.category === q.category);
    if (q.style !== undefined) filtered = filtered.filter((t) => t.style === q.style);
    if (q.pack !== undefined) filtered = filtered.filter((t) => t.pack === q.pack);
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

  /** Reorg step 5 — web `.data` import lane: an external template joins the store.
   *  Existing ids are refused (desktop data wins), returns false. */
  async addImported(tpl: Template): Promise<boolean> {
    if (this.items.some((t) => t.id === tpl.id)) return false;
    // G4 (goldfish): legacy free-text categories enter as undefined — the closed
    // taxonomy is forward-looking; imports never silently match a filter they don't mean.
    if (tpl.category !== undefined && !templateCategorySchema.safeParse(tpl.category).success) {
      tpl = { ...tpl, category: undefined };
    }
    // SC-2: legacy imports with unknown styles land unfiltered (same G4 rationale)
    if (tpl.style !== undefined && !templateStyleSchema.safeParse(tpl.style).success) {
      tpl = { ...tpl, style: undefined };
    }
    // SC-5: same for packs
    if (tpl.pack !== undefined && !templatePackSchema.safeParse(tpl.pack).success) {
      tpl = { ...tpl, pack: undefined };
    }
    this.items.unshift(tpl);
    await this.save();
    return true;
  }
}

/** TPL-T4 (soft, owner Q2 2026-11-03): doctrine notes ride the publish result —
 *  PosterMyWall rejects at publish; we warn first release, harden later. */
export function templatePublishWarnings(tpl: Template): string[] {
  const warnings: string[] = [];
  if (!tpl.category) warnings.push("no category — the template will not surface in category filters");
  if (!tpl.scene.objects.some((o) => o.type === "Textbox")) warnings.push("no editable text layer — buyers can only swap the artwork, not the copy");
  const art = tpl.scene.objects.find((o) => o.type === "Image");
  if (!art || typeof (art as { src?: unknown }).src !== "string" || (art as { src: string }).src.startsWith("data:"))
    warnings.push("artwork is missing or inline — set a stored /studio or /api/files source");
  return warnings;
}
