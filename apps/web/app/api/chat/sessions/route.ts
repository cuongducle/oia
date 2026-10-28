import { getRuntime } from "@/libs/runtime";

export const dynamic = "force-dynamic";

/** GET recent chats · POST create a session. */
export async function GET() {
  const { chatSessions } = await getRuntime();
  return Response.json({ code: 0, data: chatSessions.recent(20), msg: "" });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { chatSessions } = await getRuntime();
  const s = chatSessions.create(body?.name);
  return Response.json({ code: 0, data: s, msg: "" });
}
