/**
 * TP-D2 (D1) — in-process jobId → AbortController registry, shared by both shells.
 * The chat stream runs in the SAME process as the service (web request handler or the
 * Electron main process), so an in-memory map addresses every in-flight job.
 * Cross-process (worker/Redis) cancellation remains a web-deployment concern in
 * packages/tasks and is intentionally NOT part of the desktop surface (Q6).
 */
const g = globalThis as unknown as { __oiaJobControllers?: Map<string, AbortController> };

export function jobControllers(): Map<string, AbortController> {
  g.__oiaJobControllers ??= new Map();
  return g.__oiaJobControllers;
}

export function registerJob(jobId: string, ac: AbortController): void {
  jobControllers().set(jobId, ac);
}

export function releaseJob(jobId: string): void {
  jobControllers().delete(jobId);
}

/** Stop button: kill immediately (no grace window). Returns false for unknown/finished jobs. */
export function cancelJob(jobId: string): boolean {
  const ac = jobControllers().get(jobId);
  if (!ac || ac.signal.aborted) return false;
  ac.abort("stop");
  return true;
}
