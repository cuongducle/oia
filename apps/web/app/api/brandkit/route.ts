import { getRuntime, requireApiKey } from "@/libs/runtime";

export const dynamic = "force-dynamic";

/** GET list · POST upsert (validate BR-BK) · DELETE?id= */
export async function GET(req: Request) {
  const guard = await requireApiKey(req); if (guard) return guard;
  const { brandKits } = await getRuntime();
  return Response.json({ code: 0, data: brandKits.list(), msg: "" });
}
export async function POST(req: Request) {
  const guard = await requireApiKey(req); if (guard) return guard;
  const body = await req.json().catch(() => ({}));
  const { brandKits } = await getRuntime();
  try {
    return Response.json({ code: 0, data: await brandKits.upsert(body), msg: "" });
  } catch (err) {
    return Response.json({ code: 1, data: null, msg: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
export async function DELETE(req: Request) {
  const guard = await requireApiKey(req); if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const { brandKits } = await getRuntime();
  const ok = await brandKits.remove(id);
  return Response.json({ code: ok ? 0 : 1, data: null, msg: ok ? "" : "not found" }, { status: ok ? 200 : 404 });
}
