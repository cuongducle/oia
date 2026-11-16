import path from "node:path";
import { atomicWriteJson, loadJsonArrayDurable } from "./atomic.js";
import { productProfileSchema, type ProductProfile } from "@oia/schema";

/** Unique id even when several are created in the same millisecond (same guard as BrandKitStore). */
let __seq = 0;
function uniqueId(prefix: string): string {
  __seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${__seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * W1.1 product profile store: one JSON file, atomic writes (hard rule 3), array
 * order = library order. Whole-profile upsert; the Facts screen edits facts in a
 * draft and saves the profile back in one write, so no partial-fact states exist.
 */
export class ProductStore {
  private items: ProductProfile[] = [];
  constructor(private file = path.join(process.env.OIA_DATA_DIR ?? ".data", "products.json")) {}

  async load() { this.items = (await loadJsonArrayDurable<ProductProfile>(this.file)) ?? []; }
  private async save() {
    await atomicWriteJson(this.file, this.items);
  }

  /** Zod validation; keeps id on update, assigns/refreshes timestamps. The spread
   *  comes FIRST: an explicit `id: undefined` crossing the wire (structured clone
   *  keeps the key) must not overwrite the store-assigned id (regression, W1.1 shot gate). */
  validate(input: unknown): ProductProfile {
    const raw = input as Record<string, unknown>;
    const prev = raw?.id ? this.items.find((p) => p.id === raw.id) : undefined;
    const parsed = productProfileSchema.safeParse({
      ...(raw as Record<string, unknown>),
      id: raw?.id ?? uniqueId("prd"),
      createdAt: prev?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    return parsed.data;
  }

  async upsert(input: unknown): Promise<ProductProfile> {
    const product = this.validate(input);
    const idx = this.items.findIndex((p) => p.id === product.id);
    if (idx >= 0) this.items[idx] = product; else this.items.push(product);
    await this.save();
    return product;
  }

  list(): ProductProfile[] { return this.items; }
  get(id: string): ProductProfile | undefined { return this.items.find((p) => p.id === id); }

  async remove(id: string): Promise<boolean> {
    const before = this.items.length;
    this.items = this.items.filter((p) => p.id !== id);
    await this.save();
    return this.items.length < before;
  }
}
