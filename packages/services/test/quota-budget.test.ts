import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ImageProvider, LlmProvider, ImageGenResult } from "@oia/providers";
import { ProviderError } from "@oia/providers";
import { QuotaMeter, meterImage, meterLlm, createServiceContext } from "../src/index.js";

/**
 * Hard rule 6 (quota is money) — the meter ENFORCES optional daily budgets now;
 * it used to only count. The invariant under test: counters equal turns that
 * actually REACHED a provider. A refused turn throws quota_exceeded for free —
 * the provider is never called, so no money can burn past the budget.
 */

const imgResult = (): ImageGenResult => ({
  url: "data:image/png;base64,iVBORw0KGgo=",
  provider: "probe",
  model: "probe",
  width: 1024,
  height: 1025,
});

function probeImage(calls: number[]): ImageProvider {
  return {
    name: "probe",
    capabilities: {
      referenceImages: true,
      sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
      transparentBg: false,
      isMock: true,
    },
    isAvailable: async () => ({ ok: true, detail: "probe" }),
    generate: async () => {
      calls.push(1);
      return imgResult();
    },
  };
}

beforeEach(() => {
  delete (globalThis as unknown as { __oiaMeteredInFlight?: unknown }).__oiaMeteredInFlight;
});

describe("QuotaMeter daily budgets (enforcement)", () => {
  it("image budget 2 → third generate REFUSES for free: provider never called, counter stays at spent", async () => {
    const calls: number[] = [];
    const meter = new QuotaMeter({ imageDailyLimit: 2 });
    const image = meterImage(probeImage(calls), meter);

    await image.generate({ prompt: "one" });
    await image.generate({ prompt: "two" });
    expect(calls).toHaveLength(2);

    await expect(image.generate({ prompt: "three" })).rejects.toMatchObject({
      errorClass: "quota_exceeded",
    });
    expect(calls).toHaveLength(2); // the refusal reached no provider — no money burned
    const snap = meter.snapshot();
    expect(snap.image).toBe(2); // counters == turns that actually ran
    expect(snap.limitHits).toBe(1);
    expect(snap.limits).toEqual({ planner: null, image: 2 });
    expect(snap.limits.image).toBe(2);
  });

  it("the refusal message names the knob and the reset point", async () => {
    const meter = new QuotaMeter({ imageDailyLimit: 1 });
    const image = meterImage(probeImage([]), meter);
    await image.generate({ prompt: "spend it" });
    const err = await image.generate({ prompt: "over" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as Error).message).toContain("1/1");
    expect((err as Error).message).toContain("OIA_DAILY_IMAGE_LIMIT");
    expect((err as Error).message).toContain("midnight UTC");
  });

  it("llm budget applies to the planner lane the same way", async () => {
    let chats = 0;
    const llm: LlmProvider = {
      name: "probe-llm",
      capabilities: { referenceImages: false, sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false }, transparentBg: false, isMock: true },
      isAvailable: async () => ({ ok: true, detail: "probe" }),
      chat: async () => {
        chats += 1;
        return "{}";
      },
    };
    const meter = new QuotaMeter({ llmDailyLimit: 1 });
    const wrapped = meterLlm(llm, meter);
    await wrapped.chat([{ role: "user", content: "a" }]);
    await expect(wrapped.chat([{ role: "user", content: "b" }])).rejects.toMatchObject({ errorClass: "quota_exceeded" });
    expect(chats).toBe(1);
  });

  it("budgets reset at the UTC day roll (injected clock — no wall-clock waits)", async () => {
    let now = new Date("2026-10-30T12:00:00Z");
    const meter = new QuotaMeter({ imageDailyLimit: 1, clock: { now: () => now } });
    const image = meterImage(probeImage([]), meter);
    await image.generate({ prompt: "today's only one" });
    await expect(image.generate({ prompt: "still today" })).rejects.toMatchObject({ errorClass: "quota_exceeded" });

    now = new Date("2026-10-31T00:00:01Z"); // midnight UTC passed
    await expect(image.generate({ prompt: "new day" })).resolves.toBeDefined();
    const snap = meter.snapshot();
    expect(snap.day).toBe("2026-10-31");
    expect(snap.image).toBe(1); // fresh day, fresh budget
  });
});

describe("task lane under a budget (integration)", () => {
  it("OIA_DAILY_IMAGE_LIMIT=1 → first poster succeeds, the SECOND fails honestly with quota_exceeded", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "oia-quota-lane-"));
    const ctx = await createServiceContext({
      dataDir,
      env: { IMAGE_PROVIDER: "mock", LLM_PROVIDER: "mock", OIA_DAILY_IMAGE_LIMIT: "1" },
    });

    const first = await ctx.taskStore.submit("generate-poster", { prompt: "the one that fits" }, { noWait: true });
    expect(first.progress).toBe("succeeded");

    const second = await ctx.taskStore.submit("generate-poster", { prompt: "over budget" }, { noWait: true });
    expect(second.progress).toBe("failed"); // B7: the record tells the truth
    expect(second.errorClass).toBe("quota_exceeded");
    expect(second.msg).toContain("OIA_DAILY_IMAGE_LIMIT");
    expect(ctx.chat.meter.snapshot().image).toBe(1); // still exactly one spent turn
  });
});

describe("budget knob validation (fail fast at boot)", () => {
  it("a typo must not silently mean unlimited — createServiceContext refuses to boot", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "oia-quota-boot-"));
    await expect(
      createServiceContext({ dataDir, env: { IMAGE_PROVIDER: "mock", LLM_PROVIDER: "mock", OIA_DAILY_IMAGE_LIMIT: "twelve" } }),
    ).rejects.toMatchObject({ name: "ProviderConfigError" });
    await expect(
      createServiceContext({ dataDir, env: { IMAGE_PROVIDER: "mock", LLM_PROVIDER: "mock", OIA_DAILY_LLM_LIMIT: "-3" } }),
    ).rejects.toMatchObject({ name: "ProviderConfigError" });
  });
  it("0 is a valid budget: block-all (a demo kiosk, say), not a parse error", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "oia-quota-zero-"));
    const ctx = await createServiceContext({
      dataDir,
      env: { IMAGE_PROVIDER: "mock", LLM_PROVIDER: "mock", OIA_DAILY_IMAGE_LIMIT: "0" },
    });
    const t = await ctx.taskStore.submit("generate-poster", { prompt: "nothing allowed" }, { noWait: true });
    expect(t.progress).toBe("failed");
    expect(t.errorClass).toBe("quota_exceeded");
    expect(ctx.chat.meter.snapshot().image).toBe(0); // refused for free
  });
});
