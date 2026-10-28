import { getRuntime } from "@/libs/runtime";

export const dynamic = "force-dynamic";

/** GET recent | POST create (blank or from a scene — "Edit as project"). */
export async function GET() {
  const { projects } = await getRuntime();
  return Response.json({ code: 0, data: projects.recent(20), msg: "" });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { projects } = await getRuntime();
  try {
    const p = await projects.create({ name: body?.name, scene: body?.scene, pages: body?.pages, width: body?.width, height: body?.height });
    return Response.json({ code: 0, data: p, msg: "" });
  } catch {
    return Response.json({ code: 1, data: null, msg: "Invalid project. Provide at least one valid page." }, { status: 400 });
  }
}
