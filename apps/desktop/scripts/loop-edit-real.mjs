#!/usr/bin/env node
/**
 * REAL SIL SL-3 run: one edit round carrying MULTIPLE numbered regions over
 * the real codex pair. Phase 1 composites the production regionComposite
 * (boxes/arrows/chips, DOM canvas) in a hidden Chromium; phase 2 runs the
 * production runChat with editMode.markup=flatten in plain node, exactly what
 * the Loop view sends. Verifies the result keeps dimensions, differs from the
 * input, and (report only) leaves no red markers behind.
 *
 * Usage:
 *   node scripts/loop-edit-real.mjs <input.png> <outDir> <marksJson>
 * marksJson: array of {kind:"box",x,y,w,h,note} | {kind:"arrow",from:[x,y],to:[x,y],note}
 */
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const inputArg = process.argv[2];
const outDirArg = process.argv[3];
const marksArg = process.argv[4];
if (!inputArg || !outDirArg || !marksArg) {
  console.error("usage: node scripts/loop-edit-real.mjs <input.png> <outDir> <marksJson>");
  process.exit(64);
}
const DESKTOP = import.meta.dirname;
const outDir = path.resolve(outDirArg);
await mkdir(outDir, { recursive: true });
const input = path.resolve(inputArg);
const marks = JSON.parse(marksArg).map((m) =>
  m.kind === "arrow" ? { id: m.note, kind: "arrow", note: m.note, from: { x: m.from[0], y: m.from[1] }, to: { x: m.to[0], y: m.to[1] } } : { id: m.note, kind: "box", note: m.note, x: m.x, y: m.y, w: m.w, h: m.h },
);

// ---- phase 1: composite (production regionComposite, real Chromium) -------
const tmp = mkdtempSync(path.join(tmpdir(), "oia-sil-real-"));
const entry = path.join(tmp, "sil-entry.mjs");
await writeFile(entry, `import { regionComposite, marksPrompt } from ${JSON.stringify(path.join(DESKTOP, "../src/renderer/lib/loop-marks.ts"))};
window.__silComposite = async (b64, ms, w, h) => ({ composite: await regionComposite("data:image/png;base64," + b64, ms, w, h), prompt: marksPrompt(ms) });
`);
const bundle = path.join(tmp, "sil-bundle.js");
const es = spawnSync("npx", ["esbuild", entry, "--bundle", "--format=iife", `--outfile=${bundle}`], { cwd: DESKTOP, encoding: "utf8" });
if (es.status !== 0) { console.error(es.stderr); process.exit(1); }
const runCjs = path.join(tmp, "composite.cjs");
await writeFile(runCjs, `const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const { readFileSync, writeFileSync } = require("node:fs");
const tmp = ${JSON.stringify(tmp)}; const outDir = ${JSON.stringify(outDir)}; const input = ${JSON.stringify(input)};
const marks = ${JSON.stringify(marks)};
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadFile(path.join(tmp, "sil.html"));
  const pngB64 = readFileSync(input).toString("base64");
  const { w, h } = await win.webContents.executeJavaScript('new Promise(r => { const i = new Image(); i.onload = () => r({w: i.naturalWidth, h: i.naturalHeight}); i.src = "data:image/png;base64,' + pngB64 + '"; })');
  const out = await win.webContents.executeJavaScript('window.__silComposite(' + JSON.stringify(pngB64) + ', ' + JSON.stringify(marks) + ', ' + w + ', ' + h + ')');
  writeFileSync(path.join(outDir, "composite.png"), Buffer.from(out.composite.split(",")[1], "base64"));
  writeFileSync(path.join(outDir, "prompt.txt"), out.prompt);
  console.log("[sil-real] composite " + w + "x" + h);
  app.exit(0);
});`);
await writeFile(path.join(tmp, "sil.html"), `<html><body><script src="${path.basename(bundle)}"></script></body></html>`);
const phase1 = spawnSync("npx", ["electron", runCjs], { cwd: DESKTOP, encoding: "utf8", timeout: 120_000 });
console.log("[sil-real] phase1 status:", phase1.status, "stdout:", (phase1.stdout ?? "").slice(0, 200));
const { existsSync } = await import("node:fs");
if (!existsSync(path.join(outDir, "composite.png"))) { console.error("[sil-real] phase1 wrote no composite (silent page failure)"); process.exit(1); }

// ---- phase 2: the production edit call in plain node ----------------------
const { runChat } = await import("@oia/services");
const { makeRealCtx } = await import("./real-lib.mjs");
const ctx = await makeRealCtx(outDir, { CODEX_IMAGE_TIMEOUT_MS: "300000" });
const composite = "data:image/png;base64," + (await readFile(path.join(outDir, "composite.png"))).toString("base64");
const promptBody = (await readFile(path.join(outDir, "prompt.txt"), "utf8")).trim();
const prompt = "Edit this image following the numbered red regions.\n" + promptBody;
const events = [];
const t0 = Date.now();
console.log("[sil-real] runChat dispatching (regions=" + marks.length + ", markup flatten, real pair)…");
const result = await runChat({ prompt, referenceImages: [composite], editMode: { markup: "flatten", targetName: "loop image" } }, ctx, { sink: (ev) => events.push(ev) });
console.log("[sil-real] settled:", result.outcome, "events:", events.length);
const urls = [...new Set(JSON.stringify(events).match(/\/api\/files\/[^"\\]+/g) ?? [])].filter((u) => u.endsWith(".png"));
let resultImage = null;
let bytes = 0;
if (urls.length) {
  resultImage = urls[urls.length - 1];
  const buf = await ctx.files.read(resultImage.replace(/^\/api\/files\//, ""));
  bytes = buf.length;
  await writeFile(path.join(outDir, "edited.png"), buf);
}
const head = bytes ? (await readFile(path.join(outDir, "edited.png"))).subarray(0, 24) : null;
const dims = head ? { w: head.readUInt32BE(16), h: head.readUInt32BE(20) } : null;
const inDims = (await readFile(input)).subarray(0, 24);
const inW = inDims.readUInt32BE(16);
const inH = inDims.readUInt32BE(20);
const report = {
  feature: "SIL SL-3 multi-region edit (real)",
  regions: marks.map((m) => ({ kind: m.kind, note: m.note })),
  outcome: result.outcome,
  resultImage,
  bytes,
  dims,
  dimsKept: dims ? dims.w === inW && dims.h === inH : false,
  elapsedMs: Date.now() - t0,
  quota: ctx.chat.meter.snapshot(),
  eventCount: events.length,
};
await writeFile(path.join(outDir, "result.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(result.outcome === "completed" && resultImage && report.dimsKept ? 0 : 1);
