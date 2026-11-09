import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { composeCutout, maskBox, preprocess, upsampleMask } from "../src/utility/segmentation/compose.js";
import { SegmentModelManager } from "../src/utility/segmentation/models.js";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

describe("segmentation compose (D21)", () => {
  it("upsampleMask thresholds logits at 0 (positive = object)", () => {
    const grid = 4, logits = new Float32Array(grid * grid);
    logits.fill(-1);
    logits[5] = 2; // one positive cell
    const m = upsampleMask(logits, grid, 8, 8);
    expect(m).toHaveLength(64);
    expect(new Set(m).size).toBeLessThanOrEqual(2);
    expect(m.some((v) => v === 255)).toBe(true);
  });

  it("composeCutout keeps pixels and writes mask as alpha (PNG roundtrip)", () => {
    const w = 3, h = 2;
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255]);
    const mask = new Uint8Array([255, 255, 255, 0, 0, 0]);
    const png = PNG.sync.read(Buffer.from(composeCutout(rgba, mask, w, h)));
    expect([png.width, png.height]).toEqual([w, h]);
    expect(Array.from(png.data.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(png.data[15]).toBe(0); // masked out pixel becomes transparent
  });

  it("maskBox returns tight fractions and full frame when empty", () => {
    const m = new Uint8Array(10 * 10);
    m[12] = 255; m[22] = 255; // x1..2, y1..2
    expect(maskBox(m, 10, 10)).toEqual([0.2, 0.1, 0.3, 0.3]);
    expect(maskBox(new Uint8Array(100), 10, 10)).toEqual([0, 0, 1, 1]);
  });

  it("preprocess normalizes to (x-0.5)/0.5 CHW at 1008", () => {
    const w = 2, h = 1;
    const rgba = new Uint8Array([0, 128, 255, 255, 255, 255, 255, 255]);
    const out = preprocess(rgba, w, h);
    expect(out).toHaveLength(3 * 1008 * 1008);
    // nearest-sample squash: column 0 samples x=0, later columns sample x=1
    expect(out[0]).toBeCloseTo(-1);
    expect(out[1008 * 1008]).toBeCloseTo(0.00392, 3);
  });
});

describe("SegmentModelManager", () => {
  const fixture = { name: "tiny.onnx", url: "https://example.invalid/tiny.onnx", bytes: 4, sha256: "" };

  async function withDir(): Promise<string> {
    return mkdtemp(path.join(tmpdir(), "oia-seg-"));
  }

  it("rejects a checksum mismatch and removes the tmp file (no half install)", async () => {
    const dir = await withDir();
    try {
      const body = new Uint8Array([9, 9, 9, 9]);
      const fetchImpl = (async () => new Response(body)) as unknown as typeof fetch;
      const mgr = new SegmentModelManager(dir, fetchImpl, [{ ...fixture, sha256: createHash("sha256").update(new Uint8Array([1, 2, 3, 4])).digest("hex") }]);
      await expect(mgr.download()).rejects.toThrow(/checksum mismatch/);
      await expect(stat(path.join(dir, "tiny.onnx"))).rejects.toThrow();
      await expect(stat(path.join(dir, "tiny.onnx.tmp"))).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("installs on matching checksum (atomic rename) and reports ready", async () => {
    const dir = await withDir();
    try {
      const body = new Uint8Array([1, 2, 3, 4]);
      const sha = createHash("sha256").update(body).digest("hex");
      const fetchImpl = (async () => new Response(body)) as unknown as typeof fetch;
      const mgr = new SegmentModelManager(dir, fetchImpl, [{ ...fixture, sha256: sha }]);
      await mgr.download();
      const st = await mgr.ensureStatus();
      expect(st).toMatchObject({ state: "ready", dir });
      expect((await readFile(path.join(dir, "tiny.onnx"))).length).toBe(4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
