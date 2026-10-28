import { getRuntime } from "@/libs/runtime";

export const dynamic = "force-dynamic";

/** GET 1 project · PATCH save (auto-save editor) · DELETE. */
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projects } = await getRuntime();
  const p = projects.get(id);
  if (!p) return Response.json({ code: 404, data: null, msg: "not found" }, { status: 404 });
  return Response.json({ code: 0, data: p, msg: "" });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { projects } = await getRuntime();
  const p = await projects.saveScene(id, { name: body?.name, pages: body?.pages });
  if (!p) return Response.json({ code: 404, data: null, msg: "not found" }, { status: 404 });
  return Response.json({ code: 0, data: p, msg: "" });
}
export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projects } = await getRuntime();
  const ok = await projects.remove(id);
  return Response.json({ code: ok ? 0 : 1, data: null, msg: "" }, { status: ok ? 200 : 404 });
}
