import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * BR-UP storage: local filesystem self-hosting (S3/MinIO adapter planned).
 * - put(bytes) → key `uploads/<yyyymmdd>/<uuid>.<ext>` + url `/api/files/<key>`
 * - dedupe: identical md5 returns the previous url ("if url != null in the response,
 *   the file was already uploaded — reuse that URL directly")
 */
export interface FileStore {
  put(bytes: Uint8Array, ext: string): Promise<{ key: string; url: string; md5: string }>;
  findByMd5(md5: string): Promise<string | null>; // → previous url, if any
  read(key: string): Promise<Uint8Array>;
  contentType(ext: string): string;
}

export class LocalFileStore implements FileStore {
  private md5Index = new Map<string, string>(); // FULL md5 → key (authoritative)
  /** LEGACY names (pre-F3) embed only an 8-char prefix — a 32-bit key. Matching a
   *  new upload by that prefix alone returned the WRONG image silently (~1% at
   *  ~9k assets). Prefix hits are only a HINT now: the file is read back and
   *  hash-verified before any dedupe claim; a mismatch writes a new file. */
  private legacyPrefixIndex = new Map<string, string>();
  constructor(
    private root = process.env.OIA_DATA_DIR ?? ".data/files",
    private publicBase = "/api/files",
  ) {}

  private safeKey(key: string): string | null {
    const p = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    if (p.startsWith("..") || path.isAbsolute(p)) return null;
    return p;
  }

  async put(bytes: Uint8Array, ext: string): Promise<{ key: string; url: string; md5: string }> {
    const md5 = createHash("md5").update(bytes).digest("hex");
    const existing = await this.resolveExistingKey(md5);
    if (existing) return { key: existing, url: `${this.publicBase}/${existing}`, md5 };

    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    // FULL md5 in the name — hydrate rebuilds the authoritative index with no
    // prefix ambiguity (F3)
    const key = `uploads/${day}/${md5}-${Date.now().toString(36)}.${ext}`;
    const abs = path.join(this.root, key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
    this.md5Index.set(md5, key);
    return { key, url: `${this.publicBase}/${key}`, md5 };
  }

  /** Full-md5 hit, else a VERIFIED legacy-prefix hit (bytes hashed back). */
  private async resolveExistingKey(md5: string): Promise<string | null> {
    const direct = this.md5Index.get(md5);
    if (direct) return direct;
    const hinted = this.legacyPrefixIndex.get(md5.slice(0, 8));
    if (!hinted) return null;
    const onDisk = await this.read(hinted).catch(() => null);
    if (!onDisk) {
      this.legacyPrefixIndex.delete(md5.slice(0, 8)); // file vanished — drop the stale hint
      return null;
    }
    const actual = createHash("md5").update(onDisk).digest("hex");
    if (actual !== md5) return null; // prefix collision — different image, never dedupe
    this.md5Index.set(md5, hinted); // promote: verified full md5
    this.legacyPrefixIndex.delete(md5.slice(0, 8));
    return hinted;
  }

  async findByMd5(md5: string): Promise<string | null> {
    const key = await this.resolveExistingKey(md5);
    return key ? `${this.publicBase}/${key}` : null;
  }

/** Reload the md5 index from disk (dedupe survives restarts).
 *  New names carry the FULL md5 (authoritative). Legacy 8-char-prefix names are
 *  hints only — verified against the bytes before any dedupe claim (F3). */
  async hydrate(): Promise<void> {
    const dir = path.join(this.root, "uploads");
    try {
      for (const day of await readdir(dir)) {
        for (const f of await readdir(path.join(dir, day)).catch(() => [])) {
          const full = f.match(/^([0-9a-f]{32})-/);
          if (full) {
            this.md5Index.set(full[1], path.join("uploads", day, f));
            continue;
          }
          const legacy = f.match(/^([0-9a-f]{8})-/);
          if (legacy) this.legacyPrefixIndex.set(legacy[1], path.join("uploads", day, f));
        }
      }
    } catch { /* no data yet */ }
  }

  async read(key: string): Promise<Uint8Array> {
    const safe = this.safeKey(key);
    if (!safe) throw new Error("invalid key");
    return new Uint8Array(await readFile(path.join(this.root, safe)));
  }

  contentType(ext: string): string {
    const map: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
      gif: "image/gif", pdf: "application/pdf", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      zip: "application/zip",
    };
    return map[ext.toLowerCase()] ?? "application/octet-stream";
  }
}
