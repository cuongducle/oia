import { describe, it, expect, vi } from "vitest";
import { shutdownSequence } from "../src/main/shutdownSequence.js";

/**
 * Bug-repro 2026-10-30 #3 (quit race could orphan a quota-burning codex child):
 * the fix's contract, pinned on the extracted seam. AGENTS.md #4 says every
 * defect fix ships a regression test for its own failure mode; this defect had
 * none until now (only #1 crash-smoke and #2 loopback had gates).
 */
describe("quit sequence (bug-repro #3)", () => {
  it("awaits cancelAll to completion BEFORE the kill, then exits (no fire-and-forget race)", async () => {
    const order: string[] = [];
    await shutdownSequence({
      cancelAll: () =>
        new Promise((resolve) =>
          setTimeout(() => {
            order.push("cancelAll-settled");
            resolve(null);
          }, 5),
        ),
      kill: () => order.push("kill"),
      exit: () => order.push("exit"),
    });
    expect(order).toEqual(["cancelAll-settled", "kill", "exit"]);
  });

  it("a WEDGED cancelAll is bounded: kill + exit still happen after the bound, quit never hangs", async () => {
    vi.useFakeTimers();
    try {
      const kill = vi.fn();
      const exit = vi.fn();
      const quit = shutdownSequence({
        cancelAll: () => new Promise(() => {}), // never settles (wedged RPC)
        kill,
        exit,
        boundMs: 3000,
      });
      await vi.advanceTimersByTimeAsync(2999);
      expect(kill).not.toHaveBeenCalled(); // the honest cancel chance is still running
      await vi.advanceTimersByTimeAsync(1);
      await quit;
      expect(kill).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a REJECTING cancelAll still kills and exits (best-effort, never blocks, no unhandled rejection)", async () => {
    const kill = vi.fn();
    const exit = vi.fn();
    await shutdownSequence({
      cancelAll: () => Promise.reject(new Error("utility already dead")),
      kill,
      exit,
    });
    expect(kill).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
