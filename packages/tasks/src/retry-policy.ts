import type { TaskType } from "@oia/schema";

/**
 * TP.4 (Slice 1) — per-task-class retry policy. Today one global policy (attempts: 3
 * with backoff) re-runs PAID Codex generations up to 3×, invisibly. The policy becomes
 * per class: metered generation (Codex-plan quota or API-key billing) is NON-RETRYABLE —
 * a user-initiated retry starts a new job linked with retryOf. Only explicitly
 * classified transient errors may opt in later.
 */

export interface RetryPolicy {
  attempts: number;
  backoff?: { type: "exponential"; delay: number };
}

/** Task classes that spend metered generation (image providers) — exactly one attempt. */
export const METERED_TASK_TYPES: ReadonlySet<TaskType> = new Set<TaskType>([
  "image-edit",
  "generate-presentation",
  "generate-poster",
  "generate-xhs-images",
  "generate-illustrations",
  "generate-logo",
  "generate-storyboard",
  "generate-photo-poetic-editorial",
  "generate-restaged-cinematic",
]);

/** Non-metered classes (local processing: rembg, pptx pipelines) keep the old resilience. */
const DEFAULT_POLICY: RetryPolicy = { attempts: 3, backoff: { type: "exponential", delay: 3000 } };
const METERED_POLICY: RetryPolicy = { attempts: 1 };

/** The single policy object shared by both backends (in-process runs are once-only by construction). */
export function retryPolicyFor(type: TaskType): RetryPolicy {
  return METERED_TASK_TYPES.has(type) ? METERED_POLICY : DEFAULT_POLICY;
}

export function isMeteredTaskType(type: TaskType): boolean {
  return METERED_TASK_TYPES.has(type);
}
