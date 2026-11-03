import { describe, expect, it } from "vitest";
import { runDesignerAgent, decodeDataImage, parseEvalRead, criticPrompt, type DesignerAgentDeps } from "../src/index.js";
import { REFINE_INSTRUCTION, RESEARCH_INSTRUCTION, EVAL_READ_MARKER, evalReadSchema } from "@oia/schema";
import type { ImageProvider, LlmProvider, LlmChatOpts, ImageGenInput } from "@oia/providers";
import { MockLlmProvider } from "@oia/providers";
import type { ChatEvent, ProviderCapabilities } from "@oia/schema";

/**
 * DA gates (designer-agent-loop.md, slice 1 + 2). Error paths FIRST per
 * docs/reference/test-antipatterns: a parse-failed critic, a cancelled refine,
 * a refused refine and an exhausted budget must each keep the quota honest
 * (zero extra burn, the best image survives, the record says what happened).
 */

const caps = (extra: Partial<ProviderCapabilities> = {}): ProviderCapabilities => ({
  referenceImages: true,
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock: false,
  ...extra,
});

const evalJson = (verdict: "pass" | "fail", text = 9) =>
  JSON.stringify({ verdict, scores: { text, brand: 8, fidelity: 8, composition: 8 }, issues: verdict === "fail" ? ["mock issue"] : [], fixHints: verdict === "fail" ? ["mock hint"] : [] });

/** One data-URL image per call — the critic needs decodable pixels. */
const png1x1 = () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function countingImage(): { provider: ImageProvider; calls: () => number; urls: () => string[] } {
  let n = 0;
  const urls: string[] = [];
  return {
    calls: () => n,
    urls: () => urls,
    provider: {
      name: "counting", capabilities: caps(), async isAvailable() { return { ok: true }; },
      async generate(i: ImageGenInput) {
        n += 1;
        const url = png1x1();
        urls.push(url + `#call-${n}-${i.prompt.includes("(refined") ? "refined" : "initial"}`);
        return { url: urls.at(-1)!, provider: "counting", model: "x", width: 8, height: 8 };
      },
    },
  };
}

const plan = JSON.stringify({ title: "Milk tea 20% off", imagePrompt: "pastel milk tea poster", copy: "20% OFF" });

const llmReturning = (raw: string): LlmProvider => ({
  name: "stub", capabilities: caps(), async isAvailable() { return { ok: true }; },
  async chat() { return raw; },
  async readImage() { return evalJson("pass"); },
});

async function run(input: Parameters<typeof runDesignerAgent>[0], deps: DesignerAgentDeps): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const ev of runDesignerAgent(input, deps)) out.push(ev);
  return out;
}

describe("DA-3 helpers", () => {
  it("decodeDataImage: data URLs decode; everything else is null (no pretending)", () => {
    expect(decodeDataImage(png1x1())).toBeInstanceOf(Uint8Array);
    expect(decodeDataImage("https://cdn.test/x.png")).toBeNull();
    expect(decodeDataImage("data:image/png;base64,%%%")).toBeInstanceOf(Uint8Array); // Buffer is lenient; parseEvalRead guards shape
  });
  it("parseEvalRead: strict on shape, tolerant of fences (parsePlannerPlan pattern)", () => {
    expect(parseEvalRead(evalJson("pass"))?.verdict).toBe("pass");
    expect(parseEvalRead("```json\n" + evalJson("pass") + "\n```")?.verdict).toBe("pass");
    expect(parseEvalRead("not json")).toBeNull();
    expect(parseEvalRead(JSON.stringify({ verdict: "pass" }))).toBeNull(); // missing scores
  });
  it("criticPrompt: mode-aware criteria + the stable marker (DA-8)", () => {
    const poster = criticPrompt({ mode: "poster", title: "T", pagePrompt: "p", intendedCopy: ["SALE 20%"] });
    const plate = criticPrompt({ mode: "clean-plate", title: "T", pagePrompt: "p", intendedCopy: ["SALE 20%"] });
    expect(poster).toContain("TEXT (heaviest weight)");
    expect(poster).toContain("match the intended copy EXACTLY");
    expect(plate).toContain("TEXT-ZONE (heaviest weight)");
    expect(poster.endsWith(EVAL_READ_MARKER)).toBe(true);
    expect(plate.endsWith(EVAL_READ_MARKER)).toBe(true);
  });
});

describe("DA slice 1 — research rides the planner turn (DA-1/DA-2)", () => {
  it("capability present: instruction in the system prompt, search flag on the chat opts, timeline narrates, notes surface", async () => {
    const systems: string[] = [];
    const optsSeen: LlmChatOpts[] = [];
    const spy: LlmProvider = {
      name: "codex", capabilities: caps({ webSearch: true }), async isAvailable() { return { ok: true }; },
      async chat(m, o) {
        systems.push(m[0].content);
        optsSeen.push(o ?? {});
        return JSON.stringify({ title: "T", imagePrompt: "p", researchNotes: ["Tet 2026 is Feb 17 (vnexpress.net)"] });
      },
    };
    const img = countingImage();
    const out = await run({ prompt: "banner tết giảm giá", research: true }, { llm: spy, image: img.provider });
    expect(systems[0]).toContain(RESEARCH_INSTRUCTION);
    expect(optsSeen[0]?.search).toBe(true);
    const narrative = out.map((e) => e.content).join("\n");
    expect(narrative).toContain("Research notes:");
    expect(narrative).toContain("(vnexpress.net)");
    // timeline: the research node opened first and closed (status 1)
    const researchNode = out.at(-1)!.renderData.taskMeta.find((t) => t.content === "Researching the web");
    expect(researchNode?.status).toBe("1");
    const firstFrame = out.find((e) => e.content.includes("<Collapse>"))!;
    expect(firstFrame.renderData.taskMeta[0].content).toBe("Researching the web");
  });

  it("DA-2 error path: no capability → announced, NEVER silently skipped, job completes from the prompt alone", async () => {
    const img = countingImage();
    const out = await run({ prompt: "banner", research: true }, { llm: llmReturning(plan), image: img.provider });
    expect(out.map((e) => e.content).join("\n")).toContain("Research unavailable on stub — generating from the prompt alone.");
    expect(img.calls()).toBe(1); // the job ran to completion
    expect(out.at(-1)?.content).toBe("</Content>");
  });

  it("research off (default) → no instruction, no search flag, no node", async () => {
    const optsSeen: LlmChatOpts[] = [];
    const spy: LlmProvider = {
      name: "codex", capabilities: caps({ webSearch: true }), async isAvailable() { return { ok: true }; },
      async chat(_m, o) { optsSeen.push(o ?? {}); return plan; },
    };
    const out = await run({ prompt: "banner" }, { llm: spy, image: countingImage().provider });
    expect(optsSeen[0]?.search).toBeUndefined();
    expect(out.some((e) => e.content.includes("Researching the web"))).toBe(false);
  });

  it("reusePlan skips the planner — research never re-runs on a retry", async () => {
    let chats = 0;
    const spy: LlmProvider = {
      name: "codex", capabilities: caps({ webSearch: true }), async isAvailable() { return { ok: true }; },
      async chat() { chats++; return plan; },
    };
    await run({ prompt: "banner", research: true, reusePlan: { title: "T", imagePrompt: "p" } }, { llm: spy, image: countingImage().provider });
    expect(chats).toBe(0);
  });
});

describe("DA slice 2 — Auto refine loop (DA-3..DA-8), error paths first", () => {
  it("GATE (a): critic parse fail → stop, keep this version, ZERO extra burn", async () => {
    const img = countingImage();
    const brokenCritic: LlmProvider = {
      name: "stub", capabilities: caps(), async isAvailable() { return { ok: true }; },
      async chat() { return plan; },
      async readImage() { return "the critic babbled — not JSON"; },
    };
    const out = await run({ prompt: "banner", selfImprove: { rounds: 2 } }, { llm: brokenCritic, image: img.provider });
    expect(img.calls()).toBe(1); // no refine image was generated
    expect(out.map((e) => e.content).join("\n")).toContain("Auto refine check unavailable — keeping this version.");
    const canvasEv = out.find((e) => e.renderData.msgMeta.length > 0)!;
    expect(canvasEv.renderData.selfImprove).toEqual({ rounds: 0, verdict: "best-effort", issues: [] });
  });

  it("GATE (a2): critic throws (network/quota) → same G2 contract — keep, stop, no extra burn", async () => {
    const img = countingImage();
    const throwingCritic: LlmProvider = {
      name: "stub", capabilities: caps(), async isAvailable() { return { ok: true }; },
      async chat() { return plan; },
      async readImage() { throw new Error("vision provider down"); },
    };
    const out = await run({ prompt: "banner", selfImprove: { rounds: 1 } }, { llm: throwingCritic, image: img.provider });
    expect(img.calls()).toBe(1);
    expect(out.find((e) => e.renderData.msgMeta.length)!.renderData.selfImprove).toEqual({ rounds: 0, verdict: "best-effort", issues: [] });
  });

  it("GATE (b): cancel mid-refine → the best already-generated image is still yielded (OC-4 semantics)", async () => {
    const ac = new AbortController();
    let n = 0;
    const img: ImageProvider = {
      name: "paged", capabilities: caps(), async isAvailable() { return { ok: true }; },
      async generate() {
        n += 1;
        if (n === 2) ac.abort("user-stop"); // Stop during the refine regeneration
        return { url: png1x1(), provider: "paged", model: "x", width: 8, height: 8 };
      },
    };
    const out = await run({ prompt: "banner", selfImprove: { rounds: 1 }, signal: ac.signal }, { llm: new MockLlmProvider(), image: img });
    expect(n).toBe(2); // initial + the refine regen that tripped the abort
    expect(out.some((e) => e.renderData.msgMeta.some((m) => m.type === "canvas"))).toBe(true); // a canvas survived
    expect(out.at(-1)?.content).not.toBe("</Content>"); // stream aborted, not completed
  });

  it("refine-planner returns garbage → keep this version (no image re-burn)", async () => {
    const img = countingImage();
    let refineTurns = 0;
    const garbageRefine: LlmProvider = {
      name: "stub", capabilities: caps(), async isAvailable() { return { ok: true }; },
      async chat(m) {
        if (m[0].content.includes(REFINE_INSTRUCTION)) { refineTurns++; return "definitely not a plan"; }
        return plan;
      },
      async readImage() { return evalJson("fail"); },
    };
    const out = await run({ prompt: "banner", selfImprove: { rounds: 1 } }, { llm: garbageRefine, image: img.provider });
    expect(refineTurns).toBe(1);
    expect(img.calls()).toBe(1); // no second image
    const canvasEv = out.find((e) => e.renderData.msgMeta.length > 0)!;
    expect(canvasEv.renderData.selfImprove).toMatchObject({ rounds: 0, verdict: "best-effort" });
    expect(out.map((e) => e.content).join("\n")).toContain("could not revise the prompt");
  });

  it("happy loop (mock pair): fail → refine → pass — 2 images, verdict persisted, timeline narrates both checks", async () => {
    const img = countingImage();
    const out = await run({ prompt: "banner", selfImprove: { rounds: 1 } }, { llm: new MockLlmProvider(), image: img.provider });
    expect(img.calls()).toBe(2); // initial + refined
    const canvasEv = out.find((e) => e.renderData.msgMeta.length > 0)!;
    expect(canvasEv.renderData.selfImprove).toMatchObject({ rounds: 1, verdict: "pass" });
    // the refined prompt rode the fixHint (mock refine honors REFINE_INSTRUCTION)
    expect(img.urls()[1]).toContain("refined");
    const timeline = out.find((e) => e.content.includes("<Result>"))!.renderData.taskMeta.map((t) => t.content);
    expect(timeline).toContain("Checking round 1");
    expect(timeline).toContain("Refining");
    expect(timeline).toContain("Checking round 2");
    // DA-6: the verdict rides the terminal events too (persistence + replay)
    expect(out.at(-1)!.renderData.selfImprove).toMatchObject({ rounds: 1, verdict: "pass" });
  });

  it("DA-3 best-effort: all checks fail → the best-scoring candidate wins and the record says best-effort", async () => {
    const img = countingImage();
    let reads = 0;
    const alwaysFail: LlmProvider = {
      name: "stub", capabilities: caps(), async isAvailable() { return { ok: true }; },
      async chat(m) {
        if (m[0].content.includes(REFINE_INSTRUCTION)) return JSON.stringify({ title: "T", imagePrompt: "revised poster prompt" });
        return plan;
      },
      async readImage() {
        reads += 1;
        // first candidate scores 6, the refined one scores 8 — the refined image must win
        return evalJson("fail", reads === 1 ? 6 : 8);
      },
    };
    const out = await run({ prompt: "banner", selfImprove: { rounds: 1 } }, { llm: alwaysFail, image: img.provider });
    expect(img.calls()).toBe(2);
    const canvasEv = out.find((e) => e.renderData.msgMeta.length > 0)!;
    expect(canvasEv.renderData.selfImprove).toMatchObject({ rounds: 1, verdict: "best-effort", issues: ["mock issue"] });
    // the winner is candidate 2 (higher total) — its artwork object carries the refined URL
    expect(canvasEv.renderData.msgMeta[0].thumbnail).toBe(img.urls()[1]);
  });

  it("default OFF: no selfImprove → zero check events, wire untouched", async () => {
    const img = countingImage();
    const out = await run({ prompt: "banner" }, { llm: new MockLlmProvider(), image: img.provider });
    expect(img.calls()).toBe(1);
    expect(out.some((e) => e.content.includes("Checking round"))).toBe(false);
    expect(out.at(-1)!.renderData.selfImprove).toBeUndefined();
  });

  it("rounds: 0 → loop skipped (explicit off), cap enforcement lives at the wire schema (services)", async () => {
    const img = countingImage();
    const out = await run({ prompt: "banner", selfImprove: { rounds: 0 } }, { llm: new MockLlmProvider(), image: img.provider });
    expect(img.calls()).toBe(1);
    expect(out.some((e) => e.content.includes("Checking round"))).toBe(false);
  });
});
