/**
 * TP.5 (Slice 2) — in-process jobId → AbortController registry.
 * The chat SSE path always runs in the web process (with or without REDIS_URL), so an
 * in-memory map addresses every in-flight chat job; worker-queue cancellation via Redis
 * pub/sub lands in Slice 4 with the worker-side consumption.
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
