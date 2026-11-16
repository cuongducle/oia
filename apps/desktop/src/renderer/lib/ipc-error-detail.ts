/**
 * Store validation errors arrive wrapped by Electron ("Error invoking remote
 * method …: Error: <detail>"); recover the LAST detail segment so the store's
 * message reaches the user instead of being buried under the wrapper (never
 * match the wrapper itself). One home, BrandKit + Products both show it.
 */
export function ipcErrorDetail(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.includes("Error:") ? raw.slice(raw.lastIndexOf("Error:") + "Error:".length).trim() : raw;
}
