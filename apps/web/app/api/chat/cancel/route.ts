import { cancelJob } from "@/libs/job-controllers";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/cancel {jobId} — the Stop button (TP.5): kills the job immediately
 * (no grace window). The CLI process tree dies via the shared AbortController; the SSE
 * stream then delivers the terminal `cancelled` event (the stream itself stays open —
 * only the generation is stopped).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  if (!jobId) {
    return Response.json({ code: 1, data: null, msg: "jobId is required" }, { status: 400 });
  }
  const cancelled = cancelJob(jobId);
  return Response.json({ code: 0, data: { jobId, cancelled }, msg: "" });
}
