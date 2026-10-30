import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServiceContext, type ServiceContext } from "@oia/services";
import {
  createGuardedSubmitter,
  MeteredBusyError,
  type GuardedJobEvent,
} from "../src/utility/guardedTaskSubmit.js";

/**
 * G3 (reorg step 4c) — the guarded task submit core, extracted from loopback.ts so
 * the quick-tools IPC lane shares IDENTICAL semantics. These are the T1-guard
 * regressions re-run at the helper level (no HTTP): the TOCTOU window, the sync-mode
 * slot pin + spurious "failed", reservation leaks on validation errors, and the
 * wedged-handler fallback.
 *
 * Determinism rules (learned the hard way): every test gets a FRESH ServiceContext
 * (mock pair, temp dir) so task handlers never leak across tests, and every "held"
 * task is awaited to its TERMINAL EVENT before the test ends — no sleep-and-hope.
 */

/** A metered-looking provider whose generate must never run — the held task owns the slot. */
function makeMeteredProvider() {
  return {
    name: "metered-stub",
    capabilities: {
      referenceImages: true,
      sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
      transparentBg: false,
      isMock: false,
    },
    isAvailable: async () => ({ ok: true, detail: "stub" }),
    generate: async () => {
      throw new Error("nothing metered may start while a task holds the slot");
    },
  };
}

async function freshCtx(): Promise<ServiceContext> {
  const root = mkdtempSync(path.join(tmpdir(), "oia-guarded-submit-"));
  const ctx = await createServiceContext({
    dataDir: path.join(root, "data"),
    env: { ...process.env, IMAGE_PROVIDER: "mock", LLM_PROVIDER: "mock" },
  });
  (ctx.chat as { image: unknown }).image = makeMeteredProvider();
  return ctx;
}

function makeSubmitter(ctx: ServiceContext, events: GuardedJobEvent[], fallbackTtlMs: number) {
  return createGuardedSubmitter({ ctx: () => ctx, lane: "tool", source: "web", idPrefix: "tool", fallbackTtlMs, onJobEvent: (ev) => events.push(ev) });
}

/** A processor that finishes only when its gate opens (the "held slot"). */
function gateProcessor(ctx: ServiceContext): { open: () => void } {
  let openGate!: () => void;
  const gate = new Promise<void>((r) => (openGate = r));
  ctx.taskStore.register("generate-poster", async () => {
    await gate;
    return { urls: ["/api/files/res-gated.png"], note: "gated" };
  });
  return { open: openGate };
}

/** Await the FIRST terminal frame for a task — deterministic settle barrier. */
async function awaitTerminal(events: GuardedJobEvent[], taskId: string, ms = 5000): Promise<GuardedJobEvent> {
  const t0 = Date.now();
  for (;;) {
    const hit = events.find((e) => e.taskId === taskId && e.event !== "submitted");
    if (hit) return hit;
    if (Date.now() - t0 > ms) throw new Error(`no terminal event for ${taskId}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

afterAll(() => {
  // the guard set is globalThis-scoped — leave it clean for other suites in this run
  delete (globalThis as unknown as { __oiaMeteredInFlight?: unknown }).__oiaMeteredInFlight;
});
afterEach(() => {
  // the guard set is globalThis-scoped — never let one test's reservation bleed into the next
  delete (globalThis as unknown as { __oiaMeteredInFlight?: unknown }).__oiaMeteredInFlight;
});

describe("guarded submit — the TOCTOU window stays closed", () => {
  it("5 concurrent metered submits → exactly ONE admitted, 4 refused, nothing double-run", async () => {
    const ctx = await freshCtx();
    const events: GuardedJobEvent[] = [];
    const s = makeSubmitter(ctx, events, 60_000);
    const { open } = gateProcessor(ctx);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => s.submit("generate-poster", { prompt: "burst", noWait: false })),
    );
    const admitted = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected" && r.reason instanceof MeteredBusyError);
    // OLD defect: track-AFTER-submit let every concurrent submit through the check
    expect(admitted.length).toBe(1);
    expect(refused.length).toBe(4);
    expect(events.filter((e) => e.event === "submitted").length).toBe(1);

    open();
    const terminal = await awaitTerminal(events, admitted[0].value.taskId);
    expect(terminal.event).toBe("succeeded");
    expect(terminal.lane).toBe("tool"); // frames carry the lane they ran on
  });
});

describe("guarded submit — sync mode (noWait:true)", () => {
  it("does NOT pin the slot and never emits a spurious failed after a success", async () => {
    const ctx = await freshCtx();
    const events: GuardedJobEvent[] = [];
    const s = makeSubmitter(ctx, events, 150); // tiny TTL — the OLD bug fired it after the settle
    ctx.taskStore.register("generate-poster", async () => ({ urls: ["/api/files/ok.png"], note: "fast" }));
    const t = await s.submit("generate-poster", { prompt: "sync run", noWait: true });
    expect(t.progress).toBe("succeeded");
    // the fallback must not be armed: wait past its TTL and check for ghost events
    await new Promise((r) => setTimeout(r, 320));
    const forTask = events.filter((e) => e.taskId === t.taskId);
    expect(forTask.some((e) => e.event === "failed")).toBe(false); // B7: records must not lie
    // slot free again — the next submit is admitted immediately
    const t2 = await s.submit("generate-poster", { prompt: "again", noWait: true });
    expect(t2.progress).toBe("succeeded");
    s.dispose();
  });
});

describe("guarded submit — submit itself fails", () => {
  it("a validation error releases the reservation (no leak) and emits nothing", async () => {
    const ctx = await freshCtx();
    const events: GuardedJobEvent[] = [];
    const s = makeSubmitter(ctx, events, 60_000);
    // image-edit requires reference: string[] + prompt: string — junk types fail TaskStore validation
    await expect(s.submit("image-edit", { prompt: 123, reference: "not-an-array", noWait: true })).rejects.toThrow();
    expect(events.length).toBe(0);
    // the slot was never pinned: a good submit still runs
    ctx.taskStore.register("image-edit", async () => ({ urls: ["/api/files/ok2.png"] }));
    const t = await s.submit("image-edit", { prompt: "fix", reference: ["/api/files/in.png"], noWait: true });
    expect(t.progress).toBe("succeeded");
    s.dispose();
  });

  it("a THROWING event sink changes nothing — events are observability, never accounting", async () => {
    const ctx = await freshCtx();
    const s = createGuardedSubmitter({
      ctx: () => ctx, lane: "agent", source: "agent", fallbackTtlMs: 60_000,
      onJobEvent: () => { throw new Error("sink exploded"); },
    });
    ctx.taskStore.register("generate-poster", async () => ({ urls: ["/api/files/ok3.png"] }));
    const t = await s.submit("generate-poster", { prompt: "hostile sink", noWait: true });
    expect(t.progress).toBe("succeeded"); // the run completed…
    ctx.taskStore.register("generate-poster", async () => ({ urls: ["/api/files/ok4.png"] }));
    const t2 = await s.submit("generate-poster", { prompt: "next admitted", noWait: true }); // …and the slot is free
    expect(t2.progress).toBe("succeeded");
    s.dispose();
  });
});

describe("guarded submit — wedged background handler (fallback ONLY)", () => {
  it("the fallback TTL settles failed + releases the slot when onSettled never comes", async () => {
    const ctx = await freshCtx();
    const events: GuardedJobEvent[] = [];
    const s = makeSubmitter(ctx, events, 120);
    ctx.taskStore.register("generate-poster", async () => {
      await new Promise(() => {}); // wedged forever — past every provider timeout
    });
    const t = await s.submit("generate-poster", { prompt: "wedged", noWait: false });
    expect(t.progress).toBe("processing");
    // past the fallback TTL: one failed event + the slot must be free
    const terminal = await awaitTerminal(events, t.taskId, 1000);
    expect(terminal.event).toBe("failed");
    ctx.taskStore.register("generate-poster", async () => ({ urls: ["/api/files/after.png"] }));
    const next = await s.submit("generate-poster", { prompt: "after wedge", noWait: true });
    expect(next.progress).toBe("succeeded");
    s.dispose();
  });

  it("dispose() clears armed fallbacks — no late events after the lane shuts down", async () => {
    const ctx = await freshCtx();
    const events: GuardedJobEvent[] = [];
    const s = makeSubmitter(ctx, events, 120);
    ctx.taskStore.register("generate-poster", async () => {
      await new Promise(() => {}); // wedged
    });
    await s.submit("generate-poster", { prompt: "dispose me", noWait: false });
    s.dispose();
    events.length = 0;
    await new Promise((r) => setTimeout(r, 300));
    expect(events.length).toBe(0); // the timer was cleared, no ghost failed
  });
});
