import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { makeDeconstruct, type TextDetector, type DetectedTextLine } from "../src/processors.js";
import { TaskStore } from "../src/store.js";
import { ProviderError } from "@oia/providers";
import { LocalFileStore } from "../src/storage.js";
import { DECONSTRUCT_CLASSIFY_MARKER, DECONSTRUCT_TRANSCRIBE_MARKER } from "@oia/schema";
import { PNG } from "pngjs";

function smoothPoster(w = 200, h = 200): Uint8Array {
  // white background + two colored text strips the detector lines point at
  const png = new PNG({ width: w, height: h });
  png.data.fill(255);
  for (let y = 60; y < 74; y++) for (let x = 20; x < 150; x += 3) png.data.set([200, 30, 40, 255], (y * w + x) * 4);
  for (let y = 120; y < 132; y++) for (let x = 20; x < 120; x += 3) png.data.set([20, 40, 180, 255], (y * w + x) * 4);
  return PNG.sync.write(png);
}

const LINES: DetectedTextLine[] = [
  { box: { x: 0.1, y: 0.3, w: 0.65, h: 0.07 }, angle: 0, score: 0.9 },
  { box: { x: 0.1, y: 0.6, w: 0.5, h: 0.06 }, angle: 0, score: 0.8 },
  { box: { x: 0.8, y: 0.05, w: 0.1, h: 0.04 }, angle: 0, score: 0.7 }, // screen text
];

const anyCaps = () => ({ referenceImages: true, sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false }, transparentBg: false, isMock: true });

/** readImage that serves classify/transcribe by marker; mispairing is injectable. */
function laneLlm(opts: { classify?: string; transcribe?: string } = {}) {
  const calls: string[] = [];
  return {
    calls,
    llm: {
      name: "lane-fake",
      capabilities: anyCaps(),
      isAvailable: async () => ({ ok: true, detail: "fake" }),
      chat: async () => "{}",
      readImage: async (prompt: string) => {
        calls.push(prompt);
        if (prompt.includes(DECONSTRUCT_CLASSIFY_MARKER)) {
          if (opts.classify) return opts.classify;
          const count = Number(/There are (\d+) numbers/.exec(prompt)?.[1] ?? 0);
          return JSON.stringify({ lines: Array.from({ length: count }, (_, i) => ({ i, design: i !== 2 })) });
        }
        if (prompt.includes(DECONSTRUCT_TRANSCRIBE_MARKER)) {
          return opts.transcribe ?? JSON.stringify({ lines: [
            { i: 0, text: "GIẢM GIÁ 50%", bold: true, italic: false },
            { i: 1, text: "hôm nay", bold: false, italic: true },
          ] });
        }
        throw new Error("unexpected read: " + prompt.slice(0, 60));
      },
    },
  };
}

function fakeDetector(lines: DetectedTextLine[], hooks: { abort?: () => void } = {}): TextDetector {
  return {
    detect: async () => {
      hooks.abort?.();
      return lines;
    },
  };
}

function probeImage(seen: { images: number }) {
  return {
    name: "probe-image",
    capabilities: anyCaps(),
    isAvailable: async () => ({ ok: true, detail: "probe" }),
    generate: async (input: { width: number; height: number; prompt: string; referenceImages: string[] }) => {
      seen.images++;
      throw new Error(`image generation must not run in this test (w=${input.width})`);
    },
  };
}

describe("D22 detector lane (makeDeconstruct + textDetector)", () => {
  let root: string;
  beforeAll(() => { root = mkdtempSync(path.join(tmpdir(), "oia-det-lane-")); });
  afterAll(() => { rmSync(root, { recursive: true, force: true }); });
  const tctx = { jobId: "job-1", signal: undefined as AbortSignal | undefined };

  async function setup() {
    const store = new LocalFileStore(root);
    const src = await store.put(smoothPoster(), "png");
    return { store, fileUrl: src.url };
  }

  it("detector owns geometry, screen lines are dropped, transcription builds texts on detector boxes", async () => {
    const { store, fileUrl } = await setup();
    const lane = laneLlm();
    const seen = { images: 0 };
    const handler = makeDeconstruct({ store, image: probeImage(seen), llm: lane.llm, textDetector: fakeDetector(LINES) });
    const result = await handler({ fileUrl }, tctx);
    // smooth poster: local plate, no image generation, no image provider needed
    expect(seen.images).toBe(0);
    expect(result.texts).toHaveLength(2);
    expect(result.texts![0]).toMatchObject({ text: "GIẢM GIÁ 50%" });
    // the detector box gets tightened to the measured ink like every lane
    const box = result.texts![0].box;
    expect(box.y * 200).toBeGreaterThanOrEqual(59);
    expect((box.y + box.h) * 200).toBeLessThanOrEqual(76);
    expect(box.x * 200).toBeGreaterThanOrEqual(18);
    expect((box.x + box.w) * 200).toBeLessThanOrEqual(152);
    expect(result.texts![0].typography.fill.toLowerCase()).toBe("#c81e28"); // measured red, not the black seed
    expect(result.texts![1].typography).toMatchObject({ fontStyle: "italic", fontWeight: 400 });
    expect(result.note).toContain("Detected 3 text lines, dropped 1");
    expect(lane.calls).toHaveLength(2); // 1 classify + 1 sheet
    const plate = PNG.sync.read(Buffer.from(await store.read(result.urls[0].replace(/^\/api\/files\//, ""))));
    expect([plate.width, plate.height]).toEqual([200, 200]);
  });

  it("a mispaired classification fails before any sheet read or image generation", async () => {
    const { store, fileUrl } = await setup();
    const lane = laneLlm({ classify: JSON.stringify({ lines: [{ i: 0, design: true }] }) });
    const seen = { images: 0 };
    const handler = makeDeconstruct({ store, image: probeImage(seen), llm: lane.llm, textDetector: fakeDetector(LINES) });
    await expect(handler({ fileUrl }, tctx)).rejects.toMatchObject({ errorClass: "plan_parse_failed" });
    expect(lane.calls).toHaveLength(1);
  });

  it("a mispaired transcription sheet fails after its read but before image generation", async () => {
    const { store, fileUrl } = await setup();
    const lane = laneLlm({ transcribe: JSON.stringify({ lines: [{ i: 0, text: "x", bold: true, italic: false }, { i: 0, text: "y", bold: true, italic: false }] }) });
    const seen = { images: 0 };
    const handler = makeDeconstruct({ store, image: probeImage(seen), llm: lane.llm, textDetector: fakeDetector(LINES) });
    await expect(handler({ fileUrl }, tctx)).rejects.toMatchObject({ errorClass: "plan_parse_failed" });
    expect(lane.calls).toHaveLength(2);
  });

  it("all lines classified as photographed-object text returns the original with an honest note", async () => {
    const { store, fileUrl } = await setup();
    const lane = laneLlm({ classify: JSON.stringify({ lines: LINES.map((_, i) => ({ i, design: false })) }) });
    const handler = makeDeconstruct({ store, image: probeImage({ images: 0 }), llm: lane.llm, textDetector: fakeDetector(LINES) });
    const result = await handler({ fileUrl }, tctx);
    expect(result.urls).toEqual([fileUrl]);
    expect(result.texts).toEqual([]);
    expect(result.note).toContain("photographed objects");
  });

  it("aborting during detection propagates before any paid read", async () => {
    const { store, fileUrl } = await setup();
    const stop = new AbortController();
    const lane = laneLlm();
    const handler = makeDeconstruct({ store, image: probeImage({ images: 0 }), llm: lane.llm, textDetector: fakeDetector(LINES, { abort: () => stop.abort() }) });
    await expect(handler({ fileUrl }, { jobId: "j", signal: stop.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(lane.calls).toHaveLength(0);
  });

  it("more design lines than 5 sheets can carry fails loudly before transcription", async () => {
    const { store, fileUrl } = await setup();
    const many: DetectedTextLine[] = Array.from({ length: 183 }, (_, i) => ({ box: { x: 0.05, y: (i % 40) * 0.02, w: 0.2, h: 0.01 }, angle: 0, score: 0.9 }));
    const lane = laneLlm();
    const handler = makeDeconstruct({ store, image: probeImage({ images: 0 }), llm: lane.llm, textDetector: fakeDetector(many) });
    await expect(handler({ fileUrl }, tctx)).rejects.toThrow(/182 design text lines/);
    expect(lane.calls).toHaveLength(1); // classify already paid, transcription never started
  });

  it("empty transcription strings drop their lines instead of shipping empty text objects", async () => {
    const { store, fileUrl } = await setup();
    const lane = laneLlm({ transcribe: JSON.stringify({ lines: [
      { i: 0, text: "GIẢM GIÁ 50%", bold: true, italic: false },
      { i: 1, text: "   ", bold: false, italic: false },
    ] }) });
    const handler = makeDeconstruct({ store, image: probeImage({ images: 0 }), llm: lane.llm, textDetector: fakeDetector(LINES) });
    const result = await handler({ fileUrl }, tctx);
    expect(result.texts).toHaveLength(1);
    expect(result.texts![0].text).toBe("GIẢM GIÁ 50%");
  });
});
