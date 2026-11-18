#!/usr/bin/env node
/**
 * REAL SIL SL-1 run: generate ONE image through the exact request the Loop
 * view sends (pages=1, no outline gate, research + auto refine at their
 * owner-approved defaults) over the REAL codex pair, in plain node like every
 * other *-real.mjs harness. Verifies the winner canvas asset is a REAL image
 * (byte size + dims), not the 8x8 mock placeholder, and records quota +
 * verdict for the evidence dir.
 *
 * Usage:
 *   node scripts/loop-real.mjs "<prompt>" <outDir>
 */
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const promptArg = process.argv[2];
const outDirArg = process.argv[3];
if (!promptArg || !outDirArg) {
  console.error('usage: node scripts/loop-real.mjs "<prompt>" <outDir>');
  process.exit(64);
}
const outDir = path.resolve(outDirArg);
await mkdir(outDir, { recursive: true });

const { runChat } = await import("@oia/services");
const { makeRealCtx } = await import("./real-lib.mjs");
const ctx = await makeRealCtx(outDir, { CODEX_IMAGE_TIMEOUT_MS: "300000" });

// exactly what Loop.tsx submit() builds with the default prefs:
// pages 1, research on, auto refine on, no width/height (Auto ratio)
const events = [];
const t0 = Date.now();
console.log("[sil-real] runChat dispatching (pages=1, research+auto-refine defaults)…");
const result = await runChat({ prompt: promptArg, pages: 1, research: true, selfImprove: true }, ctx, { sink: (ev) => events.push(ev) });
console.log("[sil-real] settled:", result.outcome, "events:", events.length);

const urls = [...new Set(JSON.stringify(events).match(/\/api\/files\/[^"\\]+/g) ?? [])].filter((u) => u.endsWith(".png"));
let generatedImage = null;
let bytes = 0;
if (urls.length) {
  generatedImage = urls[urls.length - 1];
  const buf = await ctx.files.read(generatedImage.replace(/^\/api\/files\//, ""));
  bytes = buf.length;
  await writeFile(path.join(outDir, "generated.png"), buf);
}
const dims = bytes
  ? await (async () => {
      // PNG IHDR: width at byte 16, height at 20 (big-endian)
      const head = (await readFile(path.join(outDir, "generated.png"))).subarray(0, 24);
      return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
    })()
  : null;
const selfImprove = events.filter((e) => e.renderData?.selfImprove).map((e) => e.renderData.selfImprove);
const researchNotes = events.filter((e) => e.renderData?.researchNotes).map((e) => e.renderData.researchNotes).flat();

const report = {
  feature: "SIL SL-1 single generate (real)",
  request: { prompt: promptArg, pages: 1, research: true, selfImprove: true },
  outcome: result.outcome,
  generatedImage,
  bytes,
  dims,
  isRealImage: Boolean(dims && (dims.w >= 512 || dims.h >= 512) && bytes > 20_000),
  selfImprove: selfImprove[selfImprove.length - 1] ?? null,
  researchNotes: researchNotes.length,
  elapsedMs: Date.now() - t0,
  quota: ctx.chat.meter.snapshot(),
  eventCount: events.length,
};
await writeFile(path.join(outDir, "result.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(result.outcome === "completed" && report.isRealImage ? 0 : 1);
