import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runDesignerAgent } from "@oia/agent";
import { nextMsgId, planPageSchema, AUTO_REFINE_MAX_ROUNDS_CAP, AUTO_REFINE_MAX_ROUNDS_DEFAULT, type ChatEvent, type PlannerPlan, stylePresetIdSchema } from "@oia/schema";
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
  pages: z.number().int().positive().max(9).optional(),
  outlineMode: z.boolean().optional(),
  /** C1 outline gate phase 1 — stop after the outline (docs/designs/outline-gate.md). */
  outlineGate: z.boolean().optional(),
  /** C1 phase 2 — the user-approved page outline; count is a hard contract.
   * planPageSchema imported (not hand-inlined): the wire shape IS the plan shape —
   * a hand mirror here was the exact anti-pattern the A1 teardown killed. Cap 9 =
   * the composer's ceiling; >9 must fail at the BOUNDARY with a clear 400, not
   * deep inside the planner as a confusing plan_parse_failed. */
  approvedOutline: z.array(planPageSchema).max(9).optional(),
  skill: z.string().optional(),
  mode: z.enum(["clean-plate"]).optional(),
  /** DA-1 — run the planner turn with live web search (capability-gated in the
   * agent: providers without webSearch generate from the prompt alone). */
  research: z.boolean().optional(),
  style: stylePresetIdSchema.optional(),
  /** DA-3/DA-4 — Auto refine: after each image, a critic read checks it and a
   * failed check re-generates. `true` = the default round count; an explicit
   * rounds object is capped at the schema boundary (never deep inside the loop). */
  selfImprove: z
    .union([
      z.boolean(),
      z.object({
        rounds: z
          .number()
          .int()
          .min(0)
          .max(AUTO_REFINE_MAX_ROUNDS_CAP, { message: `auto refine rounds are capped at ${AUTO_REFINE_MAX_ROUNDS_CAP}` }),
      }),
    ])
    .optional(),
  /** A3-lite structured edit intent (2026-11-02): referenceImages[0] is the edit
   *  target. The AGENT layer appends the deterministic clauses (target
   *  declaration, dimension lock, lettering ban when the page overlays text
   *  layers) — the renderer never welds English prose into the prompt string. */
  editMode: z.object({ targetName: z.string().max(120).optional(), textLayerOverlays: z.boolean().optional() }).optional(),
  retryOf: z.string().optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** DA-4 — normalize the wire forms to the round count the designer consumes:
 * undefined/false → null (off); true → the default; {rounds} → itself. */
export function selfImproveRounds(v: ChatRequest["selfImprove"]): number | null {
  if (v === undefined || v === false) return null;
  if (v === true) return AUTO_REFINE_MAX_ROUNDS_DEFAULT;
  return v.rounds;
}

/** Distinguishes the refusal flavors without event sniffing. `outline` = C1 phase 1
 *  completed: the deck outline is ready for review, zero images generated. */
export type ChatOutcome = "completed" | "failed" | "cancelled" | "refused-rate-limited" | "refused-unavailable" | "outline";

/** In-process references: `/api/files/<key>` (web-era canonical URL) and legacy
 *  `oia://files/<key>` resolve to the LOCAL FILE PATH through the FileStore —
 *  providers accept absolute paths directly, so no base64 round-trip of
 *  multi-megabyte assets. Unresolvable keys fail with the KEY named, never a
 *  leaked absolute path. */
async function materializeLocalRefs(urls: string[] | undefined, files: FileStore): Promise<string[] | undefined> {
  if (!urls?.length) return undefined;
  const out: string[] = [];
  for (const u of urls) {
    const key = /^\/api\/files\/(.+)$/.exec(u)?.[1] ?? /^oia:\/\/files\/(.+)$/.exec(u)?.[1];
    if (key) {
      const p = await files.pathOf(key);
      if (!p) throw new Error(`reference asset not found: ${key}`);
      out.push(p);
    } else {
      out.push(u);
    }
  }
  return out;
}

export interface RunChatOptions {
  /** Cooperative cancellation wired by the shell (Stop button, disconnect grace, window close). */
  signal?: AbortSignal;
  sink: (ev: ChatEvent) => void | Promise<void>;
}

const BUDGET_MS = 480_000;
/** DA budget decision (owner teardown fix, 2026-11-06): refine multiplies the
 * worst case per page (~75s/image + ~20s/critic read + ~15s/refine turn, from
 * the REAL_SMOKE 221s/2-round datapoint). The safety cap therefore SCALES with
 * pages × rounds instead of aborting mid-deck at a flat 480s — a budget abort
 * mid-deck keeps the best pages but still kills the paid ones still queued. */
export const REFINE_BUDGET_PER_PAGE_ROUND_MS = 150_000;

/** The job budget as a PURE function of the request (greppable, test-pinned).
 * No refine → the flat 480s. Refine → 480s + pages × rounds × 150s. */
export function chatBudgetMs(req: ChatRequest): number {
  const rounds = selfImproveRounds(req.selfImprove) ?? 0;
  if (rounds <= 0) return BUDGET_MS;
  const pages = Math.max(1, Math.min(9, req.approvedOutline?.length ?? req.pages ?? 1));
  return BUDGET_MS + pages * rounds * REFINE_BUDGET_PER_PAGE_ROUND_MS;
}

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

/** The return adds `sessionId` (A1 preview-apply, VA-9): the editor dock pins its
 * conversation so variants + the A5 plan stash attach to ONE session across edits.
 * Exported — the IPC bridge types its return from HERE, not from a hand mirror. */
export interface ChatRunResult {
  jobId: string;
  outcome: ChatOutcome;
  sessionId: number;
}

export async function runChat(req: ChatRequest, ctx: ServiceContext, opts: RunChatOptions): Promise<ChatRunResult> {
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
    return { jobId, outcome: "refused-rate-limited", sessionId: session.id };
  }
  if (metered) meteredBusy().add(jobId);

  // ---- TP.5: internal budget + caller signal compose into one abort source ----
  const ac = new AbortController();
  const onExternalAbort = () => ac.abort("external");
  opts.signal?.addEventListener("abort", onExternalAbort, { once: true });
  const budget = setTimeout(() => ac.abort("budget"), chatBudgetMs(req));
  registerJob(jobId, ac);

  let lastEvent: ChatEvent | null = null;
  let lastCanvas: unknown = null;
  let outlineEmitted = false; // C1: outcome "outline" is decided by THIS flag, never by content sniffing
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
        return { jobId, outcome, sessionId: session.id };
      }
    }

    // A5: a cached plan skips the planner stage entirely
    const reusePlan = typeof req.retryOf === "string" ? sessionPlans().get(session.id) : undefined;
    // DA-3: normalize the wire forms ONCE (teardown #14 — the double call read
    // as two sources of truth for the same decision)
    const refineRounds = selfImproveRounds(req.selfImprove);

    // Desktop wire reality: the renderer canonicalizes canvas assets as `/api/files/<key>`
    // (legacy `oia://files/<key>`) — there is no HTTP server in-process, so a provider
    // bridge would treat that relative URL as a file path and the job dies at Painting
    // (live repro 2026-11-02: A1 variant edit on a real codex pair, "unknown reason").
    // Materialize local refs into data URLs via the same FileStore assetizeEvent uses.
    const referenceImages = await materializeLocalRefs(req.referenceImages, ctx.files);

    for await (const event of runDesignerAgent(
      {
        prompt: req.prompt, jobId, width: req.width, height: req.height,
        brandGuidance: kit?.guidance, brandId: kit ? 1 : 0,
        referenceImages,
        pages: req.pages,
        outlineMode: req.outlineMode,
        outlineGate: req.outlineGate,
        approvedOutline: req.approvedOutline,
        skill: req.skill,
        mode: req.mode,
        editMode: req.editMode,
        research: req.research,
        ...(req.style ? { style: req.style } : {}),
        ...(refineRounds !== null ? { selfImprove: { rounds: refineRounds } } : {}),
        signal: ac.signal,
        ...(reusePlan ? { reusePlan } : {}),
        onPlan: (plan) => sessionPlans().set(session.id, plan),
      },
      { llm: ctx.chat.llm, image: ctx.chat.image },
    )) {
      await assetizeEvent(event, ctx.files); // A1: no base64 on any wire
      lastEvent = event;
      if (event.renderData?.outline?.length) outlineEmitted = true;
      for (const m of event.renderData?.msgMeta ?? []) if (m.type === "canvas") lastCanvas = m.canvas;
      await send(event);
    }
    if (ac.signal.aborted) {
      terminalCancelled();
      outcome = "cancelled";
    } else if (req.outlineGate && outlineEmitted) {
      outcome = "outline"; // C1 phase 1 landed — the UI shows the outline card
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
  return { jobId, outcome, sessionId: session.id };
}
