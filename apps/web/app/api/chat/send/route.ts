import { randomUUID } from "node:crypto";
import { runDesignerAgent } from "@oia/agent";
import type { PlannerPlan, ChatEvent } from "@oia/schema";
import { nextMsgId } from "@oia/schema";
import { migrateSrc, migrateScene, type FileStore } from "@oia/tasks";
import { getRuntime } from "@/libs/runtime";
import { registerJob, releaseJob } from "@/libs/job-controllers";

export const dynamic = "force-dynamic";
/**
 * TP.5 budget (owner, 2026-10-29): pre-flight ≤10s + planner ≤120s + image ≤300s + 30s margin
 * = 480s total, enforced by the internal AbortController — `maxDuration` is only an advisory
 * hint on self-hosted `next start`; internal enforcement is the real budget.
 */
export const maxDuration = 480;

const BUDGET_MS = 480_000;
const DISCONNECT_GRACE_MS = 10_000; // accidental tab close: ~10s grace, then kill

/** A1: the SSE wire never carries base64 artwork — bytes land in the asset store once
 *  (md5-deduped with the thumbnail), events reference /api/files/<key>. */
async function assetizeEvent(ev: ChatEvent, files: FileStore): Promise<void> {
  for (const meta of ev.renderData.msgMeta ?? []) {
    if (typeof meta.thumbnail === "string" && meta.thumbnail.startsWith("data:")) {
      meta.thumbnail = (await migrateSrc(meta.thumbnail, files)) as string;
    }
    if (meta.canvas) await migrateScene(meta.canvas, files);
  }
}

/** G3: max ONE metered job in flight per app instance; a second is refused rate_limited. */
const gGuard = globalThis as unknown as { __oiaMeteredInFlight?: Set<string> };
function meteredBusy(): Set<string> {
  gGuard.__oiaMeteredInFlight ??= new Set();
  return gGuard.__oiaMeteredInFlight;
}

/** TP.4 stage-aware retry: the last successful plan per chat session, so a retry that
 *  only needs the image stage never spends a second planner turn. */
const gPlans = globalThis as unknown as { __oiaSessionPlans?: Map<number, PlannerPlan> };
function sessionPlans(): Map<number, PlannerPlan> {
  gPlans.__oiaSessionPlans ??= new Map();
  return gPlans.__oiaSessionPlans;
}

/**
 * POST /api/chat/send → SSE stream.
 * Body: { prompt: string, width?, height?, retryOf?: string }
 *
 * Stage 0 (Slices 2–5 + remediation):
 * - TP.6 pre-flight: availability probe BEFORE any metered attempt (cached ~60s inside the provider)
 * - TP.5 cancellation: Stop (POST /api/chat/cancel) kills immediately; disconnect gets a grace
 *   window; both terminate the CLI process tree via the shared AbortController and emit the
 *   terminal `cancelled` event (afterCompletion when artwork had already been produced)
 * - G3: one metered job at a time — the second gets rate_limited with zero attempts spent
 * - jobId correlation: pre-generated here; threaded into designer events, providers, transcripts
 * - A1: events are assetized before enqueue — no base64 blobs on the wire
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
  const { chatSessions, chat, files } = await getRuntime();
  const session = body?.sessionId ? (chatSessions.get(Number(body.sessionId)) ?? chatSessions.create()) : chatSessions.create();

  const jobId = randomUUID();
  const ac = new AbortController();
  registerJob(jobId, ac);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastEvent: unknown = null;
      let lastCanvas: unknown = null; // the latest canvas across the whole stream (the last event is the empty </Content>)
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data:${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true; // client gone — keep killing the process tree regardless
        }
      };
      const heartbeat = setInterval(() => send("[Heartbeat]"), 8000);
      const baseRender = { msgMeta: [], fileMeta: [], taskMeta: [], exportMeta: null } as const;

      const failEvent = (opts: { errorClass: string; provider?: string; message: string; attemptNumber: number }) =>
        send({
          msgId: nextMsgId(), content: "", status: 1, error: opts.message, jobId,
          errorClass: opts.errorClass, attemptNumber: opts.attemptNumber, provider: opts.provider,
          renderData: baseRender, brandId: kit ? 1 : 0,
        });

      // ---- G3: refuse a concurrent metered job with zero attempts spent ----
      const metered = !chat.image.capabilities.isMock;
      if (metered && meteredBusy().size > 0) {
        releaseJob(jobId);
        clearInterval(heartbeat);
        failEvent({ errorClass: "rate_limited", provider: chat.image.name, message: "a generation is already running", attemptNumber: 0 });
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
        return;
      }
      if (metered) meteredBusy().add(jobId);

      // TP.5 internal budget — a killed stream behaves exactly like a user cancel
      const budget = setTimeout(() => ac.abort("budget"), BUDGET_MS);
      // disconnect: grace window for accidental tab/window close, then kill
      let graceTimer: ReturnType<typeof setTimeout> | null = null;
      const onDisconnect = () => {
        graceTimer = setTimeout(() => ac.abort("disconnect"), DISCONNECT_GRACE_MS);
      };
      req.signal.addEventListener("abort", onDisconnect, { once: true });

      const cleanup = () => {
        clearInterval(heartbeat);
        clearTimeout(budget);
        if (graceTimer) clearTimeout(graceTimer);
        req.signal.removeEventListener("abort", onDisconnect);
        releaseJob(jobId);
        meteredBusy().delete(jobId);
      };
      const terminalCancelled = () => {
        // job outcome flag, not an error class: artwork already produced ⇒ quota already spent
        send({ msgId: nextMsgId(), content: "", status: "cancelled", error: "", jobId, afterCompletion: Boolean(lastCanvas), renderData: baseRender, brandId: kit ? 1 : 0 });
      };

      try {
        // ---- TP.6 pre-flight: zero metered attempts on a doomed job ----
        // B4: each diagnostic is attributed to ITS provider — never a hardcoded name
        const probes = [
          { name: chat.image.name, diag: await chat.image.isAvailable() },
          { name: chat.llm.name, diag: await chat.llm.isAvailable() },
        ];
        for (const { name, diag } of probes) {
          if (!diag.ok) {
            failEvent({
              errorClass: diag.errorClass ?? "provider_missing",
              provider: name,
              message: diag.detail ?? "provider unavailable",
              attemptNumber: 0,
            });
            return;
          }
        }

        // TP.4 stage-aware retry: a cached plan skips the planner stage entirely
        const reusePlan = typeof body?.retryOf === "string" ? sessionPlans().get(session.id) : undefined;

        for await (const event of runDesignerAgent(
          {
            prompt, jobId, width: body?.width, height: body?.height,
            brandGuidance: kit?.guidance, brandId: kit ? 1 : 0,
            referenceImages: Array.isArray(body?.referenceImages) ? body.referenceImages : undefined,
            pages: body?.pages !== undefined ? Number(body.pages) : undefined,
            outlineMode: body?.outlineMode === true ? true : undefined,
            skill: typeof body?.skill === "string" ? body.skill : undefined,
            mode: body?.mode === "clean-plate" ? "clean-plate" : undefined,
            signal: ac.signal,
            ...(reusePlan ? { reusePlan } : {}),
            onPlan: (plan) => sessionPlans().set(session.id, plan),
          },
          { llm: chat.llm, image: chat.image },
        )) {
          // A1: base64 → asset refs BEFORE the wire; dedupe makes artwork+thumbnail one file
          await assetizeEvent(event, files);
          lastEvent = event;
          for (const m of event.renderData?.msgMeta ?? []) if (m.type === "canvas") lastCanvas = m.canvas;
          send(event);
        }
        // TP.5: silent designer stop after an abort ⇒ the terminal cancelled event
        if (ac.signal.aborted) terminalCancelled();
      } catch (err) {
        if (ac.signal.aborted) {
          terminalCancelled();
        } else {
          send({
            msgId: nextMsgId(), content: "", status: 1, jobId,
            error: err instanceof Error ? err.message : "agent failed",
            renderData: baseRender,
            brandId: 0,
          });
        }
      } finally {
        cleanup();
        // BR-PERSIST: store the user→assistant pair (latest canvas attached for replay)
        // attach the latest canvas to the final event for replay (append() looks for a canvas in renderData)
        const finalEvent = lastEvent as { renderData?: { msgMeta?: unknown[] } } | null;
        if (finalEvent?.renderData && lastCanvas) {
          finalEvent.renderData.msgMeta = [{ type: "canvas", id: "final", canvas: lastCanvas }];
        }
        // TP.7: session persistence is awaited before the stream closes — replay-after-end
        // can never race the write; failures are logged with the jobId, never silent
        try {
          await chatSessions.append(session.id, prompt, {
            content: String((lastEvent as { content?: string } | null)?.content ?? ""),
            renderData: finalEvent?.renderData,
          });
        } catch (err) {
          console.error(`[chat] session persistence failed jobId=${jobId} session=${session.id}`, err);
        }
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
