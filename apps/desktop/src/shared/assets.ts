/**
 * Scene srcs reference /api/files/<key> (same-origin on the web shell). On desktop there
 * is no HTTP server — the oia://files/<key> protocol serves the LocalFileStore instead.
 */
export function mapAssetUrls<T extends { objects?: { src?: unknown }[] }>(scene: T): T {
  const objects = (scene.objects ?? []).map((o) =>
    typeof o.src === "string" && o.src.startsWith("/api/files/")
      ? { ...o, src: `oia://files/${o.src.slice("/api/files/".length)}` }
      : o,
  );
  return { ...scene, objects };
}
