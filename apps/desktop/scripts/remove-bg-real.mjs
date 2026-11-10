#!/usr/bin/env node
/**
 * REAL-data run of remove-background through the PRODUCTION processor + the
 * REAL rembg CLI (SG-9 real-data gate; owner approved 2026-11-10). Optionally
 * generates the test photo with real image quota first (the seller journey:
 * generated product photo → background removed), unless --input is given.
 *
 * Usage:
 *   PATH=/path/to/venv/bin:$PATH node scripts/remove-bg-real.mjs \
 *     [--input photo.png] <outDir>
 * The rembg binary must be on PATH (pip install "rembg[cli]"), first run
 * downloads the u2net model (~176 MB, one-time, local, no provider quota).
 */
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const args = process.argv.slice(2);
const inputIdx = args.indexOf("--input");
const inputArg = inputIdx >= 0 ? args[inputIdx + 1] : null;
const outDirArg = args.filter((a, i) => a !== "--input" && args[i - 1] !== "--input").find((a) => !a.startsWith("-"));
if (!outDirArg) {
  console.error("usage: node scripts/remove-bg-real.mjs [--input photo.png] <outDir>");
  process.exit(64);
}
const outDir = path.resolve(outDirArg);
await mkdir(outDir, { recursive: true });

const { makeRealCtx } = await import("./real-lib.mjs");
const t0 = Date.now();
const ctx = await makeRealCtx(outDir);

let inputBytes;
let generated = false;
if (inputArg) {
  inputBytes = new Uint8Array(await readFile(path.resolve(inputArg)));
} else {
  // The seller journey, with real quota: a product photo to cut out.
  console.log("[rbg-real] generating the product photo (1 real image)…");
  const started = await ctx.taskStore.submit("generate-poster", { prompt: "e-commerce product photo of a cosmetic serum bottle standing on a plain pastel background, studio lighting, centered, no text", size: "1024x1024" }, { noWait: true });
  if (started.progress !== "succeeded" || !started.taskResult?.download) {
    console.error("[rbg-real] photo generation failed", started.msg);
    process.exit(1);
  }
  inputBytes = await ctx.files.read(started.taskResult.download.replace(/^\/api\/files\//, ""));
  await writeFile(path.join(outDir, "input-product.png"), inputBytes);
  generated = true;
}

const uploaded = await ctx.files.put(inputBytes, "png");
console.log(`[rbg-real] uploaded ${inputBytes.length} bytes (generated=${generated})`);
const final = await ctx.taskStore.submit("remove-background", { fileUrl: uploaded.url }, { noWait: true });
const report = {
  feature: "SG-9 remove-background",
  generatedInput: generated,
  elapsedMs: Date.now() - t0,
  progress: final.progress,
  errorClass: final.errorClass ?? null,
  msg: final.msg || null,
  quota: ctx.chat.meter.snapshot(),
};
await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
if (final.progress !== "succeeded" || !final.taskResult?.download) {
  console.error("[rbg-real] FAILED", JSON.stringify(report, null, 2));
  process.exit(1);
}
const out = await ctx.files.read(final.taskResult.download.replace(/^\/api\/files\//, ""));
await writeFile(path.join(outDir, "output-cutout.png"), out);
console.log("[rbg-real] OK", JSON.stringify({ ...report, bytes: out.length }, null, 2));
process.exit(0);
