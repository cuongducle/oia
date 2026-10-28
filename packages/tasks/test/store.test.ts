import { describe, expect, it } from "vitest";
import { TaskStore, TaskNotFound, ok, fail } from "../src/index.js";

describe("BR-7 task lifecycle + 24h TTL", () => {
  it("processing → succeeded, taskResult.download có URL", async () => {
    const store = new TaskStore();
    store.register("remove-background", async () => ({ urls: ["https://cdn/x/subject.png"] }));
    const t = await store.submit("remove-background", { fileUrl: "https://cdn/x/in.png" }, { noWait: true });
    expect(t.progress).toBe("succeeded");
    expect(t.taskResult?.download).toBeTruthy();
  });
  it("a throwing handler → failed with the error message", async () => {
    const store = new TaskStore();
    store.register("remove-background", async () => { throw new Error("nsfw rejected"); });
    const t = await store.submit("remove-background", { fileUrl: "https://cdn/x/in.png" }, { noWait: true });
    expect(t.progress).toBe("failed");
    expect(t.msg).toContain("nsfw rejected");
  });
  it("after 24h → get() throws TaskNotFound (maps to 404)", async () => {
    let now = 1_000_000;
    const store = new TaskStore({ clock: { now: () => now } });
    store.register("remove-background", async () => ({ urls: ["https://cdn/a.png"] }));
    const t = await store.submit("remove-background", { fileUrl: "u" }, { noWait: true });
    expect(() => store.get(t.taskId)).not.toThrow();
    now += 24 * 60 * 60 * 1000 + 1; // quá TTL
    expect(() => store.get(t.taskId)).toThrow(TaskNotFound);
  });
  it("an unknown task → TaskNotFound", async () => {
    const store = new TaskStore();
    expect(() => store.get("task_nonexist")).toThrow(TaskNotFound);
  });
});

describe("BR-8 session iteration: a task belongs to exactly one session", () => {
  it("omitting sessionId creates one; passing it back reuses the same session", async () => {
    const store = new TaskStore();
    store.register("image-edit", async () => ({ urls: ["https://cdn/e1.png"] }));
    const a = await store.submit("image-edit", { reference: ["r1"], prompt: "p" }, { noWait: true });
    expect(a.sessionId).toBeGreaterThan(0);
    const b = await store.submit("image-edit", { reference: ["r2"], prompt: "p2" }, { sessionId: a.sessionId, noWait: true });
    expect(b.sessionId).toBe(a.sessionId);
    expect(store.sessionTasks(a.sessionId).map((t) => t.taskId)).toEqual([a.taskId, b.taskId]);
  });
});

describe("BR-9 noWait: async returns processing immediately, sync waits", () => {
  it("noWait=false → progress processing + taskId ngay", async () => {
    const store = new TaskStore();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    store.register("generate-poster", async () => { await gate; return { urls: ["https://cdn/p.png"] }; });
    const t = await store.submit("generate-poster", { prompt: "x" }); // async by default
    expect(t.progress).toBe("processing");
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(store.get(t.taskId).progress).toBe("succeeded");
  });
});

describe("BR-10 param validation per task type", () => {
    it("generate-presentation: n outside 5..30 is rejected", async () => {
    const store = new TaskStore();
    store.register("generate-presentation", async () => ({ urls: ["https://cdn/a.pptx"] }));
    await expect(
      store.submit("generate-presentation", { prompt: "p", n: 100 }, { noWait: true }),
    ).rejects.toThrow();
  });
    it("image-edit without a reference is rejected", async () => {
    const store = new TaskStore();
    store.register("image-edit", async () => ({ urls: ["https://cdn/a.png"] }));
    await expect(store.submit("image-edit", { prompt: "p" }, { noWait: true })).rejects.toThrow();
  });
});

describe("BR-11 output rules: background removal stays PNG, multi-image becomes one ZIP", () => {
    it("remove-background forces a .png output even for .jpg input", async () => {
    const store = new TaskStore();
    store.register("remove-background", async () => ({ urls: ["https://cdn/x/subject.jpg"] }));
    const t = await store.submit("remove-background", { fileUrl: "u" }, { noWait: true });
    expect(t.taskResult!.download).toMatch(/\.png$/);
  });
    it("multiple images → exactly one ZIP url", async () => {
    const store = new TaskStore();
    store.register("generate-xhs-images", async () => ({ urls: ["https://cdn/a/1.png", "https://cdn/a/2.png", "https://cdn/a/3.png"] }));
    const t = await store.submit("generate-xhs-images", { count: 3, urls: [] }, { noWait: true });
    expect(t.taskResult!.download).toMatch(/\.zip$/);
  });
});

describe("BR-12 CommonResult envelope", () => {
    it("ok/fail envelopes match the contract", async () => {
    expect(ok({ a: 1 })).toEqual({ code: 0, data: { a: 1 }, msg: "" });
    expect(fail("x").code).not.toBe(0);
  });
});
