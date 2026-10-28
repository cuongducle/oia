import { getRuntime } from "@/libs/runtime";

// NOTE: requireApiKey is intentionally NOT applied here — this bootstraps the FIRST key
// (the guard is for resource endpoints: tasks/upload/brandkit/templates).

export const dynamic = "force-dynamic";

export async function GET() {
  const { keys } = await getRuntime();
  return Response.json({ code: 0, data: keys.list(), msg: "" });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { keys } = await getRuntime();
  const { record, plaintext } = await keys.create(String(body?.name ?? ""), body?.ttlDays ?? null);
  return Response.json({ code: 0, data: { record, plaintext }, msg: "" });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const { keys } = await getRuntime();
  const ok = await keys.revoke(id);
  return Response.json({ code: ok ? 0 : 1, data: null, msg: "" }, { status: ok ? 200 : 404 });
}
