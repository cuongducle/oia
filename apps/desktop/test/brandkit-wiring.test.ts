import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServiceContext, runChat, type ServiceContext } from "@oia/services";
import type { LlmProvider, LlmMessage } from "@oia/providers";

/**
 * Reorg step 4d gate — "brandkit lưu → generation nhận guidance": the WIRING from
 * the panel's store save to the planner prompt. (The agent-level prompt rule is
 * covered by @oia/agent designer tests; this proves the desktop context actually
 * resolves the ACTIVE kit and threads its guidance into the LLM call.)
 *
 * The stub LLM captures the request then throws — the pipeline stops
 * deterministically and the assertion never couples to the plan schema.
 */

describe("brand kit wiring — an active kit reaches the next generation", () => {
  let ctx: ServiceContext;
  const seen: { messages: LlmMessage[] }[] = [];

  beforeAll(async () => {
    const root = mkdtempSync(path.join(tmpdir(), "oia-brandkit-wiring-"));
    ctx = await createServiceContext({
      dataDir: path.join(root, "data"),
      env: { ...process.env, IMAGE_PROVIDER: "mock", LLM_PROVIDER: "mock" },
    });
    const capture: LlmProvider = {
      name: "capture-stub",
      capabilities: { isMock: true },
      isAvailable: async () => ({ ok: true, detail: "stub" }),
      chat: async (messages) => {
        seen.push({ messages });
        throw new Error("stop after capture");
      },
    };
    (ctx.chat as { llm: unknown }).llm = capture;
  }, 60_000);

  it("no kit → no guidance line; save a default kit → its guidance lands in the planner messages", async () => {
    await runChat({ prompt: "banner trà sữa" }, ctx, { sink: () => {} });
    const before = seen[seen.length - 1].messages.map((m) => m.content).join("\n");
    expect(before).not.toContain("Pastel colors only");

    await ctx.brandKits.upsert({ name: "Pastel Tea", guidance: "Pastel colors only", applyByDefault: true });

    await runChat({ prompt: "banner trà sữa lần 2" }, ctx, { sink: () => {} });
    const after = seen[seen.length - 1].messages.map((m) => m.content).join("\n");
    expect(after).toContain("Pastel colors only"); // BR-BK5: the active kit drives the planner
  });

  it("explicit brandKitId wins over the active kit (same resolution as the web route)", async () => {
    const other = await ctx.brandKits.upsert({ name: "Bold Coffee", guidance: "Bold high-contrast palette" });
    await runChat({ prompt: "banner cà phê", brandKitId: other.id }, ctx, { sink: () => {} });
    const text = seen[seen.length - 1].messages.map((m) => m.content).join("\n");
    expect(text).toContain("Bold high-contrast palette");
    expect(text).not.toContain("Pastel colors only");
  });
});
