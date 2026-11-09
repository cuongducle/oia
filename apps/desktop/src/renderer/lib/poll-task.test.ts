import { describe, expect, it } from "vitest";
import type { TaskStatus } from "@oia/schema";
import { pollTask } from "./poll-task.js";

/** Error-path gates for the shared poller (repo rule 4: never happy-path only).
 *  The clock is injected, no fake timers, each test drives ticks by hand. */

const mk = (over: Partial<TaskStatus> = {}): TaskStatus => ({
  taskId: "t1", sessionId: 1, progress: "processing",
  taskResult: null, taskNote: null, msg: "",
  ...over,
} as TaskStatus);

const tick = () => {
  let n = 0;
  return { sleep: async () => { n++; }, ticks: () => n };
};

describe("pollTask", () => {
  it("already-terminal task returns immediately, zero polls, zero sleeps", async () => {
    const t = tick();
    const done = mk({ progress: "succeeded" });
    const out = await pollTask(done, { get: async () => { throw new Error("must not poll"); }, sleep: t.sleep });
    expect(out).toBe(done);
    expect(t.ticks()).toBe(0);
  });

  it("polls until terminal and returns the final record", async () => {
    const t = tick();
    let reads = 0;
    const final = mk({ progress: "succeeded", taskNote: "ok" });
    const out = await pollTask(mk(), {
      get: async () => { reads++; return reads < 3 ? mk() : final; },
      sleep: t.sleep, intervalMs: 100, capMs: 10_000,
    });
    expect(out).toBe(final);
    expect(reads).toBe(3);
    expect(t.ticks()).toBe(3); // one sleep per read
  });

  it("a null read is 'task vanished', never silently retried into a lie", async () => {
    const t = tick();
    await expect(pollTask(mk(), { get: async () => null, sleep: t.sleep, intervalMs: 1, capMs: 100 }))
      .rejects.toThrow("task vanished");
  });

  it("the cap fires an honest timeout instead of polling forever", async () => {
    const t = tick();
    await expect(pollTask(mk(), { get: async () => mk(), sleep: t.sleep, intervalMs: 50, capMs: 150 }))
      .rejects.toThrow("timed out after 3 polls (150 ms)");
    expect(t.ticks()).toBe(3); // ceil(150/50) polls, then stop
  });

  it("a FAILED terminal state resolves (not throws), the caller reports taskNote honestly", async () => {
    const failed = mk({ progress: "failed", taskNote: "quota_exceeded" });
    const out = await pollTask(mk(), { get: async () => failed, sleep: async () => {}, intervalMs: 1, capMs: 10 });
    expect(out.progress).toBe("failed");
    expect(out.taskNote).toBe("quota_exceeded");
  });

  it("a late success after the user pressed Stop still resolves, quota-is-money, the caller applies it", async () => {
    const t = tick();
    let reads = 0;
    const late = mk({ progress: "succeeded" });
    const out = await pollTask(mk(), {
      get: async () => { reads++; return reads < 2 ? mk() : late; }, // succeeds on the read AFTER a hypothetical Stop
      sleep: t.sleep, intervalMs: 10, capMs: 10_000,
    });
    expect(out).toBe(late);
  });
});
