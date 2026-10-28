import { getRuntime, requireApiKey } from "@/libs/runtime";

export const dynamic = "force-dynamic";

/** POST /api/upload/chunk-init?fileName=&fileMd5=&folder= — dedupe md5 → url (BR-UP). */
export async function POST(req: Request) {
  const guard = await requireApiKey(req);
  if (guard) return guard;
  const url = new URL(req.url);
  const fileName = url.searchParams.get("fileName") ?? "";
  const fileMd5 = url.searchParams.get("fileMd5") ?? "";
  if (!fileName || !fileMd5) {
    return Response.json({ code: 1, data: null, msg: "fileName & fileMd5 required" }, { status: 400 });
  }
  const { files } = await getRuntime();
  const existing = await files.findByMd5(fileMd5);
  return Response.json({
    code: 0,
    data: {
      uploadId: existing ? null : `up_${Date.now().toString(36)}_${fileMd5.slice(0, 8)}`,
      url: existing,
      fileKey: `uploads/pending/${fileName}`,
    },
    msg: "",
  });
}
