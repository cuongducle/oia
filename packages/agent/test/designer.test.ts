import { describe, expect, it } from "vitest";
import { runDesignerAgent, detectLanguage, foldAscii } from "../src/index.js";
import type { ImageProvider, LlmProvider } from "@pixforge/providers";
import { chatEventSchema, sceneCanvasSchema, type ChatEvent } from "@pixforge/schema";
import { parseMarkers } from "@pixforge/protocol";

const plan = JSON.stringify({ title: "Coffee milk tea poster 20% off", imagePrompt: "pastel milk tea poster", copy: "20% OFF" });

const llm: LlmProvider = {
  name: "stub",
  async chat(_m, _o) { return plan; },
};
const image: ImageProvider = {
  name: "stub",
  async generate({ width, height }) { return { url: `https://cdn.test/p_${width}x${height}.png`, provider: "stub", model: "x" }; },
};

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
    const llmSpy: LlmProvider = { name: "s", async chat() { return planSpy; } };
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
    const imgSpy: ImageProvider = { name: "s", async generate(i) { gotRefs = i.referenceImages; return { url: "https://x/y.png", provider: "s", model: "m" }; } };
    const llmStub: LlmProvider = { name: "s", async chat() { return planSpy; } };
    for await (const _ of runDesignerAgent({ prompt: "make it blue", referenceImages: ["https://ref/1.png"] }, { llm: llmStub, image: imgSpy })) void _;
    expect(gotRefs).toEqual(["https://ref/1.png"]);
  });
  it("the skill hint reaches the planner system prompt", async () => {
    let sys = "";
    const llmSpy: LlmProvider = { name: "s", async chat(m) { sys = m[0].content; return planSpy; } };
    for await (const _ of runDesignerAgent({ prompt: "x", skill: "Presentation Maker" }, { llm: llmSpy, image })) void _;
    expect(sys).toContain("Presentation Maker");
  });
});
