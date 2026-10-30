import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServiceContext, type ServiceContext } from "../src/index.js";

/**
 * T1 regression — the task lane must run on the SAME env-configured, quota-metered
 * providers as chat. Old wiring handed processors a bare getImageProvider() call:
 * in the utility process process.env.IMAGE_PROVIDER is never set (main sends it
 * via the init RPC), so every agent task silently ran MockImageProvider and the
 * QuotaMeter never saw it — even with the app configured for codex.
 */

async function freshCtx(env: NodeJS.ProcessEnv = {}): Promise<ServiceContext> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "oia-tasklane-"));
  return createServiceContext({ dataDir, env });
}

beforeEach(() => {
  delete (globalThis as unknown as { __oiaMeteredInFlight?: unknown }).__oiaMeteredInFlight;
});

describe("task lane wiring (T1)", () => {
  it("a task generation is counted by the SAME QuotaMeter chat uses — processors hold ctx.chat.image", async () => {
    // Two regressions in one assertion path: the ONLY object that increments this
    // meter is the meterImage wrapper built in createServiceContext. Old wiring
    // handed processors a bare getImageProvider() call (process.env lookup in the
    // utility process — IMAGE_PROVIDER never set there), so tasks ran the silent
    // mock AND the meter never moved. Provider identity itself is pinned by the
    // ProcCtx probe test in packages/tasks/test/processors.test.ts.
    const ctx = await freshCtx(); // mock pair — metering still applies (meterImage wraps mock too)
    const before = ctx.chat.meter.snapshot().image;
    const status = await ctx.taskStore.submit("generate-poster", { prompt: "meter me" }, { noWait: true });
    expect(status.progress).toBe("succeeded");
    expect(ctx.chat.meter.snapshot().image).toBe(before + 1); // OLD code: before + 0
  });
});
