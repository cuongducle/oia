import { getRuntime, requireApiKey } from "@/libs/runtime";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __oiaChunks?: Map<string, { partNumber: number; etag: string; bytes: Buffer }[]> };

/** POST /api/upload/chunk (form: uploadId, partNumber, file) → {partNumber, etag}. */
export async function POST(req: Request) {
  const guard = await requireApiKey(req);
  if (guard) return guard;
  const form = await req.formData();
  const uploadId = String(form.get("uploadId") ?? "");
  const partNumber = Number(form.get("partNumber") ?? 0);
  const file = form.get("file");
  if (!uploadId || !partNumber || !(file instanceof File)) {
    return Response.json({ code: 1, data: null, msg: "uploadId, partNumber, file required" }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const etag = createHash("md5").update(bytes).digest("hex");
  g.__oiaChunks ??= new Map();
  g.__oiaChunks.set(uploadId, [...(g.__oiaChunks.get(uploadId) ?? []), { partNumber, etag, bytes }]);
  await mkdir(path.join(process.env.OIA_DATA_DIR ?? ".data", "pending"), { recursive: true });
  await writeFile(path.join(process.env.OIA_DATA_DIR ?? ".data", "pending", `${uploadId}.${partNumber}`), bytes);
  return Response.json({ code: 0, data: { partNumber, etag }, msg: "" });
}
