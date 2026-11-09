import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { makeDeconstruct } from "../src/processors.js";
import { TaskStore } from "../src/store.js";
import { ProviderError } from "@oia/providers";
import { LocalFileStore } from "../src/storage.js";
import type { ImageProvider, LlmProvider, LlmChatOpts, ProviderCapabilities, ProviderDiagnostic, LlmMessage } from "@oia/providers";
import { DECONSTRUCT_READ_MARKER } from "@oia/schema";
import { PNG } from "pngjs";

function fakePng(w = 90, h = 120): Uint8Array {
  const png = new PNG({ width: w, height: h });
  png.data.fill(255);
  return PNG.sync.write(png);
}

const anyCaps = (over: Partial<ProviderCapabilities> = {}): ProviderCapabilities => ({
  referenceImages: true,
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock: true,
  ...over,
});

function fakeLlm(read: (prompt: string) => string): LlmProvider {
  return {
    name: "fake-llm",
    capabilities: anyCaps(),
    isAvailable: async (): Promise<ProviderDiagnostic> => ({ ok: true, detail: "fake" }),
    chat: async (_m: LlmMessage[], _o?: LlmChatOpts) => "{}",
    readImage: async (prompt: string) => read(prompt),
  };
}

function probeImage(seen: { calls: { prompt: string; refs: string[]; w: number; h: number }[] }, url = `data:image/png;base64,${Buffer.from(fakePng()).toString("base64")}`): ImageProvider {
  return {
    name: "probe-image",
    capabilities: anyCaps(),
    isAvailable: async () => ({ ok: true, detail: "probe" }),
    generate: async (input) => {
      seen.calls.push({ prompt: input.prompt, refs: input.referenceImages ?? [], w: input.width, h: input.height });
      return { url, provider: "probe", model: "probe", width: input.width, height: input.height };
    },
  };
}

describe("B1 deconstruct processor (deconstruct-import.md DC-3)", () => {
  let root: string;
  beforeAll(() => { root = mkdtempSync(path.join(tmpdir(), "oia-decon-")); });
  afterAll(() => { rmSync(root, { recursive: true, force: true }); });

  const GOOD_READ = JSON.stringify({
    texts: [
      { text: "SALE 50", box: { x: 0.08, y: 0.1, w: 0.55, h: 0.09 } },
      { text: "299.000₫", box: { x: 0.1, y: 0.72, w: 0.45, h: 0.07 } },
    ],
  });

  async function setup() {
    const store = new LocalFileStore(root);
    const src = await store.put(fakePng(900, 1200), "png");
    return { store, fileUrl: src.url };
  }

  const tctx = { jobId: "job-1", signal: undefined as AbortSignal | undefined };

  it("preserves paid OCR on no_output without claiming a clean plate or retrying", async () => {
    const { store, fileUrl } = await setup();
    let reads = 0, images = 0;
    const image = probeImage({ calls: [] });
    image.generate = async () => { images++; throw new ProviderError("no_output", "codex produced no image file", { provider: "codex" }); };
    const logFile = path.join(root, "partial-tasks.jsonl"), tasks = new TaskStore({ logFile });
    tasks.register("deconstruct", makeDeconstruct({ store, image, llm: fakeLlm(() => { reads++; return GOOD_READ; }) }));
    const result = await tasks.submit("deconstruct", { fileUrl }, { noWait: true });
    expect(result).toMatchObject({ progress: "failed", errorClass: "no_output", provider: "codex" });
    expect(result.taskResult?.texts?.[0].text).toBe("SALE 50");
    expect(result.taskResult?.download).toBeUndefined();
    expect(result.taskNote).toContain("Background cleanup has not completed");
    expect([reads, images]).toEqual([1, 1]);
    const restored = new TaskStore({ logFile }); await restored.load();
    expect(restored.get(result.taskId)).toMatchObject({ progress: "failed", errorClass: "no_output", taskResult: result.taskResult });
  });

  it("preserves OCR when cancelled before cleanup without calling the image provider", async () => {
    const { store, fileUrl } = await setup();
    const tasks = new TaskStore(), seen = { calls: [] };
    const llm = fakeLlm(() => GOOD_READ);
    llm.readImage = async (_p, _b, _s, opts) => {
      const job = opts?.signal;
      // Abort the registered job at the OCR boundary, not an unrelated test signal.
      const record = tasks.sessionTasks(1)[0];
      await tasks.cancel(record.taskId);
      expect(job?.aborted).toBe(true);
      return GOOD_READ;
    };
    tasks.register("deconstruct", makeDeconstruct({ store, image: probeImage(seen), llm }));
    const result = await tasks.submit("deconstruct", { fileUrl }, { noWait: true });
    expect(result).toMatchObject({ progress: "failed", errorClass: "cancelled" });
    expect(result.taskResult?.texts).toHaveLength(2);
    expect(result.taskResult?.download).toBeUndefined();
    expect(seen.calls).toHaveLength(0);
  });

  it("happy path: read → inpaint with the ORIGINAL size + reference, texts ride the result", async () => {
    const { store, fileUrl } = await setup();
    const seen: { calls: { prompt: string; refs: string[]; w: number; h: number }[] } = { calls: [] };
    const readPrompts: string[] = [];
    const handler = makeDeconstruct({ store, image: probeImage(seen), llm: fakeLlm((p) => { readPrompts.push(p); return GOOD_READ; }) });
    const result = await handler({ fileUrl }, tctx);
    expect(readPrompts[0]).toContain(DECONSTRUCT_READ_MARKER);
    expect(seen.calls).toHaveLength(1);
    // in-process contract (live repro 2026-11-02 → P2): the provider receives the
    // store's LOCAL PATH, the raw `/api/files/<key>` URL once reached the codex
    // bridge as a relative path and the job died with ENOENT at the inpaint stage.
    expect(seen.calls[0].refs[0]).toMatch(/[/\\]uploads[/\\]/);
    expect(seen.calls[0].refs[0]).not.toContain("/api/files/");
    expect(seen.calls[0]).toMatchObject({ w: 900, h: 1200 }); // original size, boxes map 1:1
    expect(result.urls).toHaveLength(1);
    expect(result.texts?.[0]).toMatchObject({ text: "SALE 50" });
  });

  it("the inpaint reference is the store's LOCAL PATH, the file's bytes, byte-for-byte (no base64 round-trip)", async () => {
    const { store, fileUrl } = await setup();
    const seen: { calls: { prompt: string; refs: string[]; w: number; h: number }[] } = { calls: [] };
    const handler = makeDeconstruct({ store, image: probeImage(seen), llm: fakeLlm(() => GOOD_READ) });
    const src = await store.read(fileUrl.replace(/^\/api\/files\//, ""));
    await handler({ fileUrl }, tctx);
    expect(seen.calls).toHaveLength(1);
    expect(seen.calls[0].refs[0]).not.toMatch(/^data:/); // a path, not a data URL
    const sent = await import("node:fs/promises").then((fs) => fs.readFile(seen.calls[0].refs[0]));
    expect(Buffer.compare(sent, Buffer.from(src))).toBe(0); // the exact stored bytes, no truncation
  });

  it("G2 invariant: a malformed read fails BEFORE any image is generated", async () => {
    const { store, fileUrl } = await setup();
    const seen: { calls: unknown[] } = { calls: [] };
    const handler = makeDeconstruct({ store, image: probeImage(seen), llm: fakeLlm(() => "not json at all") });
    await expect(handler({ fileUrl }, tctx)).rejects.toMatchObject({ name: "ProviderError", errorClass: "plan_parse_failed" });
    expect(seen.calls).toHaveLength(0); // the seller's image quota was NOT burned
  });

  it("TP.11: an LLM without readImage fails loudly, no image burned", async () => {
    const { store, fileUrl } = await setup();
    const seen: { calls: unknown[] } = { calls: [] };
    const noVision: LlmProvider = {
      name: "no-vision",
      capabilities: anyCaps({ referenceImages: false }),
      isAvailable: async () => ({ ok: true, detail: "x" }),
      chat: async () => "{}",
    };
    const handler = makeDeconstruct({ store, image: probeImage(seen), llm: noVision });
    await expect(handler({ fileUrl }, tctx)).rejects.toMatchObject({ name: "ProviderError", errorClass: "capability_unsupported" });
    expect(seen.calls).toHaveLength(0);
  });

  it("TP.11: an image provider without reference support fails before generating", async () => {
    const { store, fileUrl } = await setup();
    const noRefs: ImageProvider = {
      name: "no-refs",
      capabilities: anyCaps({ referenceImages: false }),
      isAvailable: async () => ({ ok: true, detail: "x" }),
      generate: async () => { throw new Error("must not be called"); },
    };
    const handler = makeDeconstruct({ store, image: noRefs, llm: fakeLlm(() => GOOD_READ) });
    await expect(handler({ fileUrl }, tctx)).rejects.toMatchObject({ errorClass: "capability_unsupported" });
  });

  it("empty OCR returns original without spending an image generation", async () => {
    const { store, fileUrl } = await setup();
    const seen: { calls: unknown[] } = { calls: [] };
    const result = await makeDeconstruct({ store, image: probeImage(seen), llm: fakeLlm(() => '{"texts":[]}') })({ fileUrl }, tctx);
    expect(result.urls).toEqual([fileUrl]);
    expect(result.texts).toEqual([]);
    expect(seen.calls).toHaveLength(0);
  });

  it("restores smooth backgrounds without a paid image call", async () => {
    const { store, fileUrl } = await setup();
    const seen: { calls: unknown[] } = { calls: [] };
    const read = JSON.parse(GOOD_READ);
    for (const t of read.texts) t.typography = { fontFamily: "Be Vietnam Pro", fontWeight: 400, fontStyle: "normal", fill: "#111111", angle: 0, spacingEm: 0, textAlign: "left" };
    const result = await makeDeconstruct({ store, image: probeImage(seen), llm: fakeLlm(() => JSON.stringify(read)) })({ fileUrl }, tctx);
    expect(result.note).toContain("no image generation");
    expect(seen.calls).toHaveLength(0);
    const png = PNG.sync.read(Buffer.from(await store.read(result.urls[0].replace(/^\/api\/files\//, ""))));
    expect([png.width, png.height]).toEqual([900, 1200]);
  });

  it("cancellation between OCR and inpaint never starts a paid generation", async () => {
    const { store, fileUrl } = await setup();
    const stop = new AbortController();
    const seen: { calls: unknown[] } = { calls: [] };
    const handler = makeDeconstruct({ store, image: probeImage(seen), llm: fakeLlm(() => { stop.abort(); return GOOD_READ; }) });
    await expect(handler({ fileUrl }, { signal: stop.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(seen.calls).toHaveLength(0);
  });

  it("malformed typography fails before image quota is spent", async () => {
    const { store, fileUrl } = await setup();
    const seen: { calls: unknown[] } = { calls: [] };
    const read = JSON.parse(GOOD_READ);
    read.texts[0].typography = { fill: "#fff", angle: 999 };
    await expect(makeDeconstruct({ store, image: probeImage(seen), llm: fakeLlm(() => JSON.stringify(read)) })({ fileUrl }, tctx)).rejects.toMatchObject({ errorClass: "plan_parse_failed" });
    expect(seen.calls).toHaveLength(0);
  });

  it("missing/invalid fileUrl is a clear error, not a mystery provider failure", async () => {
    const store = new LocalFileStore(root);
    const handler = makeDeconstruct({ store, image: probeImage({ calls: [] }), llm: fakeLlm(() => GOOD_READ) });
    await expect(handler({}, tctx)).rejects.toThrow(/fileUrl/);
    await expect(handler({ fileUrl: "/api/files/nope/missing.png" }, tctx)).rejects.toThrow(/not been uploaded|invalid/i);
  });

  it("invalid pixels fail before a paid read or generation, never fall back to imaginary dimensions", async () => {
    const store = new LocalFileStore(root);
    const src = await store.put(new Uint8Array([1, 2, 3, 4]), "png");
    const seen: { calls: { w: number; h: number }[] } = { calls: [] };
    const handler = makeDeconstruct({ store, image: probeImage(seen), llm: fakeLlm(() => GOOD_READ) });
    await expect(handler({ fileUrl: src.url }, tctx)).rejects.toThrow(/PNG/);
    expect(seen.calls).toHaveLength(0);
  });
});
