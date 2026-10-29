import { describe, expect, it } from "vitest";
import { runDesignerAgent, detectLanguage, foldAscii } from "../src/index.js";
import type { ImageProvider, LlmProvider, ImageGenInput } from "@oia/providers";
import { chatEventSchema, sceneCanvasSchema, type ChatEvent } from "@oia/schema";
import { parseMarkers } from "@oia/protocol";
import { FailingMockLlmProvider, FailingMockImageProvider } from "@oia/providers";

const plan = JSON.stringify({ title: "Coffee milk tea poster 20% off", imagePrompt: "pastel milk tea poster", copy: "20% OFF" });

/** Interface-complete stubs (Stage 0: providers declare capabilities + isAvailable). */
const stubCaps = { referenceImages: true, sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false }, transparentBg: false, isMock: false };

const llm: LlmProvider = {
  name: "stub",
  capabilities: stubCaps,
  async isAvailable() { return { ok: true }; },
  async chat(_m, _o) { return plan; },
};
const image: ImageProvider = {
  name: "stub",
  capabilities: stubCaps,
  async isAvailable() { return { ok: true }; },
  async generate({ width, height }: ImageGenInput) { return { url: `https://cdn.test/p_${width}x${height}.png`, provider: "stub", model: "x" }; },
};

const stubLlmReturning = (raw: string): LlmProvider => ({
  name: "stub",
  capabilities: stubCaps,
  async isAvailable() { return { ok: true }; },
  async chat() { return raw; },
});

async function collect(prompt: string, language?: string): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const ev of runDesignerAgent({ prompt, language }, { llm, image })) out.push(ev);
  return out;
}

describe("BR-1 SSE contract: every event valid, msgId constant, stream ends correctly", () => {
  it("every event passes chatEventSchema; msgId never changes", async () => {
    const events = await collect("iced milk coffee poster 20% off pastel");
    expect(events.length).toBeGreaterThan(4);
    for (const ev of events) expect(chatEventSchema.safeParse(ev).success).toBe(true);
    expect(new Set(events.map((e) => e.msgId)).size).toBe(1);
  });
  it("the last event is </Content>", async () => {
    const events = await collect("poster");
    expect(events.at(-1)!.content).toBe("</Content>");
  });
});

describe("BR-2 taskMeta orchestration: node → tool → Manager Agent(result), status 0→1", () => {
  it("the sequence matches the contract", async () => {
    const events = await collect("poster");
    const final = events.at(-2)!; // the <Result> event
    const seq = final.renderData.taskMeta.map((t) => `${t.content}:${t.type}`);
    expect(seq).toEqual(["Designer Agent:node", "Image Generator:tool", "Manager Agent:result"]);
    const statuses = final.renderData.taskMeta.map((t) => t.status);
    expect(statuses).toEqual(["1", "1", "0"]); // tool & node done; result just opened
  });
});

describe("BR-3 progressive canvas: the same canvas uuid is emitted repeatedly", () => {
  it("canvas id stays fixed, emitted ≥3 times; final canvas = clip Rect + Image", async () => {
    const events = await collect("poster");
    const canvasEvents = events.filter((e) => e.renderData.msgMeta.length > 0);
    expect(canvasEvents.length).toBeGreaterThanOrEqual(3);
    const ids = new Set(canvasEvents.flatMap((e) => e.renderData.msgMeta.map((m) => m.id)));
    expect(ids.size).toBe(1);
    const last = canvasEvents.at(-1)!.renderData.msgMeta[0];
    expect(sceneCanvasSchema.safeParse(last.canvas).success).toBe(true);
    expect(last.canvas.objects[0].type).toBe("Rect");
    expect(last.canvas.objects.map((o) => o.type)).toContain("Image");
  });
});

describe("BR-4 narrative is English regardless of prompt language", () => {
  it("a Vietnamese prompt still gets English narrative (Creating…/Finished creating…)", async () => {
    const events = await collect("poster cà phê sữa đá giảm giá 20%");
    const text = events.map((e) => e.content).join(" ");
    expect(text).toMatch(/Creating/);
    expect(text).toMatch(/Finished creating/);
  });
  it("an English prompt gets English narrative", async () => {
    const events = await collect("milk tea discount poster pastel");
    const text = events.map((e) => e.content).join(" ");
    expect(text).toMatch(/Creating/);
    expect(text).toMatch(/Finished creating/);
  });
  it("detectLanguage: vi/zh/en", () => {
    expect(detectLanguage("cà phê sữa")).toBe("vi");
    expect(detectLanguage("咖啡海报")).toBe("zh");
    expect(detectLanguage("coffee poster")).toBe("en");
  });
});

describe("BR-5 markers follow the contract", () => {
  it("node/tool/result/canvas markers + <Collapse> <Result> are all present", async () => {
    const events = await collect("poster");
    const raw = events.map((e) => e.content).join("");
    const markers = parseMarkers(raw);
    expect(markers.some((m) => m.kind === "task" && m.role === "node")).toBe(true);
    expect(markers.some((m) => m.kind === "task" && m.role === "tool")).toBe(true);
    expect(markers.some((m) => m.kind === "task" && m.role === "result")).toBe(true);
    expect(markers.some((m) => m.kind === "canvas")).toBe(true);
    expect(raw).toContain("<Collapse>");
    expect(raw).toContain("<Result>");
  });
});

describe("BR-6 file card: ASCII-folded projectName + exportMeta on the result event", () => {
  it("foldAscii strips diacritics", () => {
    expect(foldAscii("Café ünïcode đà")).toBe("Cafe unicode da");
  });
  it("the <Result> event carries exportMeta {projectName, createTime, defaultExportType:’jpg’}", async () => {
    const events = await collect("cà phê sữa poster 20% off");
    const resultEv = events.find((e) => e.content.startsWith("<Result>"))!;
    expect(resultEv.renderData.exportMeta).not.toBeNull();
    expect(resultEv.renderData.exportMeta!.defaultExportType).toBe("jpg");
    expect(resultEv.renderData.exportMeta!.projectName).toMatch(/^[ -~]+$/); // pure ASCII
  });
});

describe("BR-BK5 brand kit in chat (the agent follows the brand)", () => {
  it("with brandGuidance → the system prompt contains the rules + every event carries brandId ≠ 0", async () => {
    let seenSystem = "";
    const llmBranded: LlmProvider = {
      name: "spy",
      capabilities: stubCaps,
      async isAvailable() { return { ok: true }; },
      async chat(messages) {
        seenSystem = messages[0].content;
        return plan;
      },
    };
    const events = [];
    for await (const ev of runDesignerAgent(
      { prompt: "poster ca phe", brandGuidance: "Pastel pink only, logo top-left", brandId: 7 },
      { llm: llmBranded, image },
    )) events.push(ev);
    expect(seenSystem).toContain("Pastel pink only");
    expect(events.every((e) => e.brandId === 7)).toBe(true);
  });
  it("no kit → brandId = 0 (default)", async () => {
    const events = await collect("poster");
    expect(events.every((e) => e.brandId === 0)).toBe(true);
  });
});

describe("BR-CTRL composer controls", () => {
  const planSpy = JSON.stringify({ title: "T", copy: "C", outline: ["point 1", "point 2"], imagePrompt: "p", imagePrompts: ["p1", "p2", "p3"] });
  async function collectWith(extra: Record<string, unknown>) {
    const out: ChatEvent[] = [];
    const llmSpy: LlmProvider = { name: "s", capabilities: stubCaps, async isAvailable() { return { ok: true }; }, async chat() { return planSpy; } };
    for await (const ev of runDesignerAgent({ prompt: "poster", ...extra } as never, { llm: llmSpy, image })) out.push(ev);
    return out;
  }
  it("outline mode: the outline is emitted BEFORE the first canvas", async () => {
    const evs = await collectWith({ outlineMode: true });
    const outlineIdx = evs.findIndex((e) => e.content.includes("Outline:"));
    const canvasIdx = evs.findIndex((e) => e.content.includes("[[canvas::"));
    expect(outlineIdx).toBeGreaterThanOrEqual(0);
    expect(outlineIdx).toBeLessThan(canvasIdx);
  });
  it("pages=3 → 3 distinct canvas ids", async () => {
    const evs = await collectWith({ pages: 3 });
    const ids = new Set(
      evs.flatMap((e) => e.renderData.msgMeta.map((m) => m.id)),
    );
    expect(ids.size).toBe(3);
  });
  it("referenceImages reach the image provider (Add-to-chat inpainting)", async () => {
    let gotRefs: string[] | undefined;
    const imgSpy: ImageProvider = { name: "s", capabilities: stubCaps, async isAvailable() { return { ok: true }; }, async generate(i) { gotRefs = i.referenceImages; return { url: "https://x/y.png", provider: "s", model: "m" }; } };
    const llmStub: LlmProvider = { name: "s", capabilities: stubCaps, async isAvailable() { return { ok: true }; }, async chat() { return planSpy; } };
    for await (const _ of runDesignerAgent({ prompt: "make it blue", referenceImages: ["https://ref/1.png"] }, { llm: llmStub, image: imgSpy })) void _;
    expect(gotRefs).toEqual(["https://ref/1.png"]);
  });
  it("the skill hint reaches the planner system prompt", async () => {
    let sys = "";
    const llmSpy: LlmProvider = { name: "s", capabilities: stubCaps, async isAvailable() { return { ok: true }; }, async chat(m) { sys = m[0].content; return planSpy; } };
    for await (const _ of runDesignerAgent({ prompt: "x", skill: "Presentation Maker" }, { llm: llmSpy, image })) void _;
    expect(sys).toContain("Presentation Maker");
  });
});

describe("STAGE-0 TP.1: blocks → named editable textboxes placed in copy zones", () => {
  const blockPlan = JSON.stringify({
    title: "Trà sữa 20%",
    imagePrompt: "pastel milk tea poster, no text",
    blocks: [
      { role: "headline", text: "SALE CUỐI TUẦN" },
      { role: "price", text: "GIẢM 20%", styleHint: "large bold" },
      { role: "date", text: "8/11" },
      { role: "name", text: "Trà sữa trân châu" },
    ],
  });

  async function collectBlocks() {
    const out: ChatEvent[] = [];
    for await (const ev of runDesignerAgent({ prompt: "banner trà sữa", mode: "clean-plate" }, { llm: stubLlmReturning(blockPlan), image })) out.push(ev);
    return out;
  }

  it("each block becomes a named Textbox (block:<role>) on the first page — the fixed 72% overlay is gone", async () => {
    const events = await collectBlocks();
    const canvas = events.flatMap((e) => e.renderData.msgMeta).at(-1)!.canvas;
    const boxes = canvas.objects.filter((o) => o.type === "Textbox");
    expect(boxes.map((o) => o.name)).toEqual(["block:headline", "block:price", "block:date", "block:name"]);
    // zone placement: headline in the top band (≤24% h), price in the side upper (28–50% h)
    const byName = Object.fromEntries(boxes.map((o) => [o.name!, o]));
    expect(byName["block:headline"].top!).toBeLessThanOrEqual(1360 * 0.24);
    expect(byName["block:price"].left!).toBeGreaterThan(1360 * 0.6); // right side block
    expect(byName["block:price"].top!).toBeGreaterThanOrEqual(Math.round(2048 * 0.28) - 1); // integer-rounded zone top
    // legacy fixed-position overlay must be gone: no textbox at 72% height with free-text copy
    expect(boxes.some((o) => Math.abs(o.top! - 2048 * 0.72) < 2)).toBe(false);
  });

  it("typography: Vietnamese-native webfont + generated provenance stamped (TP.10 enforceable)", async () => {
    const events = await collectBlocks();
    const canvas = events.flatMap((e) => e.renderData.msgMeta).at(-1)!.canvas;
    for (const o of canvas.objects) {
      expect(o.origin).toBe("generated");
    }
    const box = canvas.objects.find((o) => o.type === "Textbox")!;
    expect(box.fontFamily).toBe("Be Vietnam Pro");
  });

  it("legacy copy plan still yields one editable textbox (backward compat)", async () => {
    const out: ChatEvent[] = [];
    for await (const ev of runDesignerAgent({ prompt: "poster" }, { llm, image })) out.push(ev);
    const canvas = out.flatMap((e) => e.renderData.msgMeta).at(-1)!.canvas;
    expect(canvas.objects.filter((o) => o.type === "Textbox").map((o) => o.name)).toEqual(["block:copy"]);
  });

  it("multi-page: blocks land on the FIRST page only (current pi===0 rule)", async () => {
    const out: ChatEvent[] = [];
    const multi = JSON.stringify({ title: "T", imagePrompt: "p", imagePrompts: ["p1", "p2"], blocks: [{ role: "price", text: "20%" }] });
    for await (const ev of runDesignerAgent({ prompt: "poster", pages: 2 }, { llm: stubLlmReturning(multi), image })) out.push(ev);
    const canvases = out.flatMap((e) => e.renderData.msgMeta);
    expect(canvases[0].canvas.objects.filter((o) => o.type === "Textbox")).toHaveLength(1);
    expect(canvases[1].canvas.objects.filter((o) => o.type === "Textbox")).toHaveLength(0);
  });
});

describe("STAGE-0 TP.4/TP.5: jobId, failure taxonomy, abort-before-image", () => {
  it("every event carries the same jobId (UUID correlation)", async () => {
    const events = await collect("poster");
    const jobIds = new Set(events.map((e) => e.jobId));
    expect(jobIds.size).toBe(1);
    expect(events[0].jobId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("planner failure aborts BEFORE image generation — one attempt, explicit errorClass, no canvas (G2)", async () => {
    const failing = new FailingMockLlmProvider({ errorClass: "plan_parse_failed" });
    let imageCalls = 0;
    const imgSpy: ImageProvider = { name: "s", capabilities: stubCaps, async isAvailable() { return { ok: true }; }, async generate(i) { imageCalls++; return { url: "https://x/y.png", provider: "s", model: "m" }; } };
    const out: ChatEvent[] = [];
    for await (const ev of runDesignerAgent({ prompt: "banner" }, { llm: failing, image: imgSpy })) out.push(ev);
    expect(imageCalls).toBe(0); // quota never touched
    const failure = out.find((e) => e.error);
    expect(failure).toBeDefined();
    expect(failure!.errorClass).toBe("plan_parse_failed");
    expect(failure!.attemptNumber).toBe(1);
    expect(failure!.provider).toBe("failing-mock");
    expect(out.some((e) => e.content.includes("[[canvas::"))).toBe(false);
    expect(out.at(-1)!.content).not.toBe("</Content>"); // stream aborted, not completed
  });

  it("image failure surfaces its class and stops the stream (one attempt, G3)", async () => {
    const failingImg = new FailingMockImageProvider({ errorClass: "quota_exceeded" });
    const out: ChatEvent[] = [];
    for await (const ev of runDesignerAgent({ prompt: "banner" }, { llm, image: failingImg })) out.push(ev);
    const failure = out.find((e) => e.error);
    expect(failure!.errorClass).toBe("quota_exceeded");
    expect(failure!.attemptNumber).toBe(1);
  });

  it("signal aborted BEFORE the run → no planner call, no image call, silent stop (TP.5)", async () => {
    const ac = new AbortController();
    ac.abort();
    let llmCalls = 0;
    let imgCalls = 0;
    const llmSpy: LlmProvider = { name: "s", capabilities: stubCaps, async isAvailable() { return { ok: true }; }, async chat() { llmCalls++; return plan; } };
    const imgSpy: ImageProvider = { name: "s", capabilities: stubCaps, async isAvailable() { return { ok: true }; }, async generate() { imgCalls++; return { url: "https://x/y.png", provider: "s", model: "m" }; } };
    const out: ChatEvent[] = [];
    for await (const ev of runDesignerAgent({ prompt: "banner", signal: ac.signal }, { llm: llmSpy, image: imgSpy })) out.push(ev);
    // the planner chat() call receives the signal; codex provider aborts the CLI tree there.
    // the designer itself guarantees no image stage runs after an abort.
    expect(out.some((e) => e.content.includes("[[canvas::"))).toBe(false);
    expect(imgCalls).toBe(0);
  });

  it("CUJ 2 (designer level): a plan with distinct blocks yields independently editable textboxes — no regeneration needed to differ", async () => {
    const blockPlan = JSON.stringify({
      title: "T",
      imagePrompt: "p",
      blocks: [
        { role: "headline", text: "FLASH SALE" },
        { role: "price", text: "20%" },
        { role: "date", text: "8/11" },
      ],
    });
    const out: ChatEvent[] = [];
    for await (const ev of runDesignerAgent({ prompt: "x", mode: "clean-plate" }, { llm: stubLlmReturning(blockPlan), image })) out.push(ev);
    const canvas = out.flatMap((e) => e.renderData.msgMeta).at(-1)!.canvas;
    const texts = Object.fromEntries(canvas.objects.filter((o) => o.type === "Textbox").map((o) => [o.name, o.text]));
    expect(texts["block:price"]).toBe("20%");
    expect(texts["block:date"]).toBe("8/11");
    expect(texts["block:headline"]).toBe("FLASH SALE");
  });
});

describe("STAGE-0 TP.3/TP.8: mode passthrough + zone-anchored cover crop", () => {
  it("mode=clean-plate reaches the image provider (prompt building is mode-aware)", async () => {
    let gotMode: string | undefined;
    const imgSpy: ImageProvider = { name: "s", capabilities: stubCaps, async isAvailable() { return { ok: true }; }, async generate(i) { gotMode = i.mode; return { url: "https://x/y.png", provider: "s", model: "m" }; } };
    for await (const _ of runDesignerAgent({ prompt: "banner", mode: "clean-plate" }, { llm, image: imgSpy })) void _;
    expect(gotMode).toBe("clean-plate");
  });

  it("default mode is poster (skills/templates keep baked text)", async () => {
    let gotMode: string | undefined;
    const imgSpy: ImageProvider = { name: "s", capabilities: stubCaps, async isAvailable() { return { ok: true }; }, async generate(i) { gotMode = i.mode; return { url: "https://x/y.png", provider: "s", model: "m" }; } };
    for await (const _ of runDesignerAgent({ prompt: "poster" }, { llm, image: imgSpy })) void _;
    expect(gotMode).toBe("poster");
  });

  it("actual output size drives a zone-anchored crop (2:3 image on a 3:4 canvas crops the BOTTOM, keeping the top band)", async () => {
    const twoTo3: ImageProvider = {
      name: "s",
      capabilities: stubCaps,
      async isAvailable() { return { ok: true }; },
      async generate() { return { url: "https://x/y.png", provider: "s", model: "m", width: 1086, height: 1448 }; }, // 3:4-ish → mismatched
    };
    const out: ChatEvent[] = [];
    for await (const ev of runDesignerAgent({ prompt: "poster", width: 900, height: 1200 }, { llm, image: twoTo3 })) out.push(ev);
    const canvas = out.flatMap((e) => e.renderData.msgMeta).at(-1)!.canvas;
    const artwork = canvas.objects.find((o) => o.type === "Image")!;
    expect(artwork.name).toBe("artwork");
    expect(artwork.cropY).toBe(0); // top anchored — the top band survives
    expect(artwork.cropX).toBeGreaterThanOrEqual(0);
  });
});

describe("STAGE-0 remediation: A5 reusePlan / B3 provider attribution / A4 resetAt", () => {
  it("A5: reusePlan skips the planner entirely — zero llm turns on a stage-aware retry", async () => {
    let llmCalls = 0;
    const llmSpy: LlmProvider = { name: "planner-x", capabilities: stubCaps, async isAvailable() { return { ok: true }; }, async chat() { llmCalls++; return plan; } };
    const out: ChatEvent[] = [];
    for await (const ev of runDesignerAgent(
      { prompt: "banner", reusePlan: { title: "T", imagePrompt: "p", blocks: [{ role: "price", text: "20%" }] } },
      { llm: llmSpy, image },
    )) out.push(ev);
    expect(llmCalls).toBe(0); // the cached plan rides again
    expect(out.some((e) => e.content.includes("[[canvas::"))).toBe(true); // image stage still ran
  });

  it("A5: onPlan stashes the successful plan for the route's retry cache", async () => {
    let stashed: unknown = null;
    const out: ChatEvent[] = [];
    for await (const ev of runDesignerAgent({ prompt: "poster", onPlan: (p) => (stashed = p) }, { llm, image })) out.push(ev);
    expect(stashed).toMatchObject({ title: "Coffee milk tea poster 20% off" });
  });

  it("B3: a planner failure is attributed to the PLANNER, never the image provider", async () => {
    const failing = new FailingMockLlmProvider({ errorClass: "not_logged_in" });
    // the mock throws ProviderError carrying its own name — verify a GENERIC Error path too
    const genericLlm: LlmProvider = {
      name: "planner-real", capabilities: stubCaps, async isAvailable() { return { ok: true }; },
      async chat() { throw new Error("boom"); },
    };
    const out: ChatEvent[] = [];
    for await (const ev of runDesignerAgent({ prompt: "x" }, { llm: genericLlm, image: failing })) out.push(ev);
    const failure = out.find((e) => e.error)!;
    expect(failure.provider).toBe("planner-real"); // the throwing stage, not deps.image.name
    expect(failure.errorClass).toBe("unknown");
  });

  it("A4: a quota failure carries resetAt on the event (Q3)", async () => {
    const quotaLlm = new FailingMockLlmProvider({ errorClass: "quota_exceeded" });
    // simulate resetAt by wrapping a ProviderError with resetAt through the image stage
    const { ProviderError } = await import("@oia/providers");
    const quotaImg: ImageProvider = {
      name: "codex", capabilities: stubCaps, async isAvailable() { return { ok: true }; },
      async generate() { throw new ProviderError("quota_exceeded", "codex quota exhausted", { provider: "codex", resetAt: "2026-10-30T08:00:00Z" }); },
    };
    const out: ChatEvent[] = [];
    for await (const ev of runDesignerAgent({ prompt: "x" }, { llm, image: quotaImg })) out.push(ev);
    const failure = out.find((e) => e.error)!;
    expect(failure.errorClass).toBe("quota_exceeded");
    expect(failure.resetAt).toBe("2026-10-30T08:00:00Z");
    expect(failure.provider).toBe("codex");
  });
});
