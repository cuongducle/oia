import { describe, expect, it } from "vitest";
import { MockImageProvider, placeholderPng } from "../src/image/mock.js";

/** The mock's determinism contract the A1 shot gate leans on: different prompt →
 * different bytes (different asset key after dedupe), same prompt → identical. */
describe("placeholderPng — deterministic per prompt", () => {
  it("same prompt → byte-identical data URL", () => {
    expect(placeholderPng("make the background pastel")).toBe(placeholderPng("make the background pastel"));
  });

  it("different prompts → different images (the swap gate depends on this)", () => {
    expect(placeholderPng("banner trà sữa giảm 20%")).not.toBe(placeholderPng("make the background pastel"));
  });

  it("emits a valid PNG (signature + IHDR dims), not just any base64", () => {
    const b64 = placeholderPng("x").replace(/^data:image\/png;base64,/, "");
    const bytes = Buffer.from(b64, "base64");
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.readUInt32BE(16)).toBe(8); // IHDR width
    expect(bytes.readUInt32BE(20)).toBe(8); // IHDR height
  });

  it("empty prompt is a valid distinct image (never throws)", () => {
    expect(placeholderPng("")).toMatch(/^data:image\/png;base64,/);
  });
});

describe("MockImageProvider", () => {
  it("generate returns the prompt-derived placeholder with mock identity", async () => {
    const p = new MockImageProvider();
    const a = await p.generate({ prompt: "a", width: 8, height: 8 });
    const b = await p.generate({ prompt: "b", width: 8, height: 8 });
    expect(a.provider).toBe("mock");
    expect(a.model).toBe("placeholder-offline");
    expect(a.url).not.toBe(b.url);
    expect((await p.isAvailable()).ok).toBe(true);
  });
});

/* ---------- C1: the mock planner honors the gate instructions (llm) ---------- */
import { MockLlmProvider } from "../src/llm/mock.js";
import { PLANNER_INSTRUCTIONS } from "@oia/schema";

  it("matchers DERIVE from PLANNER_INSTRUCTIONS — rewording the constant keeps the mock in sync", async () => {
    const local = new MockLlmProvider();
    const ask = (system: string) => local.chat([
      { role: "system" as const, content: system },
      { role: "user" as const, content: "deck" },
    ]);
    const plan2 = JSON.parse(await ask(`You are a planner. ${PLANNER_INSTRUCTIONS.imagePrompts(2)}`)) as { imagePrompts?: string[] };
    expect(plan2.imagePrompts).toHaveLength(2);
    const planGate = JSON.parse(await ask(`You are a planner. ${PLANNER_INSTRUCTIONS.pageOutline(4)}`)) as { pageOutline?: unknown[] };
    expect(planGate.pageOutline).toHaveLength(4);
  });

describe("MockLlmProvider — prompt-aware planning (C1 gate flows need it)", () => {
  const llm = new MockLlmProvider();
  const msgs = (system: string) => [
    { role: "system" as const, content: system },
    { role: "user" as const, content: "sales deck" },
  ];

  it("outline-gate instruction → pageOutline with EXACTLY N rows", async () => {
    const raw = await llm.chat(msgs("Also return pageOutline[] — EXACTLY 3 entries {title, summary}, one per page in order (Outline Gate)."));
    const plan = JSON.parse(raw) as { pageOutline?: { title: string; summary: string }[] };
    expect(plan.pageOutline).toHaveLength(3);
    expect(plan.pageOutline?.[0]?.title).toBe("Page 1");
  });

  it("approved-outline instruction → imagePrompts with EXACTLY N entries (distinct — per-page images differ)", async () => {
    const raw = await llm.chat(msgs("Produce exactly 2 imagePrompts[] (one per page, coherent series)."));
    const plan = JSON.parse(raw) as { imagePrompts?: string[] };
    expect(plan.imagePrompts).toHaveLength(2);
    expect(new Set(plan.imagePrompts).size).toBe(2);
  });

  it("no instructions → legacy canned plan (smoke/shot single-page flows unchanged)", async () => {
    const raw = await llm.chat(msgs("You are a poster/banner planner."));
    const plan = JSON.parse(raw) as { pageOutline?: unknown; imagePrompts?: unknown; copy?: string };
    expect(plan.pageOutline).toBeUndefined();
    expect(plan.imagePrompts).toBeUndefined();
    expect(plan.copy).toBe("GIẢM GIÁ 20%");
  });
});
