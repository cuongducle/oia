import { describe, expect, it } from "vitest";
import { makeSegmentImage, type ProcCtx } from "../src/processors.js";
import { LocalFileStore } from "../src/storage.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";

/** D21 segment-image processor: validation, storage and honest failures. The
 *  engine is faked (2 cutouts, then none) so no model file is needed. */
function fakePng(): Uint8Array {
  const png = new PNG({ width: 4, height: 4 });
  return PNG.sync.write(png);
}

async function withStore(): Promise<{ ctx: ProcCtx; dir: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "oia-tasks-"));
  const store = new LocalFileStore(path.join(dir, "files"));

  const saved = await store.put(fakePng(), "png");
  const segmenter = {
    segment: async ({ prompt }: { prompt: string }) =>
      prompt === "none"
        ? []
        : [
            { box: [0.1, 0.1, 0.5, 0.6] as [number, number, number, number], score: 0.9, cutout: fakePng() },
            { box: [0.6, 0.2, 0.9, 0.8] as [number, number, number, number], score: 0.7, cutout: fakePng() },
          ],
  };
  return { ctx: { store, image: {} as ProcCtx["image"], llm: {} as ProcCtx["llm"], segmenter }, dir };
}

describe("makeSegmentImage", () => {
  it("saves one cutout per detection with box fractions and a note", async () => {
    const { ctx, dir } = await withStore();
    try {
      const put = await ctx.store.put(fakePng(), "png");
      const res = await makeSegmentImage(ctx)({ fileUrl: put.url, prompt: "bottle" }, { jobId: "j", signal: new AbortController().signal });
      expect(res.objects).toHaveLength(2);
      expect(res.objects![0]).toMatchObject({ box: [0.1, 0.1, 0.5, 0.6], score: 0.9 });
      expect(res.urls).toHaveLength(2);
      expect(res.note).toContain("2 layers");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("no detections is a success with an honest note, not a failure", async () => {
    const { ctx, dir } = await withStore();
    try {
      const put = await ctx.store.put(fakePng(), "png");
      const res = await makeSegmentImage(ctx)({ fileUrl: put.url, prompt: "none" }, { jobId: "j", signal: new AbortController().signal });
      expect(res.urls).toEqual([]);
      expect(res.objects).toBeUndefined();
      expect(res.note).toContain("nothing matching");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("missing engine = capability_unsupported, never a silent mock", async () => {
    const { ctx, dir } = await withStore();
    try {
      const put = await ctx.store.put(fakePng(), "png");
      const { segmenter: _s, ...bare } = ctx;
      await expect(makeSegmentImage(bare as ProcCtx)({ fileUrl: put.url, prompt: "x" }, { jobId: "j", signal: new AbortController().signal }))
        .rejects.toThrow(/not available/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects bad params and unknown uploads before any model runs", async () => {
    const { ctx, dir } = await withStore();
    try {
      const run = makeSegmentImage(ctx);
      await expect(run({ prompt: "x" }, { jobId: "j", signal: new AbortController().signal })).rejects.toThrow(/fileUrl/);
      await expect(run({ fileUrl: "/api/files/nope.png", prompt: "x" }, { jobId: "j", signal: new AbortController().signal })).rejects.toThrow(/not been uploaded/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
