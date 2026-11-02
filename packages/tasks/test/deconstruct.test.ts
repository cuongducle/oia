import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { makeDeconstruct } from "../src/processors.js";
import { LocalFileStore } from "../src/storage.js";
import type { ImageProvider, LlmProvider, LlmChatOpts, ProviderCapabilities, ProviderDiagnostic, LlmMessage } from "@oia/providers";
import { DECONSTRUCT_READ_MARKER } from "@oia/schema";

/** Minimal PNG header (8-byte signature + IHDR 900×1200) — enough for pngSize. */
function fakePng(w = 900, h = 1200): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(b.buffer);
  dv.setUint32(8, 13); // IHDR length
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
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

function probeImage(seen: { calls: { prompt: string; refs: string[]; w: number; h: number }[] }, url = "data:image/png;base64,iVBORw0KGgo="): ImageProvider {
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

  it("happy path: read → inpaint with the ORIGINAL size + reference, texts ride the result", async () => {
    const { store, fileUrl } = await setup();
    const seen: { calls: { prompt: string; refs: string[]; w: number; h: number }[] } = { calls: [] };
    const readPrompts: string[] = [];
    const handler = makeDeconstruct({ store, image: probeImage(seen), llm: fakeLlm((p) => { readPrompts.push(p); return GOOD_READ; }) });
    const result = await handler({ fileUrl }, tctx);
    expect(readPrompts[0]).toContain(DECONSTRUCT_READ_MARKER);
    expect(seen.calls).toHaveLength(1);
    expect(seen.calls[0].refs).toEqual([fileUrl]);
    expect(seen.calls[0]).toMatchObject({ w: 900, h: 1200 }); // original size — boxes map 1:1
    expect(result.urls).toHaveLength(1);
    expect(result.texts?.[0]).toMatchObject({ text: "SALE 50" });
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

  it("missing/invalid fileUrl is a clear error, not a mystery provider failure", async () => {
    const store = new LocalFileStore(root);
    const handler = makeDeconstruct({ store, image: probeImage({ calls: [] }), llm: fakeLlm(() => GOOD_READ) });
    await expect(handler({}, tctx)).rejects.toThrow(/fileUrl/);
    await expect(handler({ fileUrl: "/api/files/nope/missing.png" }, tctx)).rejects.toThrow(/not been uploaded|invalid/i);
  });

  it("non-PNG upload falls back to a square size — positions stay honest (fractions)", async () => {
    const store = new LocalFileStore(root);
    const src = await store.put(new Uint8Array([1, 2, 3, 4]), "png");
    const seen: { calls: { w: number; h: number }[] } = { calls: [] };
    const handler = makeDeconstruct({ store, image: probeImage(seen), llm: fakeLlm(() => GOOD_READ) });
    await handler({ fileUrl: src.url }, tctx);
    expect(seen.calls[0]).toMatchObject({ w: 1024, h: 1024 });
  });
});
