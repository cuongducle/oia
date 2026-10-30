/**
 * Upload policy — the single home for what the app accepts as an upload.
 * Both intake paths (renderer IPC and the loopback agent API) must enforce
 * the SAME allowlist; it used to live only in shared/ipc.ts while loopback
 * accepted any extension an agent chose to send.
 */
export const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

/** Ext (lowercase, without dot) → allowed? */
export function isImageExt(ext: string): boolean {
  return IMAGE_EXTS.has(ext.toLowerCase());
}

/** Filename → its lowercase extension, or "" when it has none. */
export function fileExtOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}
