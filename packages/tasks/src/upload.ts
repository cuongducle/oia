/** Chunked upload protocol (init → chunks ≤5MB → complete). */
export interface ChunkUploadDeps { baseUrl: string; headers?: Record<string, string> }

export async function uploadFile(
  file: Blob & { name?: string },
  deps: ChunkUploadDeps,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const CHUNK = 5 * 1024 * 1024;
  const md5 = await md5Of(await file.arrayBuffer());
  const name = file.name ?? "upload.bin";
  const init = await fetch(
    `${deps.baseUrl}/api/upload/chunk-init?fileName=${encodeURIComponent(name)}&fileMd5=${md5}`,
    { method: "POST", headers: deps.headers },
  ).then((r) => r.json());
  if (init.data?.url) return init.data.url as string;

  const { uploadId } = init.data;
  const parts: { partNumber: number; etag: string }[] = [];
  const total = Math.max(1, Math.ceil(file.size / CHUNK));
  for (let i = 0; i < total; i++) {
    const chunk = file.slice(i * CHUNK, (i + 1) * CHUNK);
    const fd = new FormData();
    fd.set("uploadId", uploadId);
    fd.set("partNumber", String(i + 1));
    fd.set("file", chunk);
    const res = await fetch(`${deps.baseUrl}/api/upload/chunk`, { method: "POST", headers: deps.headers, body: fd }).then((r) => r.json());
    parts.push({ partNumber: i + 1, etag: res.data.etag });
    onProgress?.(Math.round(((i + 1) / total) * 100));
  }
  const done = await fetch(`${deps.baseUrl}/api/upload/chunk-complete?uploadId=${uploadId}`, {
    method: "POST",
    headers: { ...deps.headers, "content-type": "application/json" },
    body: JSON.stringify(parts),
  }).then((r) => r.json());
  return done.data.url as string;
}

async function md5Of(_buf: ArrayBuffer): Promise<string> {
  // M0: placeholder hash (demo only). Swap in spark-md5/WASM once dedupe matters.
  return Array.from(new Uint8Array(_buf.slice(0, 16))).map((b) => b.toString(16).padStart(2, "0")).join("") + "m0";
}
