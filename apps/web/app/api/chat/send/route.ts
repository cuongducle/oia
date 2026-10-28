import { runDesignerAgent } from "@oia/agent";
import { getImageProvider, getLlmProvider } from "@oia/providers";
import { getRuntime } from "@/libs/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/chat/send → SSE stream.
 * Body: { prompt: string, width?, height? }
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

      // BR-BK5: apply the brand kit to this chat (explicit brandKitId or the active kit)
  const { brandKits } = await getRuntime();
  const kit = body?.brandKitId ? brandKits.get(String(body.brandKitId)) : brandKits.active();

      // BR-PERSIST: create or reuse a real session
  const { chatSessions } = await getRuntime();
  const session = body?.sessionId ? (chatSessions.get(Number(body.sessionId)) ?? chatSessions.create()) : chatSessions.create();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastEvent: unknown = null;
    let lastCanvas: unknown = null; // the latest canvas across the whole stream (the last event is an empty </Content>)
      const send = (payload: unknown) =>
        controller.enqueue(
          encoder.encode(`data:${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`),
        );
      const heartbeat = setInterval(() => send("[Heartbeat]"), 8000);
      try {
        for await (const event of runDesignerAgent(
          {
            prompt, width: body?.width, height: body?.height,
            brandGuidance: kit?.guidance, brandId: kit ? 1 : 0,
            referenceImages: Array.isArray(body?.referenceImages) ? body.referenceImages : undefined,
            pages: body?.pages !== undefined ? Number(body.pages) : undefined,
            outlineMode: body?.outlineMode === true ? true : undefined,
            skill: typeof body?.skill === "string" ? body.skill : undefined,
          },
          { llm: getLlmProvider(), image: getImageProvider() },
        )) {
          lastEvent = event;
          for (const m of event.renderData?.msgMeta ?? []) if (m.type === "canvas") lastCanvas = m.canvas;
          send(event);
        }
      } catch (err) {
        send({
          msgId: Date.now(), content: "", status: 1,
          error: err instanceof Error ? err.message : "agent failed",
          renderData: { msgMeta: [], fileMeta: [], taskMeta: [], exportMeta: null },
          brandId: 0,
        });
      } finally {
        clearInterval(heartbeat);
      // BR-PERSIST: store the user→assistant pair (latest canvas attached for replay)
      // attach the latest canvas to the final event for replay (append() looks for a canvas in renderData)
        const finalEvent = lastEvent as { renderData?: { msgMeta?: unknown[] } } | null;
        if (finalEvent?.renderData && lastCanvas) {
          finalEvent.renderData.msgMeta = [{ type: "canvas", id: "final", canvas: lastCanvas }];
        }
        void chatSessions.append(session.id, prompt, {
          content: String((lastEvent as { content?: string } | null)?.content ?? ""),
          renderData: finalEvent?.renderData,
        }).catch(() => {});
        controller.close();
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
