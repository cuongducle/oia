import { getRuntime } from "@/libs/runtime";

export const dynamic = "force-dynamic";

/** GET a session’s messages (replay) · DELETE. */
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { chatSessions } = await getRuntime();
  const s = chatSessions.get(Number(id));
  if (!s) return Response.json({ code: 404, data: null, msg: "not found" }, { status: 404 });
  return Response.json({ code: 0, data: s, msg: "" });
}
export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { chatSessions } = await getRuntime();
  await chatSessions.remove(Number(id));
  return Response.json({ code: 0, data: null, msg: "" });
}
