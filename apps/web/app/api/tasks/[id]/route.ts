import { getRuntime, requireApiKey } from "@/libs/runtime";
import { TaskNotFound } from "@pixforge/tasks";
import type { TaskType } from "@pixforge/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One route, two roles:
 * - POST /api/tasks/{type}      → submit a new task
 * - GET  /api/tasks/{taskId}    → poll status (24h TTL → 404)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiKey(req);
  if (guard) return guard;

  const { id: type } = await params;
  const body = await req.json().catch(() => ({}));
  const { taskStore } = await getRuntime();

  try {
    const t = await taskStore.submit(type as TaskType, body, {
      sessionId: body?.sessionId,
      noWait: body?.noWait === undefined ? false : Boolean(body.noWait),
      source: body?.source ?? "web",
    });
    return Response.json({ code: 0, data: t, msg: "" });
  } catch (err) {
    return Response.json(
      { code: 1, data: null, msg: err instanceof Error ? err.message : "submit failed" },
      { status: 400 },
    );
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiKey(req);
  if (guard) return guard;

  const { id: taskId } = await params;
  const { taskStore } = await getRuntime();
  try {
    return Response.json({ code: 0, data: taskStore.get(taskId), msg: "" });
  } catch (err) {
    if (err instanceof TaskNotFound) {
      return Response.json({ code: 404, data: null, msg: "task not found" }, { status: 404 });
    }
    return Response.json({ code: 1, data: null, msg: String(err) }, { status: 500 });
  }
}
