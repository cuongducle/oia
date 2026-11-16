#!/usr/bin/env node
/**
 * REAL-quota end-to-end for the D24 region lane of "Make text editable"
 * (owner decision 2026-11-13; owner pre-approved real-run quota 2026-11-10).
 *
 *   node scripts/d24-region-real.mjs <page.png> <outDir> '<regionJson>'
 *   regionJson example: '{"left":20,"top":72,"width":580,"height":460}'
 *
 * Three stages, production code at every step:
 *  1. CROP (0 quota, hidden Electron window): the region becomes an integer
 *     pixel window through regionPixelWindow and cropPngBytes, the exact DOM
 *     path the editor runs on a page export at scale 1.
 *  2. TASK (real quota): scripts/task-real.mjs deconstruct on the crop, the
 *     generic versioned harness with provider evidence + quota meter.
 *  3. REPLAY (0 quota, hidden Electron window): production matchedDeconstructScene
 *     on the crop (Lens deliberately disabled, same scope as
 *     deconstruct-render-real) + production regionOverlayObjects onto the page,
 *     then the D24 promise is measured in pixels: NOTHING outside the region
 *     may change versus the original page (renderer roundtrip noise included).
 */
import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, access, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import electron from "electron";

const [, , pageArg, outDirArg, regionArg, modeArg] = process.argv;
if (!pageArg || !outDirArg || !regionArg) {
  console.error("usage: node scripts/d24-region-real.mjs <page.png> <outDir> '<regionJson>' [--resume]");
  process.exit(64);
}
const resume = modeArg === "--resume";
const page = path.resolve(pageArg);
const outDir = path.resolve(outDirArg);
const region = JSON.parse(regionArg);
for (const k of ["left", "top", "width", "height"]) {
  if (!Number.isFinite(region[k])) throw new Error(`region.${k} must be a number`);
}
await mkdir(outDir, { recursive: true });
const refuse = resume
  ? ["summary.json", "final-page.png", "page-baseline.png"]
  : ["region.json", "crop.png", "summary.json", "final-page.png", "page-baseline.png"];
for (const name of refuse) {
  if (await access(path.join(outDir, name)).then(() => true, () => false)) {
    throw new Error(`Refusing to overwrite real-run evidence: ${outDir}. Use a new run directory.`);
  }
}

const desktop = path.resolve(import.meta.dirname, "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pageBytes = new Uint8Array(await readFile(page));
const pageB64 = Buffer.from(await readFile(page)).toString("base64"); // SAFETY: plain Uint8Array.toString ignores the encoding arg (Node 25)
const ihdr = new DataView(pageBytes.buffer, pageBytes.byteOffset, pageBytes.byteLength);
const W = ihdr.getUint32(16), H = ihdr.getUint32(20); // PNG IHDR
const pageDataUrl = `data:image/png;base64,${pageB64}`;

/** A hidden Electron window running bundled browser code; `code` must define window.go. */
async function inWindow(bundleSrc, payload) {
  const dir = mkdtempSync(path.join(tmpdir(), "oia-d24-"));
  try {
    const css = (await readFile(path.join(desktop, "src/renderer/app.css"), "utf8")).split("\n")
      .filter((l) => l.startsWith("@font-face")).join("\n")
      .replaceAll('url("fonts/', `url("${pathToFileURL(path.join(desktop, "src/renderer/fonts/")).href}`);
    await build({ stdin: { contents: bundleSrc, resolveDir: desktop }, bundle: true, format: "iife", outfile: path.join(dir, "bundle.js") });
    await writeFile(path.join(dir, "page.html"), `<html><head><style>${css}</style></head><body><script src="bundle.js"></script></body></html>`);
    await writeFile(path.join(dir, "payload.json"), JSON.stringify(payload));
    await writeFile(path.join(dir, "run.cjs"), `
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  win.webContents.on("console-message", (_e, _level, message) => console.log("PAGE", String(message).slice(0, 500)));
  win.webContents.on("render-process-gone", (_e, details) => console.log("GONE", JSON.stringify(details)));
  await win.loadFile(${JSON.stringify(path.join(dir, "page.html"))});
  const payload = fs.readFileSync(${JSON.stringify(path.join(dir, "payload.json"))}, "utf8");
  try {
    const result = await win.webContents.executeJavaScript(
      "window.go(" + payload + ").then((r) => ({ ok: true, r }), " +
      "(e) => ({ ok: false, name: String(e && e.name), message: String(e && e.message), stack: String(e && e.stack), own: Object.getOwnPropertyNames(e || {}) }))");
    if (!result.ok) { console.error("GOFAIL", JSON.stringify(result)); }
    fs.writeFileSync(${JSON.stringify(path.join(dir, "result.json"))}, JSON.stringify(result.r ?? result));
    app.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error("WINERR", JSON.stringify(error, Object.getOwnPropertyNames(error)) , String((error && error.stack) || ""));
    app.exit(1);
  }
});`);
    const res = spawnSync(electron, [path.join(dir, "run.cjs")], { stdio: "inherit", timeout: 300000, cwd: dir });
    if (res.error) throw res.error;
    if (res.status !== 0) throw new Error(`window stage exited ${res.status}`);
    return JSON.parse(await readFile(path.join(dir, "result.json"), "utf8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const lib = (name) => JSON.stringify(path.join(desktop, `src/renderer/lib/${name}.ts`));

// ---- stage 1: the crop, through the production DOM path ----
let cropResult;
if (resume) {
  const saved = JSON.parse(await readFile(path.join(outDir, "region.json"), "utf8"));
  cropResult = { win: saved.win, pngB64: (await readFile(path.join(outDir, "crop.png"))).toString("base64") };
  console.log(`[d24] resume: crop reused, 0 quota`);
} else {
  cropResult = await inWindow(`
import { cropPngBytes, regionPixelWindow } from ${lib("deconstruct-region")};
window.go = async ({ pageDataUrl, region, W, H }) => {
  const win = regionPixelWindow(region, W, H, 1); // editor export is multiplier 1; the page IS the export here
  const probe = await new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ ok: true, w: i.width, h: i.height });
    i.onerror = () => res({ ok: false, len: pageDataUrl.length, head: pageDataUrl.slice(0, 40) });
    i.src = pageDataUrl;
  });
  if (!probe.ok) return { probeFail: probe };
  const png = await cropPngBytes(pageDataUrl, win);
  return { win, pngB64: btoa(String.fromCharCode(...png)) };
};`, { pageDataUrl, region, W, H });
}
const win = cropResult.win;
if (cropResult.probeFail) throw new Error(`crop probe failed: ${JSON.stringify(cropResult.probeFail)}`);
if (win.w < 8 || win.h < 8) throw new Error(`degenerate crop window ${JSON.stringify(win)}`);
const cropBytes = Uint8Array.from(atob(cropResult.pngB64), (c) => c.charCodeAt(0));
if (!resume) {
  await writeFile(path.join(outDir, "crop.png"), cropBytes, { flag: "wx" });
  await writeFile(path.join(outDir, "region.json"), JSON.stringify({
    page: { file: path.basename(page), sha256: sha256(pageBytes), W, H },
    region, win, exportScale: 1,
    crop: { sha256: sha256(cropBytes), W: win.w, H: win.h },
  }, null, 2), { flag: "wx" });
}
console.log(`[d24] crop saved ${win.w}x${win.h} for region ${JSON.stringify(region)}`);

// ---- stage 2: the real task, through the versioned generic harness ----
const taskOut = path.join(outDir, "task");
if (!resume) {
  const taskRun = spawnSync(process.execPath, [
    path.join(desktop, "scripts/task-real.mjs"), "deconstruct",
    JSON.stringify({ fileUrl: `@file:${path.join(outDir, "crop.png")}` }),
    taskOut,
  ], { stdio: "inherit", timeout: 600000, cwd: desktop });
  if (taskRun.error) throw taskRun.error;
  if (taskRun.status !== 0) throw new Error(`task-real exited ${taskRun.status}; evidence in ${taskOut}`);
}

// ---- stage 3: production replay + the outside-region pixel promise ----
const final = JSON.parse(await readFile(path.join(taskOut, "final.json"), "utf8"));
const report = JSON.parse(await readFile(path.join(taskOut, "report.json"), "utf8"));
const plateBytes = await readFile(path.join(taskOut, report.saved[0].name));
const replay = await inWindow(`
import { matchedDeconstructScene } from ${lib("deconstruct-font-match")};
import { regionOverlayObjects } from ${lib("deconstruct-region")};
import { StaticCanvas } from "fabric";
window.go = async ({ pageDataUrl, cropB64, plateB64, texts, win, region, W, H }) => {
  console.log("GO CALLED", typeof pageDataUrl, typeof cropB64, texts.length, JSON.stringify(win));
  const step = async (name, fn) => { try { const v = await fn(); console.log("STEP", name, "ok"); return v; } catch (e) { console.log("STEP", name, "FAIL", JSON.stringify(e, Object.getOwnPropertyNames(e)), String(e && e.message)); throw e; } };
  await document.fonts.ready;
  const cropPng = Uint8Array.from(atob(cropB64), (c) => c.charCodeAt(0));
  const unavailable = async () => { throw new Error("Lens deliberately disabled in this replay"); };
  const matched = await step("match", () => matchedDeconstructScene(
    { png: cropPng, imageUrl: "data:image/png;base64," + plateB64, w: win.w, h: win.h, texts },
    { uploadAsset: unavailable, submitTask: unavailable, getTask: unavailable, cancelTask: unavailable },
    { stopped: () => false, onTask: () => {} },
  ));
  const overlay = await step("overlay", () => Promise.resolve(regionOverlayObjects(matched.scene, region, win)));
  const pageObject = { type: "Image", left: 0, top: 0, originX: "left", originY: "top", width: W, height: H, src: pageDataUrl };
  const renderScene = async (objects) => {
    const c = new StaticCanvas(null, { width: W, height: H, enableRetinaScaling: false });
    try {
      await c.loadFromJSON({ version: "6", objects });
      c.renderAll();
      return c.toDataURL({ format: "png" });
    } finally { c.dispose(); }
  };
  const baselinePng = await step("baseline", () => renderScene([pageObject]));
  const finalPng = await step("final", () => renderScene([pageObject, ...overlay]));
  const load = async (dataUrl) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("image load failed")); img.src = dataUrl; });
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, W, H).data;
  };
  const [orig, base, fin] = await Promise.all([load(pageDataUrl), load(baselinePng), load(finalPng)]);
  let baseOutside = 0, finOutside = 0, insideChanged = 0;
  const x0 = win.x, y0 = win.y, x1 = win.x + win.w, y1 = win.y + win.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
    const differs = (a) => orig[i] !== a[i] || orig[i + 1] !== a[i + 1] || orig[i + 2] !== a[i + 2] || orig[i + 3] !== a[i + 3];
    if (!inside) { if (differs(base)) baseOutside++; if (differs(fin)) finOutside++; }
    else if (differs(fin)) insideChanged++;
  }
  const textLayers = overlay.filter((o) => o.type === "Textbox");
  const inBounds = textLayers.every((t) =>
    t.left >= region.left - 2 && t.top >= region.top - 2 &&
    t.left <= region.left + region.width + 2 && t.top <= region.top + region.height + 2);
  return {
    baselinePng, finalPng,
    fontNote: matched.note,
    overlay: { plateCount: overlay.filter((o) => o.type === "Image").length, textCount: textLayers.length,
      texts: textLayers.map((t) => ({ text: t.text, left: t.left, top: t.top, fontSize: t.fontSize, fontFamily: t.fontFamily, fill: t.fill, angle: t.angle })) },
    metrics: { baseOutside, finOutside, insideChanged, inBounds, regionPx: win.w * win.h, pagePx: W * H },
  };
};
console.log("BUNDLE LOADED", typeof window.go);`, {
  pageDataUrl, cropB64: Buffer.from(cropBytes).toString("base64"), plateB64: plateBytes.toString("base64"),
  texts: final.taskResult.texts, win, region, W, H,
});
await writeFile(path.join(outDir, "page-baseline.png"), Buffer.from(replay.baselinePng.split(",")[1], "base64"), { flag: "wx" });
await writeFile(path.join(outDir, "final-page.png"), Buffer.from(replay.finalPng.split(",")[1], "base64"), { flag: "wx" });

// honest accounting: the renderer roundtrip itself may flip pixels; the promise
// is finOutside === baseOutside (the overlay added NOTHING outside the region)
const promiseKept = replay.metrics.finOutside === replay.metrics.baseOutside;
const summary = {
  feature: "D24 region make text editable (real run)",
  page: { file: path.basename(page), sha256: sha256(pageBytes), W, H },
  region, crop: { W: win.w, H: win.h, sha256: sha256(cropBytes) },
  task: { taskId: report.taskId, progress: final.progress, elapsedMs: report.elapsedMs, quota: report.quota,
    note: report.note, texts: final.taskResult.texts.length },
  replay: { scope: "Production matchedDeconstructScene (Lens deliberately disabled) + regionOverlayObjects; no provider quota.",
    fontNote: replay.fontNote, overlay: replay.overlay, metrics: replay.metrics, promiseKept },
};
await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), { flag: "wx" });
console.log(`[d24] summary ${JSON.stringify({ task: summary.task, metrics: replay.metrics, promiseKept }, null, 2)}`);
if (!promiseKept) {
  console.error("D24 PROMISE VIOLATED: pixels outside the region changed beyond the renderer roundtrip noise.");
  process.exit(2);
}
console.log("[d24] OK: outside-region pixels unchanged (== renderer baseline), overlay merged additively.");
