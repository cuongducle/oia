import { getRuntime, requireApiKey } from "@/libs/runtime";
import { getLlmProvider } from "@oia/providers";
import { extractBrandKit } from "@oia/tasks";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST {fileUrl?, notes?} → brand kit draft (BR-EX — drafted from a brand book). */
export async function POST(req: Request) {
  const guard = await requireApiKey(req); if (guard) return guard;
  const body = await req.json().catch(() => ({}));
  try {
    const kit = await extractBrandKit(getLlmProvider(), { fileUrl: body?.fileUrl, notes: body?.notes });
    return Response.json({ code: 0, data: kit, msg: "" });
  } catch (err) {
    return Response.json({ code: 1, data: null, msg: String(err) }, { status: 500 });
  }
}
