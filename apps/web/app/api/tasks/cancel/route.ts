import { getRuntime, requireApiKey } from "@/libs/runtime";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/cancel {taskId} — TP.5 (Slice 4): cancel a running Task-API job.
 * Local abort first (in-process runs), then the cross-process publish so a
 * worker-process job dies too (Redis pub/sub `oia:cancel:<jobId>`).
 */
export async function POST(req: Request) {
  const guard = await requireApiKey(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const taskId = typeof body?.taskId === "string" ? body.taskId : "";
  if (!taskId) {
    return Response.json({ code: 1, data: null, msg: "taskId is required" }, { status: 400 });
  }
  const { taskStore } = await getRuntime();
  const cancelled = await taskStore.cancel(taskId);
  return Response.json({ code: 0, data: { taskId, cancelled }, msg: "" });
}
