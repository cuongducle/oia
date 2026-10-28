import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Unique id even when several are created in the same millisecond (flaky-bug guard, BR-BK3). */
let __seq = 0;
function uniqueId(prefix: string): string {
  __seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${__seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
import { brandKitSchema, BRANDKIT_LIMITS, type BrandKit } from "@oia/schema";
import type { LlmProvider } from "@oia/providers";

/** BR-BK store: JSON-file self-hosting; only one kit may be default at a time. */
export class BrandKitStore {
  private kits: BrandKit[] = [];
  constructor(private file = path.join(process.env.OIA_DATA_DIR ?? ".data", "brandkits.json")) {}

  async load() { try { this.kits = JSON.parse(await readFile(this.file, "utf8")); } catch { this.kits = []; } }
  private async save() {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.kits, null, 2));
  }

/** Zod validation (BR-BK1..4) — errors carry clear messages. */
  validate(input: unknown): BrandKit {
    const parsed = brandKitSchema.safeParse({
  id: (input as Record<string, unknown>)?.id ?? uniqueId("bk"), // keep id on update; unique even within the same ms
      createdAt: Date.now(),
      ...(input as Record<string, unknown>),
    });
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    return parsed.data;
  }

  async upsert(input: unknown): Promise<BrandKit> {
    const kit = this.validate(input);
    const idx = this.kits.findIndex((k) => k.id === kit.id);
    if (idx >= 0) this.kits[idx] = kit; else this.kits.push(kit);
    // BR-BK3: enabling applyByDefault disables every other kit
    if (kit.applyByDefault) for (const k of this.kits) if (k.id !== kit.id) k.applyByDefault = false;
    await this.save();
    return kit;
  }

  list(): BrandKit[] { return this.kits; }
  get(id: string): BrandKit | undefined { return this.kits.find((k) => k.id === id); }
  active(): BrandKit | undefined { return this.kits.find((k) => k.applyByDefault); }
  async remove(id: string): Promise<boolean> {
    const before = this.kits.length;
    this.kits = this.kits.filter((k) => k.id !== id);
    await this.save();
    return this.kits.length < before;
  }
}

/**
 * BR-EX extract-from-notes: the LLM drafts a kit from brand notes, always clamped to the limits
 * ("Have a brand book? Upload to auto-build your Brand Kit").
 */
export async function extractBrandKit(
  llm: LlmProvider,
  input: { fileUrl?: string; notes?: string },
): Promise<BrandKit> {
  const raw = await llm.chat([
    {
      role: "system",
      content:
        `You extract brand kits from brand books. Reply JSON {name, guidance, colors:["#RRGGBB"...], fonts:[...], logos:[]}. ` +
        `Max ${BRANDKIT_LIMITS.colors} colors, ${BRANDKIT_LIMITS.fonts} fonts, ${BRANDKIT_LIMITS.logos} logos, guidance ≤ ${BRANDKIT_LIMITS.guidance} chars. Colors must be hex #RRGGBB.`,
    },
    { role: "user", content: `Brand book: ${input.fileUrl ?? "(none)"}\nNotes: ${input.notes ?? ""}` },
  ], { json: true });

  const draft = JSON.parse(raw) as Partial<BrandKit>;
    // safe clamp — extraction never exceeds the limits (BR-EX2)
  return {
    id: uniqueId("bk"),
    name: (draft.name ?? "Extracted kit").slice(0, 80),
    guidance: (draft.guidance ?? "").slice(0, BRANDKIT_LIMITS.guidance),
    colors: (draft.colors ?? []).filter((c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, BRANDKIT_LIMITS.colors),
    fonts: (draft.fonts ?? []).filter((f) => typeof f === "string" && f.length > 0).slice(0, BRANDKIT_LIMITS.fonts) as string[],
    logos: (draft.logos ?? []).filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, BRANDKIT_LIMITS.logos) as string[],
    applyByDefault: false,
    createdAt: Date.now(),
  };
}
