import type { ChatEvent } from "@oia/schema";
import { runChat, type ChatRequest } from "@oia/services";
import { getRuntime } from "@/libs/runtime";

export const dynamic = "force-dynamic";
/**
 * TP.5 budget lives INSIDE the service (same on desktop); `maxDuration` is only an
 * advisory hint on self-hosted `next start`.
 */
export const maxDuration = 480;

const DISCONNECT_GRACE_MS = 10_000; // accidental tab close: ~10s grace, then kill

/**
 * POST /api/chat/send → SSE stream.
 * Body: ChatRequest ({ prompt, width?, height?, retryOf?, … })
 *
 * Stage 0 / D1: this route is a THIN ADAPTER (TP-D2) — transport only (HTTP parse,
 * SSE frames, heartbeat, disconnect grace). Orchestration lives in @oia/services
 * runChat: pre-flight, G3 guard, budget, assetization, retry-plan reuse, terminal
 * cancelled, session persistence. The desktop shell will be an IPC adapter over
 * the same function.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const prompt = String(body?.prompt ?? "").trim();
  if (!prompt) {
    return new Response(JSON.stringify({ code: 1, msg: "prompt is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const rt = await getRuntime();
  const chatReq: ChatRequest = {
    prompt,
    ...(body?.width !== undefined ? { width: Number(body.width) } : {}),
    ...(body?.height !== undefined ? { height: Number(body.height) } : {}),
    ...(body?.sessionId !== undefined ? { sessionId: Number(body.sessionId) } : {}),
    ...(typeof body?.brandKitId === "string" ? { brandKitId: body.brandKitId } : {}),
    ...(Array.isArray(body?.referenceImages) ? { referenceImages: body.referenceImages as string[] } : {}),
    ...(body?.pages !== undefined ? { pages: Number(body.pages) } : {}),
    ...(body?.outlineMode === true ? { outlineMode: true } : {}),
    ...(typeof body?.skill === "string" ? { skill: body.skill } : {}),
    ...(body?.mode === "clean-plate" ? { mode: "clean-plate" as const } : {}),
    ...(typeof body?.retryOf === "string" ? { retryOf: body.retryOf } : {}),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data:${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true; // client gone — the service keeps killing the process tree
        }
      };
      const heartbeat = setInterval(() => send("[Heartbeat]"), 8000);

      // disconnect: grace window for accidental tab/window close, then kill (TP.5)
      const grace = new AbortController();
      let graceTimer: ReturnType<typeof setTimeout> | null = null;
      const onDisconnect = () => {
        graceTimer = setTimeout(() => grace.abort("disconnect"), DISCONNECT_GRACE_MS);
      };
      req.signal.addEventListener("abort", onDisconnect, { once: true });

      try {
        await runChat(chatReq, rt, {
          signal: grace.signal,
          sink: (ev: ChatEvent) => send(ev),
        });
      } finally {
        clearInterval(heartbeat);
        if (graceTimer) clearTimeout(graceTimer);
        req.signal.removeEventListener("abort", onDisconnect);
        if (!closed) {
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
