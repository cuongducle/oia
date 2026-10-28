import { NextResponse } from "next/server";

/** M0: in-process sessionId store. TODO: postgres chat_sessions. */
const sessions = new Map<number, { name?: string; createdAt: number }>();

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = Date.now();
  sessions.set(id, { name: body?.name, createdAt: Date.now() });
  return NextResponse.json({ code: 0, data: { sessionId: id }, msg: "" });
}

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("sessionId"));
  return NextResponse.json({ code: 0, data: sessions.get(id) ?? null, msg: "" });
}
