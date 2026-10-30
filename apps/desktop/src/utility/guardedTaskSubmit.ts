import { randomUUID } from "node:crypto";
import type { ServiceContext } from "@oia/services";
import { isMeteredBusy, releaseMeteredJob, trackMeteredJob } from "@oia/services";
import type { TaskType } from "@oia/schema";
import type { AgentJobFrame } from "../shared/bridge.js";

/**
 * G3 (reorg step 4c) — the ONE metered-task submit wrapper, shared by the loopback
 * agent API and the renderer IPC task lane (quick tools). Extracted from loopback.ts
 * so both lanes keep IDENTICAL semantics instead of drifting copies:
 *
 * - reserve the single shared metered slot SYNCHRONOUSLY, immediately before submit —
 *   no await may sit between the busy check and the reservation (the TOCTOU defect the
 *   T1-guard fix repaired: concurrent submits each passed the check before any tracked);
 * - release EXACTLY ONCE — onSettled (the precise signal; runToCompletion never
 *   rejects) or the fallback TTL for a handler wedged past every provider timeout;
 *   sync-mode (noWait:true) submits arm no timer — the settle inside submit already
 *   released the slot, and a late fallback fired a spurious "failed" after a success;
 * - a submit that itself throws (validation) must not leak the reservation.
 *
 * The guard set is process-global (meteredGuard.ts, globalThis), so a chat job, an
 * agent task and a quick-tools task all contend on the SAME slot — quota is money.
 */

export interface GuardedJobEvent extends AgentJobFrame {
  /** Tagged by the LANE that emitted it (loopback "agent" / quick tools "tool"). */
  lane: "agent" | "tool";
}

export interface GuardedSubmitterDeps {
  ctx: () => ServiceContext;
  /** The lane this submitter serves — tagged on every emitted frame. */
  lane: "agent" | "tool";
  onJobEvent: (ev: GuardedJobEvent) => void;
  /** Fallback ONLY; gates inject ms so the wedged path is observable in tests. */
  fallbackTtlMs?: number;
  /** Opaque reservation-id prefix (log readability; uniqueness comes from the uuid). */
  idPrefix?: string;
  /** Which lane the record is attributed to ("web" quick tools / "agent" loopback). */
  source: "web" | "agent";
}

export interface GuardedSubmitter {
  /** Resolves with the submit snapshot (background) or the final record (noWait:true).
   *  Rejects with MeteredBusyError when the shared slot is held, or the store's own
   *  validation error — both leave the guard untouched. */
  submit(type: TaskType, body: Record<string, unknown>): Promise<{ taskId: string; progress: string }>;
  /** Clear armed fallback timers (server close / lane shutdown). */
  dispose(): void;
}

/** Stable wire name — the renderer maps it like a rate-limited chat refusal.
 *  Message is the loopback's exact 429 text: skills/agents may match on it. */
export class MeteredBusyError extends Error {
  constructor() {
    super("a generation is already running (chat or agent); poll and retry");
    this.name = "MeteredBusyError";
  }
}

export function createGuardedSubmitter(deps: GuardedSubmitterDeps): GuardedSubmitter {
  const armedFallbacks = new Set<ReturnType<typeof setTimeout>>();
  const metered = () => !deps.ctx().chat.image.capabilities.isMock;
  /** Events are observability, NEVER accounting: an emitting sink that throws must
   *  not reach the release logic below (a swallowed emit beats a wrongly freed slot
   *  while a metered task still runs — quota is money). */
  const emitSafe = (event: GuardedJobEvent["event"], taskId: string, type: TaskType): void => {
    try {
      deps.onJobEvent({ taskId, event, taskType: type, lane: deps.lane });
    } catch {
      /* observation only */
    }
  };

  return {
    submit(type, body) {
      const guardId = `${deps.idPrefix ?? "agent"}-${randomUUID()}`;
      if (metered()) {
        if (isMeteredBusy()) return Promise.reject(new MeteredBusyError());
        trackMeteredJob(guardId);
      }

      let settled = false;
      let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
      /** Exactly-once: onSettled (either mode) and the fallback TTL race for the
       *  same release — the flag also prevents the sync-mode double event. */
      const settle = (taskId: string, ok: boolean): void => {
        if (settled) return;
        settled = true;
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
          armedFallbacks.delete(fallbackTimer);
        }
        releaseMeteredJob(guardId);
        emitSafe(ok ? "succeeded" : "failed", taskId, type);
      };

      return deps
        .ctx()
        .taskStore.submit(type, body, {
          sessionId: typeof body.sessionId === "number" ? body.sessionId : undefined,
          noWait: body.noWait === true,
          source: deps.source,
          onSettled: (final) => settle(final.taskId, final.progress === "succeeded"),
        })
        .then((t) => {
          emitSafe("submitted", t.taskId, type);
          // fallback ONLY (background mode — sync mode has already settled inside
          // submit): a handler wedged past every provider timeout must not pin the
          // guard forever. Arms nothing when settled: no pin, no spurious "failed".
          if (!settled) {
            fallbackTimer = setTimeout(() => settle(t.taskId, false), deps.fallbackTtlMs ?? 15 * 60_000);
            armedFallbacks.add(fallbackTimer);
          }
          return { taskId: t.taskId, progress: t.progress };
        })
        .catch((err: unknown) => {
          releaseMeteredJob(guardId); // submit itself failed — the reservation must not leak
          throw err;
        });
    },

    dispose() {
      for (const t of armedFallbacks) clearTimeout(t);
      armedFallbacks.clear();
    },
  };
}
