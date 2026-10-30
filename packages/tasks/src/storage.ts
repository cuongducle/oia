import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

/**
 * BR-UP storage: local filesystem self-hosting (S3/MinIO adapter planned).
 * - put(bytes) → key `uploads/<yyyymmdd>/<hash>-<ts36>.<ext>` + url `/api/files/<key>`
 * - dedupe: identical content returns the previous url ("if url != null in the
 *   response, the file was already uploaded — reuse that URL directly")
 *
 * Identity is sha256 (F4): md5 is collision-broken, and this dedupe silently
 * ALIASES two different files on any collision. Files written before the switch
 * are still deduped through LEGACY md5 indexes — full-32-hex names match by full
 * md5, old 8-char-prefix names are hints verified against the bytes.
 */
export interface FileStore {
  put(bytes: Uint8Array, ext: string): Promise<{ key: string; url: string; hash: string }>;
  findByHash(hash: string): Promise<string | null>; // → previous url, if any
  read(key: string): Promise<Uint8Array>;
  contentType(ext: string): string;
}

export class LocalFileStore implements FileStore {
  private sha256Index = new Map<string, string>(); // FULL sha256 → key (authoritative, new files)
  /** LEGACY (pre-F4) md5 identity — kept ONLY to keep dedupe working for files
   *  written by older builds; new files never enter these. */
  private legacyFullMd5Index = new Map<string, string>(); // 32-hex md5 names → key
  /** LEGACY pre-F3 names: 8-char prefix — a HINT, bytes verified before any claim. */
  private legacyPrefixIndex = new Map<string, string>();
  /** Realpath of rootDir, resolved once — it never moves (see read()). */
  private realRootP: Promise<string> | undefined;
  constructor(
    private rootDir = process.env.OIA_DATA_DIR ?? ".data/files",
    private publicBase = "/api/files",
  ) {}

  private safeKey(key: string): string | null {
    const p = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    if (p.startsWith("..") || path.isAbsolute(p)) return null;
    return p;
  }

  /** The absolute root this store writes under (reorg step 5: the web `.data`
   *  import copies asset files in here under their original keys). */
  get root(): string {
    return this.rootDir;
  }

  async put(bytes: Uint8Array, ext: string): Promise<{ key: string; url: string; hash: string }> {
    const sha = createHash("sha256").update(bytes).digest("hex");
    const md5 = createHash("md5").update(bytes).digest("hex"); // legacy resolution only
    const existing = await this.resolveExistingKey(sha, md5);
    if (existing) return { key: existing, url: `${this.publicBase}/${existing}`, hash: sha };

    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    // FULL sha256 in the name — hydrate rebuilds the authoritative index (F3/F4)
    const key = `uploads/${day}/${sha}-${Date.now().toString(36)}.${ext}`;
    const abs = path.join(this.rootDir, key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
    this.sha256Index.set(sha, key);
    return { key, url: `${this.publicBase}/${key}`, hash: sha };
  }

  /** sha256 hit, else a VERIFIED legacy md5 hit (full-32 match, or prefix + bytes hashed back). */
  private async resolveExistingKey(sha: string, md5: string): Promise<string | null> {
    const direct = this.sha256Index.get(sha);
    if (direct) return direct;

    const fullLegacy = this.legacyFullMd5Index.get(md5);
    if (fullLegacy) {
      // full md5 match on a legacy file — same guarantee the old system gave;
      // promote to the sha256 index so later lookups skip this lane
      this.sha256Index.set(sha, fullLegacy);
      this.legacyFullMd5Index.delete(md5);
      return fullLegacy;
    }

    const hinted = this.legacyPrefixIndex.get(md5.slice(0, 8));
    if (!hinted) return null;
    const onDisk = await this.read(hinted).catch(() => null);
    if (!onDisk) {
      this.legacyPrefixIndex.delete(md5.slice(0, 8)); // file vanished — drop the stale hint
      return null;
    }
    const actualMd5 = createHash("md5").update(onDisk).digest("hex");
    if (actualMd5 !== md5) return null; // prefix collision — different image, never dedupe
    this.sha256Index.set(sha, hinted); // promote: verified content identity
    this.legacyPrefixIndex.delete(md5.slice(0, 8));
    return hinted;
  }

  async findByHash(hash: string): Promise<string | null> {
    const direct = this.sha256Index.get(hash);
    if (direct) return `${this.publicBase}/${direct}`;
    const legacy = this.legacyFullMd5Index.get(hash); // callers holding a legacy md5 still dedupe
    return legacy ? `${this.publicBase}/${legacy}` : null;
  }

/** Reload the index from disk (dedupe survives restarts).
 *  New names carry the FULL sha256 (authoritative). Legacy 32-hex names are full
 *  md5; legacy 8-char names are hints verified against the bytes (F3/F4). */
  async hydrate(): Promise<void> {
    const dir = path.join(this.rootDir, "uploads");
    try {
      for (const day of await readdir(dir)) {
        for (const f of await readdir(path.join(dir, day)).catch(() => [])) {
          const sha = f.match(/^([0-9a-f]{64})-/);
          if (sha) {
            this.sha256Index.set(sha[1], path.join("uploads", day, f));
            continue;
          }
          const legacyFull = f.match(/^([0-9a-f]{32})-/);
          if (legacyFull) {
            this.legacyFullMd5Index.set(legacyFull[1], path.join("uploads", day, f));
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
    const full = path.join(this.rootDir, safe);
    // Reorg step 7 security gate: safeKey stops ".."/absolute keys, but a symlink
    // planted inside the tree would still escape — resolve BOTH ends and require
    // the file to stay inside the real root (throws ENOENT-miss as before when
    // absent). Known TOCTOU: the link could swap between realpath and readFile —
    // accepted (defeating it needs an attacker who can already write the tree,
    // at which point they own the data anyway).
    // The root is resolved lazily ONCE — but a REJECTED resolve must not be cached:
    // the first read can legitimately race ahead of the first upload (root not
    // created yet); caching that ENOENT poisoned every later read (found live by
    // the shot gate after the dark-mode gate shifted boot timing).
    if (!this.realRootP) {
      const p = realpath(this.rootDir);
      this.realRootP = p;
      p.catch(() => {
        if (this.realRootP === p) this.realRootP = undefined; // retry on the next read
      });
    }
    const realRoot = await this.realRootP;
    const realFile = await realpath(full);
    if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) throw new Error("invalid key");
    return new Uint8Array(await readFile(full));
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
