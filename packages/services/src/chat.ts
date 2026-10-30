import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runDesignerAgent } from "@oia/agent";
import { nextMsgId, type ChatEvent, type PlannerPlan } from "@oia/schema";
import { migrateSrc, migrateScene, type FileStore } from "@oia/tasks";
import type { ServiceContext } from "./context.js";
import { registerJob, releaseJob } from "./cancel.js";
import { isMeteredBusy, meteredBusy } from "./meteredGuard.js";

/**
 * TP-D2 (D1) — the chat orchestration, transport-free. The web SSE route and the future
 * Electron IPC handler are thin adapters over THIS: they parse input, provide a sink,
 * and encode frames; everything below (pre-flight, G3 guard, budget, assetization,
 * stage-aware retry, terminal cancelled, session persistence) lives here exactly once.
 *
 * Carried over verbatim from the Stage-0 web route (slices 2–5 + remediation):
 * - pre-flight probes BEFORE any metered attempt, attributed to the failing provider
 * - G3: one metered job in flight per app instance (mock providers bypass)
 * - 480 s internal budget (pre-flight 10 + planner 120 + image 300 + margin 30)
 * - jobId pre-generated + registered for Stop; AbortSignal threading end to end
 * - A1: events are assetized before the sink — no base64 blobs on any wire
 * - A5: the plan is stashed per session; retryOf reuses it (zero planner turns)
 * - session persistence is awaited before completion so replay can never race
 */

/**
 * The ONE request schema — the web adapter and the desktop IPC both parse raw input
 * through THIS object (no hand-copied mirrors; unknown keys are stripped by zod, so a
 * new field here is the only place to add). Exported for parity tests.
 */
export const chatRequestSchema = z.object({
  prompt: z.string().min(1),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  sessionId: z.number().int().optional(),
  brandKitId: z.string().optional(),
  referenceImages: z.array(z.string()).optional(),
  pages: z.number().int().positive().optional(),
  outlineMode: z.boolean().optional(),
  skill: z.string().optional(),
  mode: z.enum(["clean-plate"]).optional(),
  retryOf: z.string().optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Distinguishes the two refusal flavors without event sniffing. */
export type ChatOutcome = "completed" | "failed" | "cancelled" | "refused-rate-limited" | "refused-unavailable";

export interface RunChatOptions {
  /** Cooperative cancellation wired by the shell (Stop button, disconnect grace, window close). */
  signal?: AbortSignal;
  sink: (ev: ChatEvent) => void | Promise<void>;
}

const BUDGET_MS = 480_000;

/** A1: the sink never receives base64 artwork — bytes land in the asset store once. */
async function assetizeEvent(ev: ChatEvent, files: FileStore): Promise<void> {
  for (const meta of ev.renderData.msgMeta ?? []) {
    if (typeof meta.thumbnail === "string" && meta.thumbnail.startsWith("data:")) {
      meta.thumbnail = (await migrateSrc(meta.thumbnail, files)) as string;
    }
    if (meta.canvas) await migrateScene(meta.canvas, files);
  }
}

/** G3: max ONE metered job in flight per app instance — the set lives in meteredGuard.ts, shared with the task lane (loopback). */

/** A5: last successful plan per chat session (stage-aware retry). */
const gPlans = globalThis as unknown as { __oiaSessionPlans?: Map<number, PlannerPlan> };
function sessionPlans(): Map<number, PlannerPlan> {
  gPlans.__oiaSessionPlans ??= new Map();
  return gPlans.__oiaSessionPlans;
}

export async function runChat(req: ChatRequest, ctx: ServiceContext, opts: RunChatOptions): Promise<{ jobId: string; outcome: ChatOutcome }> {
  const jobId = randomUUID();
  const baseRender = { msgMeta: [], fileMeta: [], taskMeta: [], exportMeta: null, confirmRequest: null };
  const { sink } = opts;

  // BR-BK5 / BR-PERSIST: kit + session resolution (identical to the web route)
  const kit = req.brandKitId ? ctx.brandKits.get(req.brandKitId) : ctx.brandKits.active();
  const session = req.sessionId ? (ctx.chatSessions.get(req.sessionId) ?? ctx.chatSessions.create()) : ctx.chatSessions.create();

  const send = sink;
  const failEvent = (o: { errorClass: string; provider?: string; message: string; attemptNumber: number }) =>
    send({
      msgId: nextMsgId(), content: "", status: 1, error: o.message, jobId,
      errorClass: o.errorClass as ChatEvent["errorClass"], attemptNumber: o.attemptNumber, provider: o.provider,
      renderData: baseRender, brandId: kit ? 1 : 0,
    });

  // ---- G3: refuse a concurrent metered job with zero attempts spent ----
  const metered = !ctx.chat.image.capabilities.isMock;
  if (metered && isMeteredBusy()) {
    failEvent({ errorClass: "rate_limited", provider: ctx.chat.image.name, message: "a generation is already running", attemptNumber: 0 });
    return { jobId, outcome: "refused-rate-limited" };
  }
  if (metered) meteredBusy().add(jobId);

  // ---- TP.5: internal budget + caller signal compose into one abort source ----
  const ac = new AbortController();
  const onExternalAbort = () => ac.abort("external");
  opts.signal?.addEventListener("abort", onExternalAbort, { once: true });
  const budget = setTimeout(() => ac.abort("budget"), BUDGET_MS);
  registerJob(jobId, ac);

  let lastEvent: ChatEvent | null = null;
  let lastCanvas: unknown = null;
  let outcome: ChatOutcome = "completed";
  const cleanup = () => {
    clearTimeout(budget);
    opts.signal?.removeEventListener("abort", onExternalAbort);
    releaseJob(jobId);
    meteredBusy().delete(jobId);
  };
  const terminalCancelled = () => {
    // job outcome flag, not an error class: artwork already produced ⇒ quota already spent
    send({ msgId: nextMsgId(), content: "", status: "cancelled", error: "", jobId, afterCompletion: Boolean(lastCanvas), renderData: baseRender, brandId: kit ? 1 : 0 });
  };

  try {
    // ---- TP.6 pre-flight: zero metered attempts on a doomed job (provider-attributed) ----
    const probes = [
      { name: ctx.chat.image.name, diag: await ctx.chat.image.isAvailable() },
      { name: ctx.chat.llm.name, diag: await ctx.chat.llm.isAvailable() },
    ];
    for (const { name, diag } of probes) {
      if (!diag.ok) {
        failEvent({ errorClass: diag.errorClass ?? "provider_missing", provider: name, message: diag.detail ?? "provider unavailable", attemptNumber: 0 });
        outcome = "refused-unavailable";
        return { jobId, outcome };
      }
    }

    // A5: a cached plan skips the planner stage entirely
    const reusePlan = typeof req.retryOf === "string" ? sessionPlans().get(session.id) : undefined;

    for await (const event of runDesignerAgent(
      {
        prompt: req.prompt, jobId, width: req.width, height: req.height,
        brandGuidance: kit?.guidance, brandId: kit ? 1 : 0,
        referenceImages: req.referenceImages,
        pages: req.pages,
        outlineMode: req.outlineMode,
        skill: req.skill,
        mode: req.mode,
        signal: ac.signal,
        ...(reusePlan ? { reusePlan } : {}),
        onPlan: (plan) => sessionPlans().set(session.id, plan),
      },
      { llm: ctx.chat.llm, image: ctx.chat.image },
    )) {
      await assetizeEvent(event, ctx.files); // A1: no base64 on any wire
      lastEvent = event;
      for (const m of event.renderData?.msgMeta ?? []) if (m.type === "canvas") lastCanvas = m.canvas;
      await send(event);
    }
    if (ac.signal.aborted) {
      terminalCancelled();
      outcome = "cancelled";
    }
  } catch (err) {
    if (ac.signal.aborted) {
      terminalCancelled();
      outcome = "cancelled";
    } else {
      send({
        msgId: nextMsgId(), content: "", status: 1, jobId,
        error: err instanceof Error ? err.message : "agent failed",
        errorClass: "unknown",
        renderData: baseRender,
        brandId: 0,
      });
      outcome = "failed";
    }
  } finally {
    cleanup();
    // BR-PERSIST: replay canvas attached to the final event; append is awaited so
    // replay-after-completion can never race the write; failures log with jobId
    const finalEvent = lastEvent as { renderData?: { msgMeta?: unknown[] } } | null;
    if (finalEvent?.renderData && lastCanvas) {
      finalEvent.renderData.msgMeta = [{ type: "canvas", id: "final", canvas: lastCanvas }];
    }
    try {
      await ctx.chatSessions.append(session.id, req.prompt, {
        content: String(lastEvent?.content ?? ""),
        renderData: finalEvent?.renderData,
      });
    } catch (err) {
      console.error(`[chat] session persistence failed jobId=${jobId} session=${session.id}`, err);
    }
  }
  return { jobId, outcome };
}
