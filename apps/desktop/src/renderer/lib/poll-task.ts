import type { TaskStatus } from "@oia/schema";

/**
 * Shared task poller, was copy-pasted verbatim between Workspace's B1 import
 * and the editor's Make-text-editable (the only two task-lane UIs). One loop,
 * injected clock/sleep so every path is testable without the bridge:
 * poll until terminal (progress !== "processing"), 5-min honest cap,
 * "task vanished" on a null read. Cancellation is the CALLER's concern, per
 * B1 teardown, a Stop does not abandon the poll: a task that succeeded before
 * the cancel landed still owes the seller its result (quota-is-money).
 */

export interface PollOptions {
  get: (taskId: string) => Promise<TaskStatus | null>;
  intervalMs?: number;
  capMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULTS = { intervalMs: 2000, capMs: 5 * 60 * 1000 };

export async function pollTask(started: TaskStatus, opts: PollOptions): Promise<TaskStatus> {
  const { get, intervalMs = DEFAULTS.intervalMs, capMs = DEFAULTS.capMs, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = opts;
  if (started.progress !== "processing") return started;
  const maxTries = Math.max(1, Math.ceil(capMs / intervalMs));
  for (let i = 0; i < maxTries; i++) {
    await sleep(intervalMs);
    const t = await get(started.taskId);
    if (!t) throw new Error("task vanished");
    if (t.progress !== "processing") return t;
  }
  throw new Error(`timed out after ${maxTries} polls (${capMs} ms)`);
}
