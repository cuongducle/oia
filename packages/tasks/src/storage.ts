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
  private md5Index = new Map<string, string>(); // full md5 → key (in-process)
  private prefixIndex = new Map<string, string>(); // 8-char md5 prefix → key (hydrated from disk filenames)
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
    const existing = await this.findByMd5(md5);
    if (existing) return { key: this.md5Index.get(md5) ?? this.prefixIndex.get(md5.slice(0, 8))!, url: existing, md5 };

    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const key = `uploads/${day}/${md5.slice(0, 8)}-${Date.now().toString(36)}.${ext}`;
    const abs = path.join(this.root, key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
    this.md5Index.set(md5, key);
    return { key, url: `${this.publicBase}/${key}`, md5 };
  }

  async findByMd5(md5: string): Promise<string | null> {
    const key = this.md5Index.get(md5) ?? this.prefixIndex.get(md5.slice(0, 8));
    return key ? `${this.publicBase}/${key}` : null;
  }

/** Reload the md5 index from disk (dedupe survives server restarts).
 *  Filenames carry the 8-char md5 prefix — indexed by prefix and matched by prefix in findByMd5. */
  async hydrate(): Promise<void> {
    const dir = path.join(this.root, "uploads");
    try {
      for (const day of await readdir(dir)) {
        for (const f of await readdir(path.join(dir, day)).catch(() => [])) {
          const m = f.match(/^([0-9a-f]{8})-/);
          if (m) {
  // an 8-char md5 prefix is enough for practical dedupe (collisions overwrite)
            this.prefixIndex.set(m[1], path.join("uploads", day, f));
          }
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
