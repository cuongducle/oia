import type { Project, SceneCanvas } from "@oia/schema";
import { validateProjectForSave } from "@oia/schema";
import type { FileStore } from "./storage.js";

/**
 * TP.7 (Slice 3) — migrate-on-save: the no-base64 rule is enforced ON SAVE, not on load.
 * Legacy projects/sessions containing data URLs still open (read-tolerant); every save
 * extracts embedded bytes into the asset store and rewrites references to the pinned
 * asset syntax `/api/files/<key>` (exactly what `LocalFileStore.put()` returns — the
 * storage key IS the asset id). Thumbnails land on the same asset (md5 dedupe makes
 * the artwork and its thumbnail one file).
 */

const DATA_URL_RE = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i;

/** Raised when a scene still carries base64 after migration — refuses the save, lists why. */
export class PersistenceError extends Error {
  readonly violations: string[];
  constructor(message: string, violations: string[]) {
    super(message);
    this.name = "PersistenceError";
    this.violations = violations;
  }
}

function extForMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  return map[mime.toLowerCase()] ?? "bin";
}

/** Extract every data-URL object src into the store; rewrites in place. Returns how many. */
export async function migrateScene(scene: SceneCanvas, store: FileStore): Promise<number> {
  let extracted = 0;
  for (const obj of scene.objects ?? []) {
    const src = typeof obj.src === "string" ? obj.src : null;
    if (!src || !src.startsWith("data:")) continue;
    const m = src.match(DATA_URL_RE);
    if (!m) continue; // unparseable (e.g. percent-encoded) — validation below catches it
    const bytes = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
    if (!bytes.length) continue;
    const { url } = await store.put(new Uint8Array(bytes), extForMime(m[1]));
    obj.src = url;
    extracted++;
  }
  return extracted;
}

/** Extract a data-URL string (thumbnails) → asset URL; returns the original when not a data URL. */
export async function migrateSrc(src: unknown, store: FileStore): Promise<unknown> {
  if (typeof src !== "string" || !src.startsWith("data:")) return src;
  const m = src.match(DATA_URL_RE);
  if (!m) return src;
  const bytes = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
  if (!bytes.length) return src;
  const { url } = await store.put(new Uint8Array(bytes), extForMime(m[1]));
  return url;
}

/**
 * Chat-session renderData: walk msgMeta — migrate `thumbnail` and the canvas objects.
 * Returns the number of extracted assets (artwork + thumbnails share one md5 asset).
 */
export async function migrateRenderData(renderData: unknown, store: FileStore): Promise<number> {
  const rd = renderData as { msgMeta?: { thumbnail?: unknown; canvas?: SceneCanvas }[] } | undefined;
  if (!rd?.msgMeta) return 0;
  let extracted = 0;
  for (const meta of rd.msgMeta) {
    const thumb = await migrateSrc(meta.thumbnail, store);
    if (thumb !== meta.thumbnail) {
      meta.thumbnail = thumb;
      extracted++;
    }
    if (meta.canvas) extracted += await migrateScene(meta.canvas, store);
  }
  return extracted;
}

/** Migrate every page of a project, then enforce the no-base64-on-save rule (throws PersistenceError). */
export async function migrateProjectForSave(project: Project, store: FileStore): Promise<void> {
  for (const page of project.pages) {
    await migrateScene(page.canvas, store);
  }
  const violations = validateProjectForSave(project);
  if (violations.length) {
    throw new PersistenceError(
      `refusing to save base64 scene data (${violations.length} embedded data URLs could not be extracted)`,
      violations,
    );
  }
}
