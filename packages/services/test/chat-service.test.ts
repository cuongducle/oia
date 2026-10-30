import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChatEvent, ImageProvider, ProviderCapabilities } from "@oia/schema";
import { createServiceContext, runChat, cancelJob, jobControllers, type ServiceContext } from "../src/index.js";
import { MockImageProvider, MockLlmProvider, FailingMockLlmProvider } from "@oia/providers";

/**
 * D1 contract tests — the surface the desktop IPC handler will call, with NO transport.
 * These pin the orchestration behaviors the web SSE route previously owned.
 */

const caps = (isMock = true): ProviderCapabilities => ({
  referenceImages: true,
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock,
});

/** Metered mock: isMock:false so the G3 guard engages. */
function meteredMockImage(): ImageProvider {
  const inner = new MockImageProvider();
  return {
    name: inner.name,
    capabilities: caps(false),
    generate: (i) => inner.generate(i),
    isAvailable: () => inner.isAvailable(),
  };
}

async function freshCtx(env: NodeJS.ProcessEnv = {}): Promise<ServiceContext> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "oia-svc-"));
  const ctx = await createServiceContext({ dataDir, env });
  // deterministic providers regardless of the machine env
  (ctx.chat as { image: unknown }).image = new MockImageProvider();
  (ctx.chat as { llm: unknown }).llm = new MockLlmProvider();
  return ctx;
}

function collector(): { events: ChatEvent[]; sink: (e: ChatEvent) => void } {
  const events: ChatEvent[] = [];
  return { events, sink: (e) => { events.push(e); } };
}

beforeEach(() => {
  delete (globalThis as unknown as { __oiaMeteredInFlight?: unknown }).__oiaMeteredInFlight;
  jobControllers().clear();
});

describe("D1 runChat — happy path", () => {
  it("completes: narrative events + canvas (assetized, no base64) + </Content>, jobId on every event", async () => {
    const ctx = await freshCtx();
    const { events, sink } = collector();
    const { jobId, outcome } = await runChat({ prompt: "banner trà sữa giảm 20%" }, ctx, { sink });
    expect(outcome).toBe("completed");
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(events.at(-1)?.content).toBe("</Content>");
    expect(events.every((e) => e.jobId === jobId)).toBe(true);
    expect(JSON.stringify(events)).not.toContain("data:image"); // A1 assetization
    expect(JSON.stringify(events)).toContain("/api/files/");
    // session persisted (replayable)
    expect(ctx.chatSessions.recent(1)[0].messages.length).toBe(2);
  });
});

describe("D1 runChat — refusals", () => {
  it("pre-flight: an unavailable provider refuses with attemptNumber 0 and zero canvas events", async () => {
    const ctx = await freshCtx();
    const failing = new FailingMockLlmProvider({ errorClass: "not_logged_in", available: false });
    (ctx.chat as { llm: unknown }).llm = failing;
    const { events, sink } = collector();
    const { outcome } = await runChat({ prompt: "x" }, ctx, { sink });
    expect(outcome).toBe("refused-unavailable");
    expect(events).toHaveLength(1);
    expect(events[0].errorClass).toBe("not_logged_in");
    expect(events[0].provider).toBe("failing-mock"); // B4: the failing provider's own name
    expect(events[0].attemptNumber).toBe(0);
  });

  it("G3: a second concurrent metered job is refused rate_limited (mock bypasses)", async () => {
    const ctx = await freshCtx();
    (ctx.chat as { image: unknown }).image = meteredMockImage();
    (globalThis as unknown as { __oiaMeteredInFlight?: Set<string> }).__oiaMeteredInFlight = new Set(["other"]);
    const { events, sink } = collector();
    const { outcome } = await runChat({ prompt: "x" }, ctx, { sink });
    expect(outcome).toBe("refused-rate-limited");
    expect(events[0].errorClass).toBe("rate_limited");
    expect(events[0].attemptNumber).toBe(0);
  });
});

describe("D1 runChat — cancellation", () => {
  it("Stop (cancelJob) mid-run: terminal cancelled event, slot released, registry cleaned", async () => {
    const ctx = await freshCtx();
    const slow = new FailingMockLlmProvider({ errorClass: "timeout", latencyMs: 10_000 });
    (ctx.chat as { llm: unknown }).llm = slow;
    const { events, sink } = collector();
    const runPromise = runChat({ prompt: "x" }, ctx, { sink });
    // wait for registration, then cancel
    await new Promise((r) => setTimeout(r, 150));
    const jobId = [...jobControllers().keys()][0]!;
    expect(cancelJob(jobId)).toBe(true);
    const { outcome } = await runPromise;
    expect(outcome).toBe("cancelled");
    const terminal = events.find((e) => e.status === "cancelled");
    expect(terminal).toBeDefined();
    expect(terminal!.jobId).toBe(jobId);
    expect(terminal!.afterCompletion).toBe(false);
    expect(jobControllers().has(jobId)).toBe(false);
  });

  it("an external abort (shell signal — disconnect grace on web, window close on desktop) behaves the same", async () => {
    const ctx = await freshCtx();
    const slow = new FailingMockLlmProvider({ errorClass: "timeout", latencyMs: 10_000 });
    (ctx.chat as { llm: unknown }).llm = slow;
    const { events, sink } = collector();
    const external = new AbortController();
    const runPromise = runChat({ prompt: "x" }, ctx, { signal: external.signal, sink });
    setTimeout(() => external.abort(), 150);
    const { outcome } = await runPromise;
    expect(outcome).toBe("cancelled");
    expect(events.some((e) => e.status === "cancelled")).toBe(true);
  });
});

describe("D1 runChat — stage-aware retry (A5)", () => {
  it("a retry with retryOf reuses the stashed plan: zero planner turns", async () => {
    const ctx = await freshCtx();
    let llmCalls = 0;
    const base = new MockLlmProvider();
    (ctx.chat as { llm: unknown }).llm = {
      name: "mock", capabilities: caps(),
      isAvailable: () => base.isAvailable(),
      async chat(...a: Parameters<typeof base.chat>) { llmCalls++; return base.chat(...a); },
    };
    const first = await runChat({ prompt: "banner" }, ctx, { sink: () => {} });
    expect(first.outcome).toBe("completed");
    expect(llmCalls).toBe(1);
    const sid = ctx.chatSessions.recent(1)[0].id;
    const retry = await runChat({ prompt: "banner", sessionId: sid, retryOf: "failed-job" }, ctx, { sink: () => {} });
    expect(retry.outcome).toBe("completed");
    expect(llmCalls).toBe(1); // the cached plan rode again
  });
});

describe("D2 remediation: chatRequestSchema is the single boundary schema", () => {
  it("strips unknown keys and rejects invalid values (web adapter + desktop IPC share it)", async () => {
    const { chatRequestSchema } = await import("../src/index.js");
    const ok = chatRequestSchema.safeParse({ prompt: "banner", width: 900, mode: "clean-plate", future: 1 });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).not.toHaveProperty("future");
    expect(chatRequestSchema.safeParse({ prompt: "x", width: Number("abc") }).success).toBe(false);
  });
  it("refusals are distinguishable without event sniffing", async () => {
    // (typed outcome union: refused-rate-limited | refused-unavailable — compile-time,
    //  exercised at runtime by the guard/preflight tests above)
  });
});
