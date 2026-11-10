import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { makePptTranslate, xmlEscape } from "../src/processors.js";
import { TaskStore } from "../src/store.js";
import { LocalFileStore } from "../src/storage.js";
import type { LlmProvider, ProviderCapabilities } from "@oia/providers";
import { ProviderError } from "@oia/providers";
import { pptTranslateSystemPrompt, PPT_TRANSLATE_MAX_RUNS, PPT_TRANSLATE_INSTRUCTION } from "@oia/schema";

/**
 * SG-7 gates: the zip round-trip must translate ONLY <a:t> bodies (attributes,
 * markup and non-slide entries are byte-identical), a broken deck fails with a
 * clear message, and the LLM count contract is enforced. The D23 lesson applies:
 * at least one test drives the FULL TaskStore lane, not just the handler.
 */

const caps = (): ProviderCapabilities => ({
  referenceImages: false,
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock: true,
});

/** Deterministic fake translator: appends " [lang]" like the real mock planner. */
function fakeLlm(opts: { countOverride?: number } = {}): LlmProvider & { seen: unknown[] } {
  const seen: unknown[] = [];
  return {
    name: "fake",
    capabilities: caps(),
    isAvailable: async () => ({ ok: true, detail: "fake" }),
    seen,
    async chat(messages, _opts) {
      seen.push(messages);
      const texts = (JSON.parse(messages[messages.length - 1].content) as { texts: string[] }).texts;
      const translations = texts.map((t) => `${t} [vi]`);
      if (opts.countOverride !== undefined) translations.length = opts.countOverride;
      return JSON.stringify({ translations });
    },
  };
}

const SLIDE1 = `<?xml version="1.0"?><p:sld xmlns:p="p"><p:sp><p:txBody><a:p><a:r><a:rPr lang="en-US"/><a:t>Hello &amp; welcome</a:t></a:r><a:r><a:t xml:space="preserve">SALE </a:t></a:r><a:r><a:t>50% &lt;off&gt;</a:t></a:r><a:r><a:t></a:t></a:r></a:p></p:txBody></p:sp></p:sld>`;
const SLIDE2 = `<?xml version="1.0"?><p:sld xmlns:p="p"><p:sp><p:txBody><a:p><a:r><a:t>Second slide</a:t></a:r></a:p></p:txBody></p:sp></p:sld>`;

async function buildPptx(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  zip.file("[Content_Types].xml", `<Types/>`);
  return new Uint8Array(await zip.generateAsync({ type: "nodebuffer" }));
}

async function makeCtx(llm: LlmProvider) {
  const files = new LocalFileStore(mkdtempSync(path.join(tmpdir(), "oia-ppt-")));
  await files.hydrate();
  return { files, ctx: { store: files, image: undefined as never, llm } as Parameters<typeof makePptTranslate>[0] };
}

describe("SG-7 ppt-translate", () => {
  it("xmlEscape round-trips the five XML specials in text bodies", () => {
    expect(xmlEscape(`a & b <c> "d" 'e'`)).toBe(`a &amp; b &lt;c&gt; "d" 'e'`);
  });

  it("translates every non-empty run in slide order, preserves attributes and untouched entries", async () => {
    const llm = fakeLlm();
    const { files, ctx } = await makeCtx(llm);
    const deck = await buildPptx({ "ppt/slides/slide1.xml": SLIDE1, "ppt/slides/slide2.xml": SLIDE2, "ppt/media/image1.png": "RAWBYTES" });
    const savedIn = await files.put(deck, "pptx");
    const run = makePptTranslate(ctx);
    const out = await run({ fileUrl: savedIn.url, language: "Vietnamese" }, { jobId: "j1", signal: new AbortController().signal });
    expect(out.note).toContain("4 text runs");

    const zip = await JSZip.loadAsync(await files.read(out.urls[0].replace(/^\/api\/files\//, "")));
    const s1 = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(s1).toContain(`<a:t>Hello &amp; welcome [vi]</a:t>`);
    expect(s1).toContain(`<a:t xml:space="preserve">SALE  [vi]</a:t>`); // the original attribute survives
    expect(s1).toContain(`<a:t>50% &lt;off&gt; [vi]</a:t>`); // escaped back, not raw <off>
    expect(s1).toContain(`<a:t></a:t>`); // the empty run stayed empty and consumed nothing
    const s2 = await zip.file("ppt/slides/slide2.xml")!.async("string");
    expect(s2).toContain(`Second slide [vi]`);
    expect(await zip.file("ppt/media/image1.png")!.async("string")).toBe("RAWBYTES"); // media untouched
    // the LLM saw ONE batch, slides in order, with the shared instruction marker
    expect(llm.seen).toHaveLength(1);
    const system = (llm.seen[0] as { content: string }[])[0].content;
    expect(system).toContain(PPT_TRANSLATE_INSTRUCTION);
    expect(system).toContain("Vietnamese");
    const batch = JSON.parse((llm.seen[0] as { content: string }[])[1].content) as { texts: string[] };
    expect(batch.texts).toEqual(["Hello & welcome", "SALE ", "50% <off>", "Second slide"]);
  });

  it("a file that is not a zip fails with a clear message", async () => {
    const { files, ctx } = await makeCtx(fakeLlm());
    const savedIn = await files.put(new Uint8Array([1, 2, 3, 4]), "pptx");
    const run = makePptTranslate(ctx);
    await expect(run({ fileUrl: savedIn.url, language: "Vietnamese" }, { jobId: "j", signal: new AbortController().signal }))
      .rejects.toThrow("not a valid .pptx");
  });

  it("a deck with no text runs fails honestly instead of returning the input", async () => {
    const { files, ctx } = await makeCtx(fakeLlm());
    const deck = await buildPptx({ "ppt/slides/slide1.xml": `<p:sld><a:p><a:r><a:t></a:t></a:r></a:p></p:sld>` });
    const savedIn = await files.put(deck, "pptx");
    const run = makePptTranslate(ctx);
    await expect(run({ fileUrl: savedIn.url, language: "Vietnamese" }, { jobId: "j", signal: new AbortController().signal }))
      .rejects.toThrow("no text to translate");
  });

  it("a translator that returns the wrong count is a plan_parse_failed, never a shifted deck", async () => {
    const { files, ctx } = await makeCtx(fakeLlm({ countOverride: 1 }));
    const deck = await buildPptx({ "ppt/slides/slide1.xml": SLIDE1, "ppt/slides/slide2.xml": SLIDE2 });
    const savedIn = await files.put(deck, "pptx");
    const run = makePptTranslate(ctx);
    await expect(run({ fileUrl: savedIn.url, language: "Vietnamese" }, { jobId: "j", signal: new AbortController().signal }))
      .rejects.toBeInstanceOf(ProviderError);
  });

  it(`more than ${PPT_TRANSLATE_MAX_RUNS} runs fails instead of silently translating part of the deck`, async () => {
    const { files, ctx } = await makeCtx(fakeLlm());
    const many = Array.from({ length: PPT_TRANSLATE_MAX_RUNS + 1 }, (_, i) => `<a:r><a:t>w${i}</a:t></a:r>`).join("");
    const deck = await buildPptx({ "ppt/slides/slide1.xml": `<p:sld><a:p>${many}</a:p></p:sld>` });
    const savedIn = await files.put(deck, "pptx");
    const run = makePptTranslate(ctx);
    await expect(run({ fileUrl: savedIn.url, language: "Vietnamese" }, { jobId: "j", signal: new AbortController().signal }))
      .rejects.toThrow("split the deck");
  });

  it("the full TaskStore lane maps urls[0] to download (the D23 packaging lesson)", async () => {
    const { files, ctx } = await makeCtx(fakeLlm());
    const deck = await buildPptx({ "ppt/slides/slide1.xml": SLIDE1 });
    const savedIn = await files.put(deck, "pptx");
    const dir = mkdtempSync(path.join(tmpdir(), "oia-ppt-store-"));
    const taskStore = new TaskStore({ logFile: path.join(dir, "task-log.jsonl") });
    taskStore.register("ppt-translate", makePptTranslate(ctx));
    const t = await taskStore.submit("ppt-translate", { fileUrl: savedIn.url, language: "Vietnamese" }, { noWait: true });
    expect(t.progress).toBe("succeeded");
    expect(t.taskResult?.download).toMatch(/\.pptx$/);
    expect(t.taskNote).toContain("3 text runs");
  });

  it("submit validation accepts the skill shape and rejects a missing language", () => {
    const taskStore = new TaskStore();
    expect(taskStore.validate("ppt-translate", { fileUrl: "/api/files/x.pptx", language: "Vietnamese", noWait: true, source: "skill" })).toEqual({ ok: true });
    expect(taskStore.validate("ppt-translate", { fileUrl: "/api/files/x.pptx" })).toMatchObject({ ok: false });
  });

  it("the system prompt pins the count contract", () => {
    expect(pptTranslateSystemPrompt("Vietnamese", 4)).toContain("EXACTLY 4 entries");
  });
});
