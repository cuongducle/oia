import { getRuntime, requireApiKey } from "@/libs/runtime";

export const dynamic = "force-dynamic";

/** GET ?page=&pageSize=&featured= (BR-TPL2) · POST publish (BR-TPL1). */
export async function GET(req: Request) {
  const { templates } = await getRuntime();
  const u = new URL(req.url);
  const featured = u.searchParams.get("featured");
  const r = templates.list({
    page: Number(u.searchParams.get("page") ?? 1),
    pageSize: Number(u.searchParams.get("pageSize") ?? 20),
    featured: featured === null ? undefined : featured === "1" || featured === "true",
  });
  return Response.json({ code: 0, data: r, msg: "" });
}
export async function POST(req: Request) {
  const guard = await requireApiKey(req); if (guard) return guard;
  const body = await req.json().catch(() => ({}));
  const { templates } = await getRuntime();
  try {
    const tpl = await templates.publish({ name: String(body?.name ?? ""), authorName: body?.authorName, scene: body?.scene, featured: Boolean(body?.featured) });
    return Response.json({ code: 0, data: tpl, msg: "" });
  } catch (err) {
    return Response.json({ code: 1, data: null, msg: String(err) }, { status: 400 });
  }
}
