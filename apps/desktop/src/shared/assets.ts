/**
 * Scene srcs reference /api/files/<key> (same-origin on the web shell). On desktop there
 * is no HTTP server — the oia://files/<key> protocol serves the LocalFileStore instead.
 * Shipped studio artwork (/studio/*.webp) is served by the renderer's own origin, so it
 * maps to a RELATIVE path (absolute paths break under file:// in the packaged app).
 *
 * Canonical form (/api/files/…, /studio/…) is what the STORES persist and what providers
 * accept; display form (oia://…, studio/…) is what the renderer's fabric canvas loads.
 * Map on the way in to the renderer, unmap on the way out (autosave, templates, refs).
 */
export function mapAssetUrls<T extends { objects?: { src?: unknown }[] }>(scene: T): T {
  const objects = (scene.objects ?? []).map((o) =>
    typeof o.src === "string"
      ? { ...o, src: toDisplayUrl(o.src) }
      : o,
  );
  return { ...scene, objects };
}

/** Inverse of mapAssetUrls — renderer display form back to the canonical store/provider form. */
export function unmapAssetUrls<T extends { objects?: { src?: unknown }[] }>(scene: T): T {
  const objects = (scene.objects ?? []).map((o) =>
    typeof o.src === "string"
      ? { ...o, src: toCanonicalUrl(o.src) }
      : o,
  );
  return { ...scene, objects };
}

/** Single-URL form (reference images, asset panel entries). */
export function toDisplayUrl(url: string): string {
  if (url.startsWith("/api/files/")) return `oia://files/${url.slice("/api/files/".length)}`;
  if (url.startsWith("/studio/")) return url.slice(1); // relative — survives file:// and dev-server origins
  return url;
}

export function toCanonicalUrl(url: string): string {
  if (url.startsWith("oia://files/")) return `/api/files/${url.slice("oia://files/".length)}`;
  if (url.startsWith("studio/") && !url.startsWith("//")) return `/${url}`;
  return url;
}
