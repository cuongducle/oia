import { getRuntime, requireApiKey } from "@/libs/runtime";

export const dynamic = "force-dynamic";

/** POST /api/templates/{id}/tip — tip the author (BR-TPL3). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiKey(req); if (guard) return guard;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { templates } = await getRuntime();
  const tpl = await templates.tip(id, Number(body?.credits ?? 1));
  if (!tpl) return Response.json({ code: 404, data: null, msg: "not found" }, { status: 404 });
  return Response.json({ code: 0, data: tpl, msg: "" });
}
