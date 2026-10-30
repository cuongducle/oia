/**
 * G3 — the ONE metered-job guard, shared by chat (runChat) and the task lane
 * (loopback agent submissions). It used to live as two independent counters:
 * chat's global set and loopback's module-local `agentInFlight`. Two guards
 * that don't see each other meant a chat job + an agent task could run TWO
 * paid codex generations at once (quota is money — hard rule 6).
 *
 * Same globalThis key as before (`__oiaMeteredInFlight`) so the set stays
 * process-wide even if this module is loaded twice.
 */
const g = globalThis as unknown as { __oiaMeteredInFlight?: Set<string> };

function busy(): Set<string> {
  g.__oiaMeteredInFlight ??= new Set();
  return g.__oiaMeteredInFlight;
}

/** The live set — for callers that add/release their own job id (chat cleanup). */
export function meteredBusy(): Set<string> {
  return busy();
}

/** Read-only view for guards deciding whether to admit a new metered job. */
export function isMeteredBusy(): boolean {
  return busy().size > 0;
}

/** Admit a job under its own id (task ids and chat job ids share the space). */
export function trackMeteredJob(id: string): void {
  busy().add(id);
}

/** Release exactly this job — idempotent, a fallback timer racing settle() is safe. */
export function releaseMeteredJob(id: string): void {
  busy().delete(id);
}
