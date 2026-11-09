import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChatEvent, ImageProvider, ProviderCapabilities } from "@oia/schema";
import { createServiceContext, runChat, cancelJob, jobControllers, chatRequestSchema, selfImproveRounds, chatBudgetMs, type ServiceContext } from "../src/index.js";
import { MockImageProvider, MockLlmProvider, FailingMockLlmProvider } from "@oia/providers";

/**
 * D1 contract tests, the surface the desktop IPC handler will call, with NO transport.
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

describe("D1 runChat, happy path", () => {
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

  it("A1 VA-9: returns the sessionId it persisted to, the editor dock pins its conversation", async () => {
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

  it("C1: outlineGate (pages>=2) ends with outcome 'outline', zero canvases on the wire", async () => {
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
          { title: "Page 1", summary: "sales deck, part 1" },
          { title: "Page 2", summary: "sales deck, part 2" },
        ],
      },
      ctx,
      { sink },
    );
    expect(phase2.outcome).toBe("completed");
    expect(phase2.sessionId).toBe(phase1.sessionId);
    // id "final" is the runChat persistence rewrite of the LAST event (pre-existing),
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

  it("A1 VA-9: refusals still return the sessionId (the prompt was persisted, the record must not lie)", async () => {
    const ctx = await freshCtx();
    const failing = new FailingMockLlmProvider({ errorClass: "not_logged_in", available: false });
    (ctx.chat as { llm: unknown }).llm = failing;
    const { sessionId, outcome } = await runChat({ prompt: "x" }, ctx, { sink: () => {} });
    expect(outcome).toBe("refused-unavailable");
    expect(ctx.chatSessions.get(sessionId)).toBeDefined();
  });
});

describe("D1 runChat, refusals", () => {
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

describe("D1 runChat, cancellation", () => {
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

  it("an external abort (shell signal, disconnect grace on web, window close on desktop) behaves the same", async () => {
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

describe("D1 runChat, stage-aware retry (A5)", () => {
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

describe("live repro 2026-11-02: in-process refs must not reach the provider as /api/files URLs", () => {
  it("materializes /api/files/<key> and oia://files/<key> refs into data URLs (A1 variant on a real pair)", async () => {
    const ctx = await freshCtx();
    const png1x1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const { url: assetUrl } = await ctx.files.put(png1x1, "png");
    expect(assetUrl).toMatch(/^\/api\/files\//); // the renderer's canonical form

    const seen: string[][] = [];
    const base = new MockImageProvider();
    (ctx.chat as { image: unknown }).image = {
      name: base.name, capabilities: caps(false),
      isAvailable: () => base.isAvailable(),
      async generate(i: Parameters<typeof base.generate>[0]) {
        seen.push([...(i.referenceImages ?? [])]);
        return base.generate(i);
      },
    };
    const legacy = assetUrl.replace("/api/files/", "oia://files/");
    const res = await runChat({ prompt: "make it warmer", referenceImages: [assetUrl, legacy, "https://example.com/x.png"] }, ctx, { sink: () => {} });
    expect(res.outcome).toBe("completed");
    expect(seen.length).toBeGreaterThan(0);
    for (const refs of seen) {
      expect(refs[0]).toMatch(/[/\\]uploads[/\\]/); // store-backed ref became a LOCAL PATH (P2: no base64 round-trip)
      expect(refs[1]).toMatch(/[/\\]uploads[/\\]/); // legacy oia:// form too
      expect(refs[2]).toBe("https://example.com/x.png"); // remote refs pass through untouched
    }
  });

  const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  it("pass-through: data:, https: and absolute-path refs reach the provider verbatim; an empty ref list stays undefined", async () => {
    const ctx = await freshCtx();
    const seen: (string[] | undefined)[] = [];
    const base = new MockImageProvider();
    (ctx.chat as { image: unknown }).image = {
      name: base.name, capabilities: caps(),
      isAvailable: () => base.isAvailable(),
      async generate(i: Parameters<typeof base.generate>[0]) {
        seen.push(i.referenceImages);
        return base.generate(i);
      },
    };
    const refs = ["data:image/png;base64,iVBORw0KGgo=", "https://example.com/x.png", "/tmp/absolute/ref.png"];
    const first = await runChat({ prompt: "edit", referenceImages: refs }, ctx, { sink: () => {} });
    expect(first.outcome).toBe("completed");
    expect(seen.some((r) => JSON.stringify(r) === JSON.stringify(refs))).toBe(true); // verbatim, no rewriting of foreign forms
    const second = await runChat({ prompt: "edit 2", referenceImages: [] }, ctx, { sink: () => {} });
    expect(second.outcome).toBe("completed");
    expect(seen.some((r) => r === undefined)).toBe(true); // empty list ≠ empty array on the provider input
  });

  it("a missing store key fails the job BEFORE any image is burned, the error names the KEY, never an absolute path", async () => {
    const ctx = await freshCtx();
    const events: ChatEvent[] = [];
    const base = new MockImageProvider();
    let gens = 0;
    (ctx.chat as { image: unknown }).image = {
      name: base.name, capabilities: caps(false),
      isAvailable: () => base.isAvailable(),
      async generate(i: Parameters<typeof base.generate>[0]) {
        gens++;
        return base.generate(i);
      },
    };
    const res = await runChat({ prompt: "edit", referenceImages: ["/api/files/uploads/20990101/does-not-exist.png"] }, ctx, { sink: (e) => { events.push(e); } });
    expect(res.outcome).toBe("failed");
    expect(gens).toBe(0); // the seller's image quota was NOT burned on a doomed ref (G2 spirit)
    const err = events.find((e) => e.error);
    expect(err?.errorClass).toBeTruthy();
    expect(err?.error).toContain("does-not-exist"); // names the missing asset
    expect(err?.error).not.toMatch(/\/(Users|home|var|tmp)\//); // never leaks an absolute path
  });

  it("A1 invariant: the materialized data URL never leaks onto any wire, events and the persisted session carry no base64", async () => {
    const ctx = await freshCtx();
    const { url: assetUrl } = await ctx.files.put(PNG_1X1, "png");
    const { events, sink } = collector();
    const res = await runChat({ prompt: "make it warmer", referenceImages: [assetUrl] }, ctx, { sink });
    expect(res.outcome).toBe("completed");
    const stored = ctx.chatSessions.get(res.sessionId);
    const wire = JSON.stringify(events) + JSON.stringify(stored ?? null);
    expect(wire).not.toContain("data:image");
    expect(wire).not.toContain("base64");
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
  it("ME: editMode.markup accepts exactly \"flatten\", anything else is a boundary rejection", async () => {
    const { chatRequestSchema } = await import("../src/index.js");
    const ok = chatRequestSchema.safeParse({ prompt: "clean this", editMode: { markup: "flatten", targetName: "artwork" } });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.editMode?.markup).toBe("flatten");
    expect(chatRequestSchema.safeParse({ prompt: "x", editMode: { markup: "field" } }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ prompt: "x", editMode: { markup: true } }).success).toBe(false);
  });
  it("refusals are distinguishable without event sniffing", async () => {
    // (typed outcome union: refused-rate-limited | refused-unavailable, compile-time,
    //  exercised at runtime by the guard/preflight tests above)
  });
});

describe("C1 teardown fix: the wire validates deck bounds at the boundary", () => {
  it("approvedOutline caps at 9, 10 rows is a schema rejection, not a planner failure", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ title: `P${i}`, summary: "s" }));
    expect(chatRequestSchema.safeParse({ prompt: "deck", approvedOutline: ten }).success).toBe(false);
    const nine = Array.from({ length: 9 }, (_, i) => ({ title: `P${i}`, summary: "s" }));
    expect(chatRequestSchema.safeParse({ prompt: "deck", approvedOutline: nine }).success).toBe(true);
  });

  it("blank rows are rejected by the shared planPageSchema (no blank reaches the planner)", () => {
    expect(chatRequestSchema.safeParse({ prompt: "deck", approvedOutline: [{ title: " ", summary: "s" }] }).success).toBe(false);
  });

  it("pages caps at 9 too, the composer's ceiling holds on the wire", () => {
    expect(chatRequestSchema.safeParse({ prompt: "deck", pages: 10 }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ prompt: "deck", pages: 9 }).success).toBe(true);
  });
});


describe("Style preset, validated at the boundary, passed through to the planner", () => {
  it("a preset id parses; junk is rejected (never reaches the agent as free text)", () => {
    expect(chatRequestSchema.safeParse({ prompt: "banner", style: "bold" }).success).toBe(true);
    expect(chatRequestSchema.safeParse({ prompt: "banner", style: "aztec-brutalism" }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ prompt: "banner" }).success).toBe(true); // absent = Auto
  });
});

describe("A3-lite: editMode is a structured, validated field on the boundary", () => {
  it("accepts the shape and strips foreign keys, the renderer sends structure, never prose", () => {
    const ok = chatRequestSchema.safeParse({ prompt: "make it warmer", editMode: { targetName: "artwork", textLayerOverlays: true } });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.editMode).toEqual({ targetName: "artwork", textLayerOverlays: true });
    const bad = chatRequestSchema.safeParse({ prompt: "x", editMode: { targetName: 123, evil: true } });
    expect(bad.success).toBe(false); // unknown/typed-wrong keys are rejected, not silently coerced
  });
});

/* ---------- DA, research + auto refine on the wire (designer-agent-loop.md) ---------- */

describe("DA: chatRequestSchema, research + selfImprove (S0.1/S2.1)", () => {
  it("both optional booleans parse; absent keys stay absent (D14 additive)", () => {
    const ok = chatRequestSchema.safeParse({ prompt: "banner", research: true, selfImprove: true });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.research).toBe(true);
      expect(ok.data.selfImprove).toBe(true);
    }
    const legacy = chatRequestSchema.safeParse({ prompt: "banner" });
    expect(legacy.success).toBe(true);
    if (legacy.success) expect(legacy.data.research).toBeUndefined();
  });

  it("explicit rounds are capped at the BOUNDARY, 0..2 pass, 3 fails with a clear message (never deep inside the loop)", () => {
    for (const rounds of [0, 1, 2]) {
      expect(chatRequestSchema.safeParse({ prompt: "banner", selfImprove: { rounds } }).success).toBe(true);
    }
    const over = chatRequestSchema.safeParse({ prompt: "banner", selfImprove: { rounds: 3 } });
    expect(over.success).toBe(false);
  });

  it("selfImproveRounds normalizes the wire forms (true → default, false → off)", () => {
    expect(selfImproveRounds(undefined)).toBeNull();
    expect(selfImproveRounds(false)).toBeNull();
    expect(selfImproveRounds(true)).toBe(1);
    expect(selfImproveRounds({ rounds: 2 })).toBe(2);
  });
});

describe("DA: runChat with auto refine, verdict persists into the conversation (gate d, B7)", () => {
  it("mock pair: one deterministic refine round, completed, and the stored session carries renderData.selfImprove", async () => {
    const ctx = await freshCtx();
    const { events, sink } = collector();
    const res = await runChat({ prompt: "banner trà sữa", selfImprove: true }, ctx, { sink });
    expect(res.outcome).toBe("completed");
    // the loop ran: verdict pass after round 1 (2 images under the hood,
    // asserted at the agent layer; here the wire + persistence are the point)
    const canvasEvents = events.filter((e) => e.content.includes("[[canvas::canvas::"));
    expect(canvasEvents).toHaveLength(1);
    expect(events.at(-1)?.renderData.selfImprove).toMatchObject({ rounds: 1, verdict: "pass" });
    // persisted: replay sees the same verdict (the record must not lie)
    const stored = ctx.chatSessions.get(res.sessionId);
    const last = stored?.messages.at(-1) as { renderData?: { selfImprove?: { rounds: number; verdict: string } } };
    expect(last?.renderData?.selfImprove).toMatchObject({ rounds: 1, verdict: "pass" });
  });

  it("research with a provider that cannot search (mock), announced, job still completes", async () => {
    const ctx = await freshCtx();
    const { events, sink } = collector();
    const res = await runChat({ prompt: "banner", research: true }, ctx, { sink });
    expect(res.outcome).toBe("completed");
    expect(events.map((e) => e.content).join("\n")).toContain("Research unavailable on mock");
  });
});

/* ---------- DA teardown fixes (2026-11-06) ---------- */

describe("DA teardown #4, the budget scales with pages × refine rounds (no flat-480s mid-deck abort)", () => {
  it("chatBudgetMs: flat without refine; 480s + pages×rounds×150s with it; capped by the 9-page ceiling", () => {
    expect(chatBudgetMs({ prompt: "x" })).toBe(480_000);
    expect(chatBudgetMs({ prompt: "x", selfImprove: true })).toBe(480_000 + 150_000); // 1 page × 1 round
    expect(chatBudgetMs({ prompt: "x", selfImprove: { rounds: 2 }, pages: 3 })).toBe(480_000 + 3 * 2 * 150_000);
    expect(chatBudgetMs({ prompt: "x", selfImprove: true, pages: 99 })).toBe(480_000 + 9 * 150_000); // ceiling holds
    expect(chatBudgetMs({ prompt: "x", selfImprove: true, approvedOutline: [{ title: "t", summary: "s" }] })).toBe(480_000 + 150_000); // outline decides pages
  });
});

describe("DA teardown #2, multi-page verdicts persist into the conversation (B7)", () => {
  it("a 2-page deck with refine stores the hero verdict AND selfImprovePages (one entry per page)", async () => {
    const ctx = await freshCtx();
    const { events, sink } = collector();
    const res = await runChat({ prompt: "deck trà sữa", pages: 2, selfImprove: true }, ctx, { sink });
    expect(res.outcome).toBe("completed");
    const final = events.at(-1);
    expect(final?.renderData.selfImprovePages).toHaveLength(2);
    // mock critic per jobId: page 0 fails once → refines → pass(rounds 1); page 1 passes first try (rounds 0)
    expect(final?.renderData.selfImprovePages?.[0]).toMatchObject({ rounds: 1, verdict: "pass" });
    expect(final?.renderData.selfImprovePages?.[1]).toMatchObject({ rounds: 0, verdict: "pass" });
    const stored = ctx.chatSessions.get(res.sessionId);
    const last = stored?.messages.at(-1) as { renderData?: { selfImprovePages?: unknown[]; selfImprove?: { rounds: number } } };
    expect(last?.renderData?.selfImprovePages).toHaveLength(2); // replay sees every page's verdict
    expect(last?.renderData?.selfImprove).toMatchObject({ rounds: 1 }); // hero = page 0
  });
});
