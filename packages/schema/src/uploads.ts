/**
 * Upload policy, the single home for what the app accepts as an upload.
 * Both intake paths (renderer IPC and the loopback agent API) must enforce
 * the SAME allowlist; it used to live only in shared/ipc.ts while loopback
 * accepted any extension an agent chose to send.
 */
export const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

/** SG-7: document types accepted as TASK INPUTS (ppt-translate source decks),
 *  never canvas-renderable assets. Kept separate from IMAGE_EXTS so image-only
 *  paths (canvas, exports) keep refusing documents. */
export const DOC_EXTS = new Set(["pptx"]);

const UPLOAD_EXTS = new Set([...IMAGE_EXTS, ...DOC_EXTS]);

/** Ext (lowercase, without dot) → allowed as an upload (image asset or document task input)? */
export function isUploadExt(ext: string): boolean {
  return UPLOAD_EXTS.has(ext.toLowerCase());
}

/** Ext (lowercase, without dot) → allowed? */
export function isImageExt(ext: string): boolean {
  return IMAGE_EXTS.has(ext.toLowerCase());
}

/** Filename → its lowercase extension, or "" when it has none. */
export function fileExtOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}
