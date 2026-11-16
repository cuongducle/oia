import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson, loadJsonArrayDurable, pathExists, renameWithRetry } from "./atomic.js";
import { productProfileSchema, type ProductProfile } from "@oia/schema";
import type { FileStore } from "./storage.js";

/** One file per product (ProjectStore pattern): a bad write or a corrupt file
 *  costs ONE product, never the library; saving one product rewrites one small
 *  file, not an array that grows with the shop. */
const SAFE_PRODUCT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/; // no separators, no leading dot

/** Unique id even when several are created in the same millisecond (same guard as BrandKitStore). */
let __seq = 0;
function uniqueId(prefix: string): string {
  __seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${__seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * W1.1 product profile store: `dataDir/products/<id>.json`, atomic per-file writes
 * (hard rule 3), legacy `products.json` absorbed on load and archived. Order:
 * createdAt DESC, id ASC tie-break (new products visible at the top, edits never
 * reorder the library). `list()` returns a COPY: callers can never mutate the
 * store's in-memory array by reaching into the result.
 */
export class ProductStore {
  private items: ProductProfile[] = [];
  private readonly productsDir: string;
  private readonly legacyFile: string;
  constructor(
    dataDir = process.env.OIA_DATA_DIR ?? ".data",
    /** When provided, /api/files/ photo refs are probed at upsert: a dead ref is
     *  refused loudly at the door instead of rendering a broken image later. */
    private files?: FileStore,
  ) {
    this.productsDir = path.join(dataDir, "products");
    this.legacyFile = path.join(dataDir, "products.json");
  }

  private fileFor(id: string): string {
    if (!SAFE_PRODUCT_ID.test(id)) throw new Error(`unsafe product id "${id}", refusing to build a file path from it`);
    return path.join(this.productsDir, `${id}.json`);
  }

  /** Quarantine never takes the store down: a failed rename is logged and the
   *  file is skipped, the blast radius stays per-file even on this path. */
  private async safeQuarantine(file: string, why: string): Promise<void> {
    try {
      const to = `${file}.corrupt-${Date.now()}`;
      await renameWithRetry(file, to);
      console.error(`[products] ${path.basename(file)} was ${why}, moved to ${path.basename(to)}; the other products are untouched.`);
    } catch (err) {
      console.error(`[products] could not quarantine ${path.basename(file)} (${why}): ${String(err)}, skipped, NOT loaded.`);
    }
  }

  private async sweepTempFiles(): Promise<void> {
    for (const f of await readdir(this.productsDir).catch(() => [] as string[])) {
      if (f.startsWith(".") && f.includes(".tmp-")) await rm(path.join(this.productsDir, f), { force: true }).catch(() => {});
    }
  }

  /** Absorb the first-commit monolith (never released, dev/shot dirs only):
   *  every entry becomes its own file, the source is archived, bytes never deleted. */
  private async absorbLegacyMonolith(): Promise<void> {
    const legacy = await loadJsonArrayDurable<ProductProfile>(this.legacyFile); // corrupt → self-quarantines inside
    if (!legacy) return;
    for (const raw of legacy) {
      const parsed = productProfileSchema.safeParse(raw);
      if (!parsed.success) {
        console.error(`[products] legacy entry failed schema validation (${parsed.error.issues[0]?.path.join(".")}), kept in the archive file, skipped`);
        continue;
      }
      const target = this.fileFor(parsed.data.id);
      if (await pathExists(target)) continue; // per-product file wins (newer by construction)
      await atomicWriteJson(target, parsed.data);
    }
    await renameWithRetry(this.legacyFile, `${this.legacyFile}.legacy-${Date.now().toString(36)}`);
  }

  async load() {
    await mkdir(this.productsDir, { recursive: true });
    await this.sweepTempFiles();
    await this.absorbLegacyMonolith();
    this.items = [];
    const seen = new Set<string>();
    for (const f of await readdir(this.productsDir)) {
      if (f.startsWith(".") || !f.endsWith(".json")) continue; // temps swept; archives/quarantines live alongside
      const file = path.join(this.productsDir, f);
      let parsed: ProductProfile;
      try {
        parsed = productProfileSchema.parse(JSON.parse(await readFile(file, "utf8")));
      } catch {
        await this.safeQuarantine(file, "unparseable or not a valid product");
        continue;
      }
      if (f !== `${parsed.id}.json`) {
        const canonical = this.fileFor(parsed.id);
        if (await pathExists(canonical)) {
          await this.safeQuarantine(file, `duplicate of ${path.basename(canonical)}`);
          continue;
        }
        await renameWithRetry(file, canonical).catch(() => {}); // recover the bytes under the canonical name
      }
      if (seen.has(parsed.id)) continue; // a duplicate surfaced later in the dir loses
      seen.add(parsed.id);
      this.items.push(parsed);
    }
    this.resort();
  }

  /** Single sort invariant (createdAt DESC, id ASC): newest first, stable under edits. */
  private resort(): void {
    this.items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || (a.id < b.id ? -1 : 1));
  }

  /** Zod validation; keeps id on update, assigns/refreshes timestamps, dedupes
   *  tags (case-insensitive, first casing wins). The spread comes FIRST: an
   *  explicit `id: undefined` crossing the wire (structured clone keeps the key)
   *  must not overwrite the store-assigned id (regression, W1.1 shot gate). */
  validate(input: unknown): ProductProfile {
    const raw = input as Record<string, unknown>;
    const prev = raw?.id ? this.items.find((p) => p.id === raw.id) : undefined;
    const tags: string[] = [];
    for (const t of (Array.isArray(raw?.tags) ? raw.tags : []) as unknown[]) {
      if (typeof t !== "string") continue; // zod reports the shape error below
      const key = t.trim().toLowerCase();
      if (!tags.some((x) => x.toLowerCase() === key)) tags.push(t.trim());
    }
    const parsed = productProfileSchema.safeParse({
      ...(raw as Record<string, unknown>),
      id: raw?.id ?? uniqueId("prd"),
      tags,
      createdAt: prev?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    return parsed.data;
  }

  /** A stored-asset ref must point at bytes that exist; http(s) is out of scope
   *  (D15: the store never fetches). Probes via pathOf (metadata only, no byte
   *  read; the only FileStore today is local disk). Throws with every missing ref named. */
  private async assertPhotoRefsExist(product: ProductProfile): Promise<void> {
    if (!this.files) return;
    const missing: string[] = [];
    for (const ph of product.photos) {
      if (!ph.ref.startsWith("/api/files/")) continue;
      if ((await this.files.pathOf(ph.ref.slice("/api/files/".length))) === null) missing.push(ph.ref);
    }
    if (missing.length > 0) throw new Error(`photos: ref(s) not found in the asset store: ${missing.join(", ")}`);
  }

  async upsert(input: unknown): Promise<ProductProfile> {
    const product = this.validate(input);
    await this.assertPhotoRefsExist(product);
    await atomicWriteJson(this.fileFor(product.id), product);
    const idx = this.items.findIndex((p) => p.id === product.id);
    if (idx >= 0) this.items[idx] = product; else this.items.push(product);
    this.resort();
    return product;
  }

  /** A copy: mutating the result never corrupts the in-memory store. */
  list(): ProductProfile[] { return [...this.items]; }
  get(id: string): ProductProfile | undefined { return this.items.find((p) => p.id === id); }

  async remove(id: string): Promise<boolean> {
    const before = this.items.length;
    this.items = this.items.filter((p) => p.id !== id);
    if (this.items.length === before) return false; // never lies about a second remove
    await rm(this.fileFor(id), { force: true }).catch(() => {});
    return true;
  }
}
