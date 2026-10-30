/**
 * Reorg step 7 security gate — the URL half of the oia://files protocol.
 * Pure on purpose: the traversal suite needs to run without Electron. The sink
 * half (path containment, symlink escape) is gated in packages/tasks storage.
 */
export function oiaFilesKey(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "oia:" || url.host !== "files") return null; // oia://anything-else is not a file route
  let key: string;
  try {
    key = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return null; // malformed percent-encoding — never guess a fallback
  }
  return key || null;
}
