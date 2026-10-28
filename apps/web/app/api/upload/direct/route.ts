import { getRuntime } from "@/libs/runtime";
import { checkNsfw } from "@pixforge/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST multipart file → stored straight into the FileStore (editor Import/Assets). */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ code: 1, data: null, msg: "file required" }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const nsfw = await checkNsfw(bytes, file.name);
  if (!nsfw.allowed) return Response.json({ code: 1, data: null, msg: nsfw.error }, { status: 400 });
  const { files } = await getRuntime();
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
  const saved = await files.put(bytes, ext);
  return Response.json({ code: 0, data: { url: saved.url, size: bytes.length }, msg: "" });
}
