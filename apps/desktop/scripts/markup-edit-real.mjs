#!/usr/bin/env node
/**
 * REAL ME markup-edit run (matrix A): phase 1 builds the composite with the
 * PRODUCTION markupComposite in a real Chromium (fabric-free, needs a DOM
 * canvas); phase 2 runs the PRODUCTION runChat (editMode.markup=flatten) over
 * the real codex pair in PLAIN NODE. The phases are separate processes on
 * purpose: runChat inside Electron MAIN hung mid-run (undiagnosed, recorded in
 * the coverage matrix); production runs it in the utility process, so the node
 * phase is the same code in a proven host.
 *
 * Usage:
 *   node scripts/markup-edit-real.mjs <input.png> <prompt> <outDir> [--stroke x1,y1,x2,y2]
 * The default stroke is a circle around the given bbox (from the remove-bg run)
 * padded 50px, the seller-like "circle this" gesture.
 */
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const argv = process.argv.slice(2);
const inputArg = argv[0];
const promptArg = argv[1];
const outDirArg = argv[2];
if (!inputArg || !promptArg || !outDirArg) {
  console.error("usage: node scripts/markup-edit-real.mjs <input.png> <prompt> <outDir> [--stroke x1,y1,x2,y2]");
  process.exit(64);
}
const DESKTOP = import.meta.dirname;
const outDir = path.resolve(outDirArg);
await mkdir(outDir, { recursive: true });
const input = path.resolve(inputArg);

// ---- phase 1: composite (production markupComposite, real Chromium) -------
const tmp = mkdtempSync(path.join(tmpdir(), "oia-me-real-"));
const entry = path.join(tmp, "me-entry.mjs");
await writeFile(entry, `import { markupComposite } from ${JSON.stringify(path.join(DESKTOP, "../src/renderer/lib/markup-annotate.ts"))};
window.__meComposite = async (b64, strokes, w, h) => await markupComposite("data:image/png;base64," + b64, strokes, w, h);
`);
const bundle = path.join(tmp, "me-bundle.js");
const es = spawnSync("npx", ["esbuild", entry, "--bundle", "--format=iife", `--outfile=${bundle}`], { cwd: DESKTOP, encoding: "utf8" });
if (es.status !== 0) { console.error(es.stderr); process.exit(1); }
const runCjs = path.join(tmp, "composite.cjs");
await writeFile(runCjs, `const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const { readFileSync, writeFileSync } = require("node:fs");
const dir = ${JSON.stringify(tmp)}; const outDir = ${JSON.stringify(outDir)}; const input = ${JSON.stringify(input)};
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadFile(${JSON.stringify(path.join(tmp, "me.html"))});
  const pngB64 = readFileSync(input).toString("base64");
  const { w, h } = await win.webContents.executeJavaScript('new Promise(r => { const i = new Image(); i.onload = () => r({w: i.naturalWidth, h: i.naturalHeight}); i.src = "data:image/png;base64,' + pngB64 + '"; })');
  const cx = (454 + 799) / 2, cy = (112 + 1127) / 2, rx = (799 - 454) / 2 + 50, ry = (1127 - 112) / 2 + 50;
  const stroke = Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return { x: Math.round(cx + rx * Math.cos(a)), y: Math.round(cy + ry * Math.sin(a)) }; });
  const composite = await win.webContents.executeJavaScript('window.__meComposite(' + JSON.stringify(pngB64) + ', ' + JSON.stringify([stroke]) + ', ' + w + ', ' + h + ')');
  writeFileSync(path.join(outDir, "composite.png"), Buffer.from(composite.split(",")[1], "base64"));
  console.log("[me-real] composite " + w + "x" + h);
  app.exit(0);
});`);
await writeFile(path.join(tmp, "me.html"), `<html><body><script src="${path.basename(bundle)}"></script></body></html>`);
const phase1 = spawnSync("npx", ["electron", runCjs], { cwd: DESKTOP, encoding: "utf8", timeout: 120_000 });
console.log("[me-real] phase1 status:", phase1.status, "signal:", phase1.signal, "stdout:", (phase1.stdout ?? "").slice(0, 300), "stderr:", (phase1.stderr ?? "").slice(0, 300));
if (phase1.status !== 0) { console.error("[me-real] composite phase failed"); process.exit(1); }
// Electron exits 0 even on an unhandled rejection inside the page handler:
// the artifact is the real verdict, never the exit code alone
const { existsSync } = await import("node:fs");
if (!existsSync(path.join(outDir, "composite.png"))) { console.error("[me-real] phase1 exited 0 but wrote no composite (silent page failure)"); process.exit(1); }
console.log((phase1.stdout ?? "").trim());

// ---- phase 2: the production edit call in plain node ----------------------
const { runChat } = await import("@oia/services");
const { makeRealCtx } = await import("./real-lib.mjs");
const ctx = await makeRealCtx(outDir, { CODEX_IMAGE_TIMEOUT_MS: "300000" });
const composite = "data:image/png;base64," + (await readFile(path.join(outDir, "composite.png"))).toString("base64");
const events = [];
const t0 = Date.now();
console.log("[me-real] runChat dispatching (markup flatten, real pair)…");
const result = await runChat({ prompt: promptArg, referenceImages: [composite], editMode: { markup: "flatten", targetName: "markup target" } }, ctx, { sink: (ev) => events.push(ev) });
console.log("[me-real] settled:", result.outcome, "events:", events.length);
const urls = [...new Set(JSON.stringify(events).match(/\/api\/files\/[^"\\]+/g) ?? [])].filter((u) => u.endsWith(".png"));
let resultImage = null;
if (urls.length) {
  resultImage = urls[urls.length - 1];
  await writeFile(path.join(outDir, "edited.png"), await ctx.files.read(resultImage.replace(/^\/api\/files\//, "")));
}
const report = {
  feature: "ME markup-edit flatten (real)",
  outcome: result.outcome,
  resultImage,
  elapsedMs: Date.now() - t0,
  quota: ctx.chat.meter.snapshot(),
  eventCount: events.length,
  note: "phase1 composite = production markupComposite in Chromium (bundle built in tmpdir, never in evidence); phase2 = production runChat in plain node",
};
await writeFile(path.join(outDir, "result.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(result.outcome === "completed" && resultImage ? 0 : 1);
