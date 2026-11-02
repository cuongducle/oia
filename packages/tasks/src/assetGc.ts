import type { LocalFileStore } from "./storage.js";

/**
 * T11 — asset garbage collection. Deleting a project used to leave every image it
 * used on disk forever (~2 MB per Codex generation), so userData only grew.
 *
 * Reachability is decided by TEXT, not by schema: every root (projects, chat
 * sessions, templates, brand kits) is serialized and scanned for `uploads/<day>/<file>`
 * keys, whatever prefix carries them (`/api/files/`, `oia://files/`, a bare key).
 * A schema field this code has never heard of still keeps its asset alive — the
 * failure mode of a wrong guess is a leaked file, never a deleted one.
 *
 * The grace window protects what is not in any store YET: an upload sitting in
 * an editor that has not autosaved, a generation whose session append is in
 * flight, a tool/agent task result (task records live 24 h). Only files older than
 * the window AND unreferenced are removed.
 */

export const ASSET_GC_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const KEY_RE = /uploads\/\d{8}\/[A-Za-z0-9._-]+/g;

/** Every upload key mentioned anywhere inside the given roots. */
export function collectAssetRefs(roots: readonly unknown[]): Set<string> {
  const refs = new Set<string>();
  for (const root of roots) {
    const text = typeof root === "string" ? root : JSON.stringify(root) ?? "";
    for (const m of text.matchAll(KEY_RE)) refs.add(m[0]);
  }
  return refs;
}

export interface AssetGcResult {
  scanned: number;
  referenced: number;
  removed: string[];
  /** Unreferenced but younger than the grace window — kept this round. */
  young: number;
}

export async function sweepUnreferencedAssets(opts: {
  files: LocalFileStore;
  roots: readonly unknown[];
  graceMs?: number;
  now?: number;
}): Promise<AssetGcResult> {
  const graceMs = opts.graceMs ?? ASSET_GC_GRACE_MS;
  const now = opts.now ?? Date.now();
  const refs = collectAssetRefs(opts.roots);
  const uploads = await opts.files.listUploads();
  const result: AssetGcResult = { scanned: uploads.length, referenced: 0, removed: [], young: 0 };
  for (const { key, mtimeMs } of uploads) {
    if (refs.has(key)) {
      result.referenced += 1;
      continue;
    }
    if (now - mtimeMs < graceMs) {
      result.young += 1;
      continue;
    }
    await opts.files.remove(key);
    result.removed.push(key);
  }
  return result;
}
