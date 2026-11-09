import type { FileStore } from "./storage.js";

/**
 * Reference images handed to an image provider. Scenes and uploads name stored assets
 * by ADDRESS (`/api/files/<key>`, or the renderer's `oia://files/<key>`), which no
 * provider can open, the codex CLI read `/api/files/…` as a disk path and failed.
 * Store addresses travel as data: URLs; every other form (data:, http(s), file:,
 * a path) passes through for the provider to materialize.
 */
const STORE_PREFIXES = ["/api/files/", "oia://files/"] as const;

const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

export async function resolveReferenceImage(ref: string, store: FileStore): Promise<string> {
  const prefix = STORE_PREFIXES.find((p) => ref.startsWith(p));
  if (!prefix) return ref;
  const key = decodeURIComponent(ref.slice(prefix.length));
  const bytes = await store.read(key);
  const mime = MIME_BY_EXT[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function resolveReferenceImages(refs: string[] | undefined, store: FileStore): Promise<string[] | undefined> {
  return refs?.length ? Promise.all(refs.map((r) => resolveReferenceImage(r, store))) : refs;
}
