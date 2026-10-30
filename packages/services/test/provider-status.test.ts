import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServiceContext, providerStatusSnapshot, type ServiceContext } from "../src/index.js";
import { MockImageProvider, MockLlmProvider } from "@oia/providers";

/**
 * Reorg step 5 — coverage-matrix cell re-homed from the web chat-cancel test
 * ("provider status exposes capabilities + quota counters, mock labeled isMock").
 * The desktop runtime panel renders this snapshot over IPC; it needs a gate too.
 */

async function ctxWithMockProviders(): Promise<ServiceContext> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "oia-pstatus-"));
  const ctx = await createServiceContext({ dataDir, env: {} });
  (ctx.chat as { image: unknown }).image = new MockImageProvider();
  (ctx.chat as { llm: unknown }).llm = new MockLlmProvider();
  return ctx;
}

describe("TP.6 providerStatusSnapshot (the runtime panel's data source)", () => {
  it("exposes both providers with capabilities — and a mock provider is labeled isMock", async () => {
    const ctx = await ctxWithMockProviders();
    const snap = await providerStatusSnapshot(ctx);
    expect(snap.image.name).toBeTruthy();
    expect(snap.image.capabilities).toHaveProperty("isMock", true);
    expect(snap.llm.capabilities).toHaveProperty("isMock", true);
    expect(snap.image.diagnostic.ok).toBe(true);
  });

  it("quota counters ride along (zero on a fresh context) and persistence health is an array", async () => {
    const ctx = await ctxWithMockProviders();
    const snap = await providerStatusSnapshot(ctx);
    expect(snap.quota.image).toBe(0);
    expect(Array.isArray(snap.persistence)).toBe(true);
    expect(snap.persistence).toHaveLength(0); // healthy disk → no entries (B7)
  });
});
