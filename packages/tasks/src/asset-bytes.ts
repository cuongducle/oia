import type { FileStore } from "./storage.js";

/** data: | http(s) | same-origin asset ref (/api/files/<key>), resolved through the store when present. */
export async function fetchBytes(url: string, store?: FileStore): Promise<Uint8Array> {
  if (url.startsWith("data:")) {
    const b64 = url.split(",")[1] ?? "";
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  // TP.7: scenes reference assets as /api/files/<key>, same-origin browser URLs that
  // Node fetch cannot resolve; read the bytes from the file store instead
  if (store && url.startsWith("/api/files/")) {
    return store.read(url.replace(/^\/api\/files\//, ""));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
