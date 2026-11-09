import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LensRecognizer, lensTensor, lensWordCrop } from "../src/utility/lens.js";
import { deconstructTextSchema } from "@oia/schema";

function solid(w: number, h: number, rgb: [number, number, number]) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([...rgb, 255], i);
  return png;
}
const line = (text = "Cà phê") => deconstructTextSchema.parse({
  text, box: { x: 0.25, y: 0.4, w: 0.5, h: 0.12 },
  typography: { fontFamily: "serif", fontWeight: 400, fontStyle: "normal", fill: "#e52233", angle: 0, spacingEm: 0, textAlign: "left" },
});

describe("D23 Lens preprocessing", () => {
  it("produces the 3x128x384 ImageNet grid, padded with the sampled border color", () => {
    const gray = lensTensor(solid(80, 24, [255, 0, 0]));
    expect(gray).toHaveLength(3 * 128 * 384);
    // 0xFF0000 grayscale = 76/255 = 0.298; per-channel ImageNet normalization.
    const expected = (0.29804 - 0.485) / 0.229;
    expect(gray[0]).toBeCloseTo(expected, 3);
    expect(gray.every((v) => Number.isFinite(v) && v > -6 && v < 6)).toBe(true);
  });

  it("selects the longest foreground run and drops blank side margins", () => {
    const src = solid(200, 40, [255, 255, 255]);
    const t = line("ab cd");
    // two ink clusters inside the OCR window (x 50..150): a short one and a long one
    for (let x = 55; x < 65; x++) for (let y = 10; y < 30; y++) src.data.set([229, 34, 51, 255], (y * 200 + x) * 4);
    for (let x = 80; x < 145; x++) for (let y = 10; y < 30; y++) src.data.set([229, 34, 51, 255], (y * 200 + x) * 4);
    const crop = lensWordCrop(src, t);
    // box w = 0.5*200 = 100 wide crop window; the long run (80px) dominates
    expect(crop.width).toBeGreaterThan(60);
    let ink = 0;
    for (let i = 0; i < crop.data.length; i += 4) if (Math.abs(crop.data[i] - 229) < 10) ink++;
    expect(ink).toBeGreaterThan(300);
  });

  it("refuses to run a model whose checksum does not match the manifest", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "oia-lens-"));
    try {
      writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ height: 128, width: 384, classes: 983, files: { "lens.onnx": "0".repeat(64), "catalog.json": "0".repeat(64) } }));
      writeFileSync(path.join(dir, "lens.onnx"), new Uint8Array(8));
      writeFileSync(path.join(dir, "catalog.json"), "[]");
      const recognizer = new LensRecognizer(dir);
      await expect(recognize(recognizer)).rejects.toThrow(/checksum/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

async function recognize(recognizer: LensRecognizer) {
  return recognizer.recognize(PNG.sync.write(solid(10, 10, [0, 0, 0])), [line()], new AbortController().signal);
}
