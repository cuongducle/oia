import { describe, expect, it } from "vitest";
import { runDesignerAgent, decodeDataImage, parseEvalRead, criticPrompt, surgicalEditPrompt, isStochasticMiss, type DesignerAgentDeps } from "../src/index.js";
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

const evalJson = (verdict: "pass" | "fail", textHandling = 9, scope: "localized" | "global" = "global", issues: string[] = verdict === "fail" ? ["mock issue"] : []) =>
  JSON.stringify({ verdict, scope, scores: { textHandling, brand: 8, fidelity: 8, composition: 8, realism: 8 }, issues, fixHints: verdict === "fail" ? ["mock hint"] : [] });

/** One data-URL image per call — the critic needs decodable pixels. */
const png1x1 = () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function countingImage(): { provider: ImageProvider; calls: () => number; urls: () => string[]; inputs: () => ImageGenInput[] } {
  let n = 0;
  const urls: string[] = [];
  const inputs: ImageGenInput[] = [];
  return {
    calls: () => n,
    urls: () => urls,
    inputs: () => inputs,
    provider: {
      name: "counting", capabilities: caps(), async isAvailable() { return { ok: true }; },
      async generate(i: ImageGenInput) {
        n += 1;
        inputs.push({ ...i });
        const url = png1x1();
        urls.push(url + `#call-${n}-${i.prompt.includes("(refined") ? "refined" : i.prompt.includes("Edit Image 1") ? "edit" : "initial"}`);
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
  it("criticPrompt: mode-aware criteria + the stable marker (DA-8); no duplicated copy (teardown #11)", () => {
    const poster = criticPrompt({ mode: "poster", title: "T", pagePrompt: "poster with 'SALE 20%'", overlayCopy: [] });
    const plate0 = criticPrompt({ mode: "clean-plate", title: "T", pagePrompt: "p", overlayCopy: ["SALE 20%"] });
    const plateN = criticPrompt({ mode: "clean-plate", title: "T", pagePrompt: "p", overlayCopy: [] });
    // v3.2 (2026-11-05): realism axis + scope routing — the anti-slop axes a
    // blind A/B proved a vision judge can score (docs/research/image-prompt-craft.md)
    for (const p of [poster, plate0, plateN]) {
      expect(p).toContain("REALISM");
      expect(p).toContain("stock photo with text stamped on");
      expect(p).toContain('scope: "localized"');
    }
    // v2 (2026-11-03): anchors, transcribe-first, anti-leniency
    for (const p of [poster, plate0, plateN]) {
      expect(p).toContain("SCORE BANDS");
      expect(p).toContain("take the LOWER one");
      expect(p).toContain("TRANSCRIBE first");
      expect(p).toContain("TEXTHANDLING (heaviest weight)");
    }
    // v3 (2026-11-03, owner: generalize from the designer community) — C.R.A.P. + Gestalt,
    // squint test, and NO banner-only vocabulary: works for poster/menu/slide/overlay alike
    for (const p of [poster, plate0, plateN]) {
      expect(p).toContain("SQUINT at the image");
      expect(p).toContain("C.R.A.P.");
      expect(p).toContain("Contrast & figure-ground");
      expect(p).toContain("Alignment & proximity");
      expect(p).toContain("Hierarchy: one clear focal order");
      expect(p).not.toContain("offer > product"); // generalized away from sale-banner vocabulary
    }
    expect(poster).toContain("judge every rendered line against them");
    expect(poster).toContain("diacritics"); // D16/RE §7.1 — the #1 real defect class
    expect(poster).toContain("pass\" ONLY when every score is 7+");
    expect(poster).toContain("7, not 6"); // v3.1 calibration — one tight margin alone never fails good work
    expect(poster).not.toContain("Overlay copy");
    expect(plate0).toContain("Overlay copy that will land on this page");
    expect(plate0).toContain("painted INTO the image is a defect");
    expect(plateN).toContain("NO overlay copy (purely visual plate)");
    expect(poster.match(/SALE 20%/g)?.length).toBe(1); // the copy appears ONCE — inside the prompt line it belongs to
    for (const p of [poster, plate0, plateN]) expect(p.endsWith(EVAL_READ_MARKER)).toBe(true);
  });

  it("surgicalEditPrompt: numbered defects + preserve-everything contract, mode-aware (DA-3.1)", () => {
    const poster = surgicalEditPrompt(["typo in 'GIAM SÓC'", "logo squashed"], "poster");
    expect(poster).toContain("Edit Image 1");
    expect(poster).toContain("1. typo in 'GIAM SÓC'");
    expect(poster).toContain("2. logo squashed");
    expect(poster).toContain("exact same dimensions");
    expect(poster).toContain("keep their exact wording");
    const plate = surgicalEditPrompt(["top band too busy"], "clean-plate");
    expect(plate).toContain("Do not add any new text");
  });

  it("isStochasticMiss: same defect returns → systematic; disjoint defects → variance (DA-3.1)", () => {
    const read = (issues: string[]) => ({
      verdict: "fail" as const, scope: "global" as const,
      scores: { textHandling: 5, brand: 5, fidelity: 5, composition: 5, realism: 5 },
      issues, fixHints: [],
    });
    expect(isStochasticMiss(read(["headline typo again"]), read(["headline typo again"]))).toBe(false);
    expect(isStochasticMiss(read(["headline typo again"]), read(["background clutter everywhere"]))).toBe(true);
    expect(isStochasticMiss(null, read(["anything"]))).toBe(false);
    expect(isStochasticMiss(read(["garbled price text"]), read(["price text misaligned"]))).toBe(false); // "price" (5 chars) is shared → the same defect came back
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
    expect(canvasEv.renderData.selfImprove).toEqual({ criticVersion: "v3.3", rounds: 0, verdict: "best-effort", issues: [] });
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
    expect(out.find((e) => e.renderData.msgMeta.length)!.renderData.selfImprove).toEqual({ criticVersion: "v3.3", rounds: 0, verdict: "best-effort", issues: [] });
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

  it("happy loop (mock pair): fail → SURGICAL EDIT of the current image → pass — 2 images, no planner turn, verdict persisted", async () => {
    const img = countingImage();
    const out = await run({ prompt: "banner", selfImprove: { rounds: 1 } }, { llm: new MockLlmProvider(), image: img.provider });
    expect(img.calls()).toBe(2); // initial + edited
    const canvasEv = out.find((e) => e.renderData.msgMeta.length > 0)!;
    // mock critic fails LOCALIZED (a typo) → DA-3.1 edit path, recorded honestly (B7)
    expect(canvasEv.renderData.selfImprove).toMatchObject({ criticVersion: "v3.3", rounds: 1, verdict: "pass", refinePath: "edit" });
    // the edit targets the CURRENT artwork: references carry image 1, instruction is fix-only
    const edit = img.inputs()[1];
    expect(edit.prompt).toContain("Edit Image 1");
    expect(edit.prompt).toContain("Fix ONLY these defects");
    expect(edit.prompt).toContain("mock issue: headline rendered with a typo");
    expect(edit.referenceImages?.[0]).toBe(img.urls()[0]); // the CURRENT artwork is reference Image 1
    // the planner refine turn never ran — no "(refined" prompt ever reached the image channel
    expect(img.urls()[1]).toContain("edit");
    const timeline = out.find((e) => e.content.includes("<Result>"))!.renderData.taskMeta.map((t) => t.content);
    expect(timeline).toContain("Checking round 1");
    expect(timeline).toContain("Refining");
    expect(timeline).toContain("Checking round 2");
    // wire contract: inner-loop steps are marked substep — the stepper keys on
    // this flag (schema), never on the label text
    const all = out.find((e) => e.content.includes("<Result>"))!.renderData.taskMeta;
    for (const name of ["Checking round 1", "Refining", "Checking round 2"]) {
      expect(all.find((t) => t.content === name)?.type).toBe("substep");
    }
    // DA-6: the verdict rides the terminal events too (persistence + replay)
    expect(out.at(-1)!.renderData.selfImprove).toMatchObject({ rounds: 1, verdict: "pass" });
  });

  it("DA-3.1 stochastic: DIFFERENT defects across rounds → re-roll the SAME prompt, planner refine never runs", async () => {
    const img = countingImage();
    let reads = 0;
    const llm: LlmProvider = {
      name: "stub", capabilities: caps(), async isAvailable() { return { ok: true }; },
      async chat(m) {
        if (m[0].content.includes(REFINE_INSTRUCTION)) throw new Error("planner refine must NOT run while misses stay stochastic");
        return plan;
      },
      async readImage() {
        reads += 1;
        // round 1: localized → surgical edit; round 2: DISJOINT defects → the
        // prompt was right, the dice were wrong → re-roll; round 3: pass
        if (reads === 1) return evalJson("fail", 6, "localized", ["headline rendered with a heavy typo"]);
        if (reads === 2) return evalJson("fail", 6, "global", ["background clutter behind the product stage"]);
        return evalJson("pass", 9);
      },
    };
    const out = await run({ prompt: "banner", selfImprove: { rounds: 2 } }, { llm, image: img.provider });
    expect(img.calls()).toBe(3);
    // the re-roll reused the ORIGINAL page prompt verbatim — variance harvesting, not re-planning
    expect(img.inputs()[2].prompt).toBe(img.inputs()[0].prompt);
    expect(img.inputs()[2].prompt).not.toContain("Edit Image 1");
    const canvasEv = out.find((e) => e.renderData.msgMeta.length > 0)!;
    expect(canvasEv.renderData.selfImprove).toMatchObject({ criticVersion: "v3.3", rounds: 2, verdict: "pass", refinePath: "reroll" });
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

/* ---------- teardown fixes (2026-11-06) ---------- */

describe("teardown #7 — the DEFAULT combination (research + refine together)", () => {
  it("both loops active in ONE run: search opt + research instruction AND the refine cycle", async () => {
    const systems: string[] = [];
    const optsSeen: LlmChatOpts[] = [];
    let readCalls = 0;
    const spy: LlmProvider = {
      name: "codex", capabilities: caps({ webSearch: true }), async isAvailable() { return { ok: true }; },
      async chat(m, o) {
        systems.push(m[0].content);
        optsSeen.push(o ?? {});
        return m[0].content.includes(REFINE_INSTRUCTION)
          ? JSON.stringify({ title: "T", imagePrompt: "revised" })
          : JSON.stringify({ title: "T", imagePrompt: "p", researchNotes: ["note (src)"] });
      },
      async readImage() { readCalls++; return readCalls === 1 ? evalJson("fail") : evalJson("pass"); },
    };
    const img = countingImage();
    const out = await run({ prompt: "banner", research: true, selfImprove: { rounds: 1 }, jobId: "combined-1" }, { llm: spy, image: img.provider });
    expect(systems[0]).toContain(RESEARCH_INSTRUCTION);
    expect(optsSeen[0]?.search).toBe(true);
    expect(img.calls()).toBe(2); // initial + refined
    expect(out.at(-1)!.renderData.selfImprove).toMatchObject({ rounds: 1, verdict: "pass" });
  });
});

describe("teardown #8 — cancel mid-refine through the REAL failure mode (generation throws)", () => {
  it("abort kills the refine regeneration → the PREVIOUS image is still yielded, stream aborts", async () => {
    const ac = new AbortController();
    let n = 0;
    const img: ImageProvider = {
      name: "paged", capabilities: caps(), async isAvailable() { return { ok: true }; },
      async generate(i) {
        n += 1;
        if (n === 2) {
          ac.abort("user-stop"); // the kill fires DURING the refine regen…
          throw new Error("generation was killed"); // …and the real bridge THROWS (not a graceful return)
        }
        return { url: png1x1(), provider: "paged", model: "x", width: 8, height: 8 };
      },
    };
    const out = await run({ prompt: "banner", selfImprove: { rounds: 1 }, signal: ac.signal, jobId: "cancel-throw" }, { llm: new MockLlmProvider(), image: img });
    expect(n).toBe(2);
    const canvasEv = out.find((e) => e.renderData.msgMeta.some((m) => m.type === "canvas"));
    expect(canvasEv).toBeDefined(); // the FIRST image survived the abort
    expect(out.at(-1)?.content).not.toBe("</Content>"); // aborted, not completed
  });
});

describe("teardown #2 — multi-page verdict record (B7)", () => {
  it("terminal events pair the page-0 canvas with the page-0 verdict; every page's verdict rides selfImprovePages", async () => {
    const img = countingImage();
    // mock critic per jobId: page 0 fails its first check → refines → passes;
    // page 1's first check passes (per-job state, teardown #9)
    const out = await run({ prompt: "deck", pages: 2, selfImprove: { rounds: 1 }, jobId: "deck-record" }, { llm: new MockLlmProvider(), image: img.provider });
    const done = out.find((e) => e.content.startsWith("Finished"))!;
    expect(done.renderData.selfImprove).toMatchObject({ rounds: 1, verdict: "pass" }); // page 0 = hero
    expect(done.renderData.selfImprovePages).toHaveLength(2);
    expect(done.renderData.selfImprovePages?.[0]).toMatchObject({ rounds: 1, verdict: "pass" });
    expect(done.renderData.selfImprovePages?.[1]).toMatchObject({ rounds: 0, verdict: "pass" });
    // each page's own canvas event carried its own verdict (page 1 refined 0 rounds)
    const canvasEvs = out.filter((e) => e.content.includes("[[canvas::canvas::"));
    expect(canvasEvs[0].renderData.selfImprove).toMatchObject({ rounds: 1 });
    expect(canvasEvs[1].renderData.selfImprove).toMatchObject({ rounds: 0 });
  });

  it("loop off → selfImprovePages absent (D14: no field when the loop never ran)", async () => {
    const out = await run({ prompt: "deck", pages: 2, jobId: "deck-off" }, { llm: new MockLlmProvider(), image: countingImage().provider });
    expect(out.at(-1)!.renderData.selfImprovePages).toBeUndefined();
    expect(out.at(-1)!.renderData.selfImprove).toBeUndefined();
  });
});

describe("teardown #3 — clean-plate critic asks the RIGHT question per page", () => {
  it("page 0 judged against the overlay copy; later pages judged as purely visual plates", async () => {
    const prompts: string[] = [];
    let job = 0;
    const seen = new Set<string>();
    const spy: LlmProvider = {
      name: "s", capabilities: caps(), async isAvailable() { return { ok: true }; },
      async chat() {
        return JSON.stringify({ title: "T", imagePrompt: "p", blocks: [{ role: "price", text: "20% OFF" }] });
      },
      async readImage(prompt, _img, _schema, opts) {
        const key = opts?.jobId ?? `anon-${job}`;
        if (!seen.has(key)) { seen.add(key); job += 1; }
        prompts.push(prompt);
        return evalJson("pass");
      },
    };
    await run({ prompt: "banner", mode: "clean-plate", pages: 2, selfImprove: { rounds: 1 }, jobId: "plates" }, { llm: spy, image: countingImage().provider });
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("Overlay copy that will land on this page");
    expect(prompts[0]).toContain("20% OFF");
    expect(prompts[1]).toContain("NO overlay copy (purely visual plate)");
    expect(prompts[1]).not.toContain("20% OFF");
  });
});

describe("teardown #5/#6 — failed refine attempts announce their burn, rounds count only images produced", () => {
  it("regeneration failure names the error class and records rounds=0", async () => {
    const img = countingImage();
    let n = 0;
    const flaky: ImageProvider = {
      name: "flaky", capabilities: caps(), async isAvailable() { return { ok: true }; },
      async generate() {
        n += 1;
        if (n === 2) throw new (class extends Error {})(); // generic error → class `unknown`
        return { url: png1x1(), provider: "flaky", model: "x", width: 8, height: 8 };
      },
    };
    // scope "global" forces the full re-plan path (DA-3.1) — the planner refine
    // turn runs, then the regeneration throws: the burn must be ANNOUNCED (teardown #5/#6)
    const llm: LlmProvider = {
      name: "stub", capabilities: caps(), async isAvailable() { return { ok: true }; },
      async chat() { return plan; },
      async readImage() { return evalJson("fail", 5, "global"); },
    };
    const out = await run({ prompt: "banner", selfImprove: { rounds: 1 }, jobId: "regen-fail" }, { llm, image: flaky });
    expect(out.map((e) => e.content).join("\n")).toContain("Auto refine regeneration failed (unknown)");
    const canvasEv = out.find((e) => e.renderData.msgMeta.length > 0)!;
    expect(canvasEv.renderData.selfImprove).toMatchObject({ rounds: 0, verdict: "best-effort" });
  });
});

/** SC-2 — style-aware critic rubric (v3.3): hard laws ride the prompt only when a style is selected. */
describe("SC-2 critic style laws", () => {
  const base = { mode: "poster" as const, title: "t", pagePrompt: "p", overlayCopy: [] };
  it("no style → no STYLE criterion", () => {
    const p = criticPrompt(base);
    expect(p).toContain("Critic rubric v3.3");
    expect(p).not.toContain("STYLE (");
  });
  it("swiss → one-accent + light-display + flat-surface laws with a score cap", () => {
    const p = criticPrompt({ ...base, style: "swiss" });
    expect(p).toContain("STYLE (swiss)");
    expect(p).toContain("exactly ONE saturated accent");
    expect(p).toContain("cap this score at 4");
  });
  it("editorial → serif + textured-paper law; other presets get the generic clause", () => {
    expect(criticPrompt({ ...base, style: "editorial" })).toContain("STYLE (editorial)");
    expect(criticPrompt({ ...base, style: "vintage" })).toContain("STYLE (vintage)");
  });
});
