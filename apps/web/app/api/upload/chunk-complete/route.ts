import { getRuntime, requireApiKey } from "@/libs/runtime";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/upload/chunk-complete?uploadId= + body [{partNumber, etag}] → public url (BR-UP). */
export async function POST(req: Request) {
  const guard = await requireApiKey(req);
  if (guard) return guard;
  const uploadId = new URL(req.url).searchParams.get("uploadId") ?? "";
  const parts = (await req.json().catch(() => [])) as { partNumber: number; etag: string }[];
  if (!uploadId || !parts.length) {
    return Response.json({ code: 1, data: null, msg: "uploadId + parts[] required" }, { status: 400 });
  }
  const pendingDir = path.join(process.env.OIA_DATA_DIR ?? ".data", "pending");
  const chunks: Buffer[] = [];
  for (const p of [...parts].sort((a, b) => a.partNumber - b.partNumber)) {
    chunks.push(await readFile(path.join(pendingDir, `${uploadId}.${p.partNumber}`)));
  }
  const all = Buffer.concat(chunks);
  const { files } = await getRuntime();
  const ext = "png"; // M3: the client decides via fileName at init — png kept for images
  const saved = await files.put(new Uint8Array(all), ext);
  await rm(pendingDir, { recursive: true, force: true });
  return Response.json({
    code: 0,
    data: { uploadId: null, url: saved.url, fileName: saved.key.split("/").pop(), size: all.length, contentType: files.contentType(ext) },
    msg: "",
  });
}
