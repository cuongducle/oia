import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChatEvent, ImageProvider, ProviderCapabilities } from "@oia/schema";
import { createServiceContext, runChat, cancelJob, jobControllers, chatRequestSchema, type ServiceContext } from "../src/index.js";
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

  it("A1 VA-9: returns the sessionId it persisted to — the editor dock pins its conversation", async () => {
    const ctx = await freshCtx();
    const first = await runChat({ prompt: "edit 1" }, ctx, { sink: () => {} });
    const stored = ctx.chatSessions.get(first.sessionId);
    expect(stored).toBeDefined(); // the returned id IS the session the canvas landed in
    expect(stored!.messages.at(-1)?.role).toBe("assistant");
    // second edit with the same sessionId joins the SAME conversation (2 pairs, not 2 sessions)
    const second = await runChat({ prompt: "edit 2", sessionId: first.sessionId }, ctx, { sink: () => {} });
    expect(second.sessionId).toBe(first.sessionId);
    expect(ctx.chatSessions.get(first.sessionId)!.messages.length).toBe(4);
    expect(ctx.chatSessions.recent().length).toBe(1);
  });

  it("C1: outlineGate (pages>=2) ends with outcome 'outline' — zero canvases on the wire", async () => {
    const ctx = await freshCtx();
    const { events, sink } = collector();
    const { outcome, sessionId } = await runChat({ prompt: "sales deck", pages: 3, outlineGate: true }, ctx, { sink });
    expect(outcome).toBe("outline");
    const canvases = events.flatMap((e) => e.renderData.msgMeta.filter((m) => m.type === "canvas"));
    expect(canvases).toHaveLength(0); // no image was generated
    const outline = events.find((e) => e.renderData.outline?.length)?.renderData.outline;
    expect(outline).toHaveLength(3);
    expect(typeof sessionId).toBe("number");
  });

  it("C1: phase 2 with approvedOutline joins the SAME session (OC-8) and completes", async () => {
    const ctx = await freshCtx();
    const phase1 = await runChat({ prompt: "sales deck", pages: 2, outlineGate: true }, ctx, { sink: () => {} });
    const { events, sink } = collector();
    const phase2 = await runChat(
      {
        prompt: "sales deck", sessionId: phase1.sessionId,
        approvedOutline: [
          { title: "Page 1", summary: "sales deck — part 1" },
          { title: "Page 2", summary: "sales deck — part 2" },
        ],
      },
      ctx,
      { sink },
    );
    expect(phase2.outcome).toBe("completed");
    expect(phase2.sessionId).toBe(phase1.sessionId);
    // id "final" is the runChat persistence rewrite of the LAST event (pre-existing) —
    // the real generations are the distinct ids besides it
    const pageIds = new Set(events.flatMap((e) => e.renderData.msgMeta.filter((m) => m.type === "canvas" && m.id !== "final").map((m) => m.id)));
    expect(pageIds.size).toBe(2);
    // ONE conversation holds the outline stub AND the deck result
    expect(ctx.chatSessions.get(phase1.sessionId)!.messages.length).toBe(4);
  });

  it("C1: outlineGate on a single page behaves as a normal completed run (no gate concept)", async () => {
    const ctx = await freshCtx();
    const { outcome } = await runChat({ prompt: "poster", pages: 1, outlineGate: true }, ctx, { sink: () => {} });
    expect(outcome).toBe("completed");
  });

  it("A1 VA-9: refusals still return the sessionId (the prompt was persisted — the record must not lie)", async () => {
    const ctx = await freshCtx();
    const failing = new FailingMockLlmProvider({ errorClass: "not_logged_in", available: false });
    (ctx.chat as { llm: unknown }).llm = failing;
    const { sessionId, outcome } = await runChat({ prompt: "x" }, ctx, { sink: () => {} });
    expect(outcome).toBe("refused-unavailable");
    expect(ctx.chatSessions.get(sessionId)).toBeDefined();
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

describe("C1 teardown fix: the wire validates deck bounds at the boundary", () => {
  it("approvedOutline caps at 9 — 10 rows is a schema rejection, not a planner failure", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ title: `P${i}`, summary: "s" }));
    expect(chatRequestSchema.safeParse({ prompt: "deck", approvedOutline: ten }).success).toBe(false);
    const nine = Array.from({ length: 9 }, (_, i) => ({ title: `P${i}`, summary: "s" }));
    expect(chatRequestSchema.safeParse({ prompt: "deck", approvedOutline: nine }).success).toBe(true);
  });

  it("blank rows are rejected by the shared planPageSchema (no blank reaches the planner)", () => {
    expect(chatRequestSchema.safeParse({ prompt: "deck", approvedOutline: [{ title: " ", summary: "s" }] }).success).toBe(false);
  });

  it("pages caps at 9 too — the composer's ceiling holds on the wire", () => {
    expect(chatRequestSchema.safeParse({ prompt: "deck", pages: 10 }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ prompt: "deck", pages: 9 }).success).toBe(true);
  });
});
