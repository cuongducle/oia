import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import { z } from "zod";
import type { DeconstructText } from "@oia/schema";
import type { FontRecognizer, RecognizedFont } from "@oia/tasks";
import { f32ToB64, b64ToF32, type SegmentRunner } from "./segmentation/runner.js";

const entrySchema = z.object({
  family: z.string().min(1).max(120), license: z.string(), vietnamese: z.boolean(),
  variants: z.array(z.object({ weight: z.number(), style: z.string(), url: z.string().url() })),
});
const manifestSchema = z.object({ height: z.literal(128), width: z.literal(384), classes: z.literal(983), files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) });

function cubic(x: number) {
  const v = Math.abs(x);
  return v <= 1 ? 1.5 * v ** 3 - 2.5 * v ** 2 + 1 : v < 2 ? -0.5 * v ** 3 + 2.5 * v ** 2 - 4 * v + 2 : 0;
}

/** Aspect-preserving bicubic resize, sampled-border padding, grayscale, ImageNet CHW. */
export function lensTensor(src: PNG): Float32Array {
  const W = 384, H = 128, scale = Math.min(W / src.width, H / src.height);
  const rw = Math.min(W, Math.max(1, Math.round(src.width * scale))), rh = Math.min(H, Math.max(1, Math.round(src.height * scale)));
  const left = Math.floor((W - rw) / 2), top = Math.floor((H - rh) / 2);
  let sum = 0, count = 0;
  const gray = (x: number, y: number) => {
    const i = (Math.max(0, Math.min(src.height - 1, y)) * src.width + Math.max(0, Math.min(src.width - 1, x))) * 4;
    return 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
  };
  for (let x = 0; x < src.width; x += Math.max(1, Math.floor(src.width / 50))) { sum += gray(x, 0) + gray(x, src.height - 1); count += 2; }
  for (let y = 0; y < src.height; y += Math.max(1, Math.floor(src.height / 50))) { sum += gray(0, y) + gray(src.width - 1, y); count += 2; }
  const pad = Math.round(sum / count), output = new Float32Array(3 * W * H);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let value = pad;
    if (x >= left && x < left + rw && y >= top && y < top + rh) {
      const sx = (x - left + 0.5) * src.width / rw - 0.5, sy = (y - top + 0.5) * src.height / rh - 0.5;
      const ix = Math.floor(sx), iy = Math.floor(sy); let total = 0, weight = 0;
      for (let yy = iy - 1; yy <= iy + 2; yy++) for (let xx = ix - 1; xx <= ix + 2; xx++) {
        const k = cubic(sx - xx) * cubic(sy - yy); total += gray(xx, yy) * k; weight += k;
      }
      value = Math.max(0, Math.min(255, Math.round(total / weight)));
    }
    for (let c = 0; c < 3; c++) output[c * W * H + y * W + x] = (value / 255 - mean[c]) / std[c];
  }
  return output;
}

/** Reuse OCR geometry, deskew, then select the longest foreground run (no Tesseract). */
export function lensWordCrop(src: PNG, t: DeconstructText): PNG {
  const w = Math.max(1, Math.min(2048, Math.round(t.box.w * src.width))), h = Math.max(1, Math.min(512, Math.round(t.box.h * src.height)));
  const crop = new PNG({ width: w, height: h });
  const angle = (t.typography?.angle ?? 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const ink = [1, 3, 5].map((i) => parseInt((t.typography?.fill ?? "#000000").slice(i, i + 2), 16));
  const columns = new Uint8Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) * t.box.w * src.width / w, v = (y + 0.5) * t.box.h * src.height / h;
    const xx = Math.round(t.box.x * src.width + u * cos - v * sin), yy = Math.round(t.box.y * src.height + u * sin + v * cos);
    const out = (y * w + x) * 4;
    if (xx < 0 || yy < 0 || xx >= src.width || yy >= src.height) { crop.data.set([255, 255, 255, 255], out); continue; }
    const i = (yy * src.width + xx) * 4;
    const alpha = src.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) crop.data[out + c] = Math.round(src.data[i + c] * alpha + 255 * (1 - alpha));
    crop.data[out + 3] = 255;
    if (ink.reduce((d, c, k) => d + (crop.data[out + k] - c) ** 2, 0) <= 55 ** 2) columns[x] = 1;
  }
  const gap = Math.max(3, Math.round(h * 0.18));
  let start = 0, blank = 0, bestStart = 0, bestEnd = w;
  const runs: [number, number][] = [];
  for (let x = 0; x < w; x++) {
    blank = columns[x] ? 0 : blank + 1;
    if (blank >= gap) { if (x - blank + 1 > start) runs.push([start, x - blank + 1]); start = x + 1; }
  }
  if (w - blank > start) runs.push([start, w - blank]);
  const best = runs.filter(([a, b]) => b - a >= h * 0.5).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
  if (best) { bestStart = Math.max(0, best[0] - 2); bestEnd = Math.min(w, best[1] + 2); }
  const output = new PNG({ width: Math.max(1, bestEnd - bestStart), height: h });
  PNG.bitblt(crop, output, bestStart, 0, output.width, h, 0, 0);
  return output;
}

export class LensRecognizer implements FontRecognizer {
  private loaded: Promise<{ catalog: z.infer<typeof entrySchema>[] }> | null = null;
  constructor(
    private readonly dir: string,
    private readonly runner: SegmentRunner,
  ) {}
  private load() {
    this.loaded ??= (async () => {
      const manifest = manifestSchema.parse(JSON.parse(await readFile(path.join(this.dir, "manifest.json"), "utf8")));
      const model = await readFile(path.join(this.dir, "lens.onnx")), catalogBytes = await readFile(path.join(this.dir, "catalog.json"));
      for (const [name, bytes] of [["lens.onnx", model], ["catalog.json", catalogBytes]] as const) {
        if (createHash("sha256").update(bytes).digest("hex") !== manifest.files[name]) throw new Error(`Lens checksum mismatch: ${name}`);
      }
      const catalog = z.array(entrySchema).length(983).parse(JSON.parse(catalogBytes.toString("utf8")));
      return { catalog };
    })().catch((e) => { this.loaded = null; throw e; });
    return this.loaded;
  }
  async recognize(png: Uint8Array, texts: DeconstructText[], signal: AbortSignal): Promise<RecognizedFont[]> {
    signal.throwIfAborted();
    const { catalog } = await this.load();
    const image = PNG.sync.read(Buffer.from(png));
    const results: RecognizedFont[] = [];
    for (const [lineIndex, t] of texts.entries()) {
      if (lineIndex >= 6) break;
      signal.throwIfAborted();
      if (!t.typography || !t.box.w || !t.box.h) continue;
      // the session run lives in the native sidecar (same reason as SAM:
      // ORT does not belong inside an Electron process); preprocess + ranking stay here
      const tensor = lensTensor(lensWordCrop(image, t));
      const resp = await this.runner.request({
        op: "lens",
        lens_dir: this.dir,
        pixels: { dims: [1, 3, 128, 384], data: f32ToB64(tensor) },
      });
      signal.throwIfAborted();
      if (resp.op !== "lens") throw new Error(`Lens runner failed: ${JSON.stringify(resp).slice(0, 120)}`);
      const logits = Array.from(b64ToF32(resp.logits.data), Number);
      if (logits.some((v) => !Number.isFinite(v))) throw new Error("Lens returned invalid logits");
      const max = Math.max(...logits), total = logits.reduce((sum, v) => sum + Math.exp(v - max), 0);
      const order = logits.map((v, i) => ({ i, score: Math.exp(v - max) / total })).sort((a, b) => b.score - a.score);
      const needsVietnamese = /[\u0102-\u01b0\u1ea0-\u1ef9]/u.test(t.text);
      let n = 0;
      for (const hit of order.slice(0, 20)) {
        const f = catalog[hit.i];
        if (f.license !== "OFL" || needsVietnamese && !f.vietnamese || !/^[\p{L}\p{N} ._'\-]+$/u.test(f.family)) continue;
        const variants = f.variants.filter((v) => v.style === t.typography?.fontStyle);
        const variant = variants.sort((a, b) => Math.abs(a.weight - (t.typography?.fontWeight ?? 400)) - Math.abs(b.weight - (t.typography?.fontWeight ?? 400)))[0];
        if (!variant) continue;
        const slug = f.family.toLowerCase().replace(/[^a-z0-9]/g, "");
        results.push({ lineIndex, family: f.family, score: hit.score, weight: variant.weight, style: variant.style === "italic" ? "italic" : "normal", variable: variant.url.includes("["), url: variant.url, licenseUrl: `https://raw.githubusercontent.com/google/fonts/main/ofl/${slug}/OFL.txt` });
        if (++n >= 6) break;
      }
    }
    return results;
  }
}
