/**
 * B7 (records must not lie) — write-side health for the file-backed stores.
 *
 * atomicWriteJson is the single funnel for every store save; on failure it
 * records the file here (error, errno, count, timestamps) and on success it
 * clears the entry — so the health surface always answers "which stores are
 * CURRENTLY failing to persist", not "which stores ever failed".
 *
 * Before this, a full disk or a locked directory made `void this.save()`
 * vanish the failure silently: the in-memory record claimed to be saved while
 * disk never saw it, and the loss only surfaced after the next restart.
 */

export interface StoreWriteFailure {
  file: string;
  error: string;
  code: string | null;
  failedWrites: number;
  firstFailedAt: number;
  lastFailedAt: number;
}

const failures = new Map<string, StoreWriteFailure>();

export function noteWriteFailure(file: string, err: unknown): void {
  const now = Date.now();
  const e = err instanceof Error ? err : new Error(String(err));
  const prev = failures.get(file);
  const entry: StoreWriteFailure = {
    file,
    error: e.message,
    code: (e as NodeJS.ErrnoException).code ?? null,
    failedWrites: (prev?.failedWrites ?? 0) + 1,
    firstFailedAt: prev?.firstFailedAt ?? now,
    lastFailedAt: now,
  };
  failures.set(file, entry);
  console.error(
    `[persist] WRITE FAILED ${file} (${entry.code ?? "?"}) attempt #${entry.failedWrites}: ${e.message} — ` +
      "memory is AHEAD of disk: changes since the last good save are at risk until a write succeeds",
  );
}

export function noteWriteSuccess(file: string): void {
  failures.delete(file);
}

/** Files whose LAST write attempt failed (empty = everything is durable). */
export function persistenceWriteFailures(): StoreWriteFailure[] {
  return [...failures.values()];
}
