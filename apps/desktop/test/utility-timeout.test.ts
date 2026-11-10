import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UtilityProcess } from "electron";

/**
 * Bug-repro 2026-10-30 #4 (no RPC timeout anywhere): a wedged utility call must
 * fail fast as UtilityTimeout, never hang an IPC handler forever, and a LATE
 * response must be dropped instead of resolving into nothing. The deadline
 * CONTRACT is pinned too: chatRun must outlive the 480s codex budget while
 * store calls stay bounded. AGENTS.md #4: every defect fix ships a regression
 * test for its own failure mode; this defect had none until now. The crash
 * path (#1) gets a unit pin here as well, its e2e is `crash-smoke` in CI.
 */
vi.mock("electron", () => ({ utilityProcess: { fork: vi.fn() } }));

import { utilityProcess } from "electron";
import { UtilityClient } from "../src/main/utilityClient.js";

type Handler = (arg?: unknown) => void;

function makeFakeChild() {
  const handlers = new Map<string, Handler[]>();
  return {
    postMessage: vi.fn(),
    kill: vi.fn(),
    on: (ev: string, fn: Handler) => {
      const list = handlers.get(ev) ?? [];
      list.push(fn);
      handlers.set(ev, list);
    },
    emit: (ev: string, arg?: unknown) => {
      for (const fn of handlers.get(ev) ?? []) fn(arg);
    },
  };
}

const fork = vi.mocked(utilityProcess.fork);
let child: ReturnType<typeof makeFakeChild>;

beforeEach(() => {
  child = makeFakeChild();
  // SAFETY: a test double standing in for the real UtilityProcess handle; the
  // client only ever touches postMessage/on/kill on it.
  fork.mockImplementation(() => child as unknown as UtilityProcess);
});

describe("utility RPC deadline (bug-repro #4)", () => {
  it("a wedged call fails fast as UtilityTimeout, not a hung handler", async () => {
    const client = new UtilityClient();
    client.start();
    const err = await client.call({ cmd: "tasks.get", taskId: "t" }, { timeoutMs: 25 }).catch((e) => e);
    expect(err.name).toBe("UtilityTimeout");
    expect(String(err.message)).toContain("tasks.get");
  });

  it("the LATE response is dropped and the client stays usable", async () => {
    const client = new UtilityClient();
    client.start();
    const first = await client.call({ cmd: "tasks.get", taskId: "t" }, { timeoutMs: 25 }).catch((e) => e);
    expect(first.name).toBe("UtilityTimeout");
    const rid = (child.postMessage.mock.calls[0][0] as { rid: string }).rid;
    child.emit("message", { rid, ok: true, result: "late" }); // pending entry was deleted: dropped on the floor
    const second = client.call({ cmd: "projects.list" }, { timeoutMs: 1000 });
    const rid2 = (child.postMessage.mock.calls[1][0] as { rid: string }).rid;
    child.emit("message", { rid: rid2, ok: true, result: [] });
    await expect(second).resolves.toEqual([]);
  });

  it("chatRun outlives the 480s codex budget, store calls are bounded at the default", async () => {
    vi.useFakeTimers();
    try {
      const client = new UtilityClient();
      client.start();
      const chatSettled: string[] = [];
      const storeSettled: string[] = [];
      void client.call({ cmd: "chatRun", req: {} }).then(
        () => chatSettled.push("ok"),
        (e: Error) => chatSettled.push(e.name),
      );
      void client.call({ cmd: "projects.list" }).then(
        () => storeSettled.push("ok"),
        (e: Error) => storeSettled.push(e.name),
      );
      await vi.advanceTimersByTimeAsync(30_000);
      expect(storeSettled).toEqual(["UtilityTimeout"]); // the default bound holds
      expect(chatSettled).toEqual([]); // ...and does not touch the chat budget
      await vi.advanceTimersByTimeAsync(480_000); // t=510s: past the full codex budget
      expect(chatSettled).toEqual([]); // a real generation must NEVER be cut by this deadline
      await vi.advanceTimersByTimeAsync(12 * 60_000 - 510_000 + 1); // t=720s+1: the chat bound
      expect(chatSettled).toEqual(["UtilityTimeout"]); // ...but even chat is bounded in the end
    } finally {
      vi.useRealTimers();
    }
  });

  it("a crash rejects pending calls as UtilityProcessCrashed, never leaves the UI hanging (#1, unit level)", async () => {
    const client = new UtilityClient();
    client.start();
    const pending = client.call({ cmd: "tasks.get", taskId: "t" }, { timeoutMs: 60_000 });
    child.emit("exit", 1);
    const err = await pending.catch((e) => e);
    expect(err.name).toBe("UtilityProcessCrashed");
  });
});
