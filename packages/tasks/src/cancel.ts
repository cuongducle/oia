/**
 * TP.5 (reorg step 3) — the in-process cancel registry.
 *
 * Cancellation is now purely in-process (the BullMQ worker deployment is gone with
 * the web sunset): every job registers its AbortController here, and cancel(taskId)
 * aborts it locally. Kept as its own module because the web chat path, the task
 * API, and the Electron main process all share this registry shape.
 */

/** Per-process jobId → AbortController registry (same shape as the web chat registry). */
const g = globalThis as unknown as { __oiaTaskControllers?: Map<string, AbortController> };

export function localControllers(): Map<string, AbortController> {
  g.__oiaTaskControllers ??= new Map();
  return g.__oiaTaskControllers;
}

export function registerCancelable(jobId: string, ac: AbortController): void {
  localControllers().set(jobId, ac);
}

export function releaseCancelable(jobId: string): void {
  localControllers().delete(jobId);
}

/** Abort a job in THIS process. Returns false for unknown/finished jobs (idempotent). */
export function abortLocal(jobId: string): boolean {
  const ac = localControllers().get(jobId);
  if (!ac || ac.signal.aborted) return false;
  ac.abort("task-cancel");
  return true;
}
