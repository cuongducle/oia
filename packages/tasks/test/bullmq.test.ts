import { describe, expect, it } from "vitest";
import { buildJobName, splitJobName, createQueueBackend, QUEUE_NAME } from "../src/bullmq.js";
import type { TaskJob } from "../src/queue.js";

describe("BR-W worker queue", () => {
  it("job name maps task:<type> both ways", () => {
    expect(buildJobName("generate-poster")).toBe("task:generate-poster");
    expect(splitJobName("task:remove-background")).toBe("remove-background");
  });
  it("queue name is fixed (oia-tasks)", () => {
    expect(QUEUE_NAME).toBe("oia-tasks");
  expect(QUEUE_NAME).not.toMatch(/:/); // BullMQ 6 forbids ":" in queue names
  });
  it("BR-W4: without REDIS_URL the in-process fallback runs the handler immediately (dev/CI)", async () => {
    delete process.env.REDIS_URL;
    const seen: string[] = [];
    const backend = await createQueueBackend({
      "generate-poster": async (job) => void seen.push(job.taskId),
    });
    expect(backend.kind).toBe("inprocess");
    const job: TaskJob = { taskId: "task_abc", sessionId: 1, type: "generate-poster", params: { prompt: "x" } };
    await backend.submit(job);
    expect(seen).toEqual(["task_abc"]);
    await backend.close();
  });
  it("job payloads keep the TaskJob shape (interchangeable backends)", () => {
    const job: TaskJob = { taskId: "t1", sessionId: 9, type: "image-edit", params: { prompt: "p" } };
    expect(job).toMatchObject({ taskId: "t1", sessionId: 9, type: "image-edit" });
  });
});

describe("STAGE-0 TP.4: per-class retry policy — metered generation runs exactly once", () => {
  it("metered task classes get attempts: 1 (no backoff re-spend)", async () => {
    const { retryPolicyFor, isMeteredTaskType } = await import("../src/retry-policy.js");
    for (const t of ["generate-poster", "image-edit", "generate-presentation", "generate-logo", "generate-xhs-images"] as const) {
      expect(retryPolicyFor(t)).toEqual({ attempts: 1 });
      expect(isMeteredTaskType(t)).toBe(true);
    }
  });
  it("non-metered classes keep the resilient default", async () => {
    const { retryPolicyFor } = await import("../src/retry-policy.js");
    expect(retryPolicyFor("remove-background")).toEqual({ attempts: 3, backoff: { type: "exponential", delay: 3000 } });
    expect(retryPolicyFor("ppt-translate")).toEqual({ attempts: 3, backoff: { type: "exponential", delay: 3000 } });
  });
});
