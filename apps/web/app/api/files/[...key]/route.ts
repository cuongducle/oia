import { getRuntime } from "@/libs/runtime";

export const dynamic = "force-dynamic";

/** GET /api/files/<key> — public images/assets for canvases and task results. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const { files } = await getRuntime();
  try {
    const bytes = await files.read(key.join("/"));
    const ext = key.join(".").split(".").pop() ?? "";
    return new Response(bytes as unknown as BodyInit, {
      headers: { "content-type": files.contentType(ext), "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return Response.json({ code: 404, data: null, msg: "not found" }, { status: 404 });
  }
}
