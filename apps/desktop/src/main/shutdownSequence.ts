/**
 * TP-D5 / bug-repro 2026-10-30 #3: the app-quit sequence, extracted as a seam
 * so the gate can pin the ORDER and the BOUND without booting Electron.
 *
 * In-flight generations get ONE honest chance to die before the kill:
 * cancelAll aborts the controllers → CliRuntime kills the detached codex
 * trees. Fire-and-forget here would race SIGTERM and could orphan a
 * quota-burning child (the regression this exists to catch). The wait is
 * BOUNDED so quit can never hang; a failing cancel must not block the kill.
 */
export async function shutdownSequence(deps: {
  cancelAll: () => Promise<unknown>;
  kill: () => void;
  exit: () => void;
  /** Default 3000 ms, overridable only so the gate can keep fake timers fast. */
  boundMs?: number;
}): Promise<void> {
  await Promise.race([
    deps.cancelAll().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, deps.boundMs ?? 3000)),
  ]);
  deps.kill();
  deps.exit();
}
