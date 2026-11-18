#!/usr/bin/env node
/**
 * Marker-color probe (owner question 18/11: does the model really need SOLID
 * RED markers?). One artwork, one region, one instruction; the only variable
 * is the marker's paint: solid red (production baseline), thin red, red +
 * 8% fill, solid blue, solid yellow, solid black.
 *
 * The edit round is the production channel (runChat, editMode.markup=flatten)
 * with the production prompt shape ("Region 1 (COLOR box): ... Remove every
 * marker."). Scoring is done afterwards in Python (pixel truth, no eyeballing).
 *
 * Usage:
 *   node scripts/marker-color-probe.mjs <input.png> <outDir> <variant> <x> <y> <w> <h>
 * variant: red-solid | red-thin | red-fill8 | blue-solid | yellow-solid | black-solid
 */
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const [inputArg, outDirArg, variant, mx, my, mw, mh] = process.argv.slice(2);
if (!inputArg || !outDirArg || !variant) {
  console.error("usage: node scripts/marker-color-probe.mjs <input.png> <outDir> <variant> <x> <y> <w> <h>");
  process.exit(64);
}
const VARIANTS = {
  "no-marker": { css: "", lw: 0, fill: null, label: "no marker" },
  "scribble": { css: "#ff0000", lw: 4, fill: null, label: "red scribble" },
  "scribble-text": { css: "#ff0000", lw: 4, fill: null, label: "red scribble with a handwritten note" },
  "red-solid": { css: "#ff0000", lw: 4, fill: null, label: "red box" },
  "red-thin": { css: "#ff0000", lw: 2, fill: null, label: "red box" },
  "red-fill8": { css: "#ff0000", lw: 4, fill: "rgba(255,0,0,0.08)", label: "red box" },
  "blue-solid": { css: "#2563eb", lw: 4, fill: null, label: "blue box" },
  "yellow-solid": { css: "#f59e0b", lw: 4, fill: null, label: "yellow box" },
  "black-solid": { css: "#111111", lw: 4, fill: null, label: "black box" },
};
const v = VARIANTS[variant];
if (!v) {
  console.error("unknown variant", variant);
  process.exit(64);
}
const DESKTOP = import.meta.dirname;
const outDir = path.resolve(outDirArg);
await mkdir(outDir, { recursive: true });
const input = path.resolve(inputArg);
const note = "repaint the marked balloon to solid purple (#7C3AED), keep its exact shape and position";

// ---- phase 1: composite the variant marker in a real Chromium --------------
const tmp = mkdtempSync(path.join(tmpdir(), "oia-marker-probe-"));
const pngB64 = (await readFile(input)).toString("base64");
if (variant === "no-marker") await writeFile(path.join(outDir, "composite.png"), Buffer.from(pngB64, "base64"));
const html = `<!doctype html><html><body><canvas id="c"></canvas><script>
const img = new Image();
img.onload = async () => {
  const c = document.getElementById("c");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  const v = ${JSON.stringify(v)};
  const box = { x: ${mx}, y: ${my}, w: ${mw}, h: ${mh} };
  const variant = ${JSON.stringify(variant)};
  if (variant === "scribble" || variant === "scribble-text") {
    // a hand-drawn-looking ellipse: 70 jittered points, open stroke, no chip
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const rx = box.w / 2 + 14, ry = box.h / 2 + 14;
    x.strokeStyle = v.css;
    x.lineWidth = v.lw;
    x.lineJoin = "round";
    x.lineCap = "round";
    x.beginPath();
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 2 - 1; };
    for (let i = 0; i <= 70; i++) {
      const t = (i / 70) * Math.PI * 2 - 0.4;
      const px2 = cx + Math.cos(t) * (rx + rnd() * 9);
      const py2 = cy + Math.sin(t) * (ry + rnd() * 9);
      if (i === 0) x.moveTo(px2, py2); else x.lineTo(px2, py2);
    }
    x.stroke();
    if (variant === "scribble-text") {
      x.fillStyle = v.css;
      x.font = "italic 700 40px Marker Felt, Chalkboard SE, system-ui, sans-serif";
      x.textAlign = "left";
      x.textBaseline = "middle";
      x.fillText("\u2192 PAINT PURPLE", cx - 60, cy - ry - 44);
    }
    window.__done = c.toDataURL("image/png");
    return;
  }
  if (v.fill) { x.fillStyle = v.fill; x.fillRect(box.x, box.y, box.w, box.h); }
  x.strokeStyle = v.css;
  x.lineWidth = v.lw;
  x.strokeRect(box.x, box.y, box.w, box.h);
  // chip with the region number, same language as the production composite
  const s = 30;
  x.fillStyle = v.css;
  x.fillRect(box.x, box.y - s - 4, s, s);
  x.fillStyle = "#ffffff";
  x.font = "700 20px system-ui, sans-serif";
  x.textBaseline = "middle";
  x.textAlign = "center";
  x.fillText("1", box.x + s / 2, box.y - s / 2 - 4);
  window.__done = c.toDataURL("image/png");
};
img.src = "data:image/png;base64,${pngB64}";
</script></body></html>`;
await writeFile(path.join(tmp, "probe.html"), html);
const runCjs = path.join(tmp, "probe.cjs");
if (variant === "no-marker") { console.log("[probe] no-marker composite = input"); }
await writeFile(runCjs, `const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const { writeFileSync } = require("node:fs");
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadFile(path.join(${JSON.stringify(tmp)}, "probe.html"));
  await new Promise((r) => setTimeout(r, 600));
  const dataUrl = await win.webContents.executeJavaScript("window.__done");
  writeFileSync(path.join(${JSON.stringify(outDir)}, "composite.png"), Buffer.from(dataUrl.split(",")[1], "base64"));
  app.exit(0);
});`);
if (variant !== "no-marker") {
  const ph = spawnSync("npx", ["electron", runCjs], { cwd: DESKTOP, encoding: "utf8", timeout: 120_000 });
  if (ph.status !== 0) {
    console.error("[probe] composite phase failed", ph.stdout, ph.stderr);
    process.exit(1);
  }
}
console.log(`[probe] ${variant} composite drawn`);

// ---- phase 2: the production edit call -------------------------------------
const { runChat } = await import("@oia/services");
const { makeRealCtx } = await import("./real-lib.mjs");
const ctx = await makeRealCtx(outDir, { CODEX_IMAGE_TIMEOUT_MS: "300000" });
const composite = "data:image/png;base64," + (await readFile(path.join(outDir, "composite.png"))).toString("base64");
const prompt =
  variant === "no-marker"
    ? `Edit this image. ${note}.`
    : variant === "scribble"
      ? `Edit this image. Repaint the balloon I circled with red scribble to solid purple (#7C3AED), keep everything else unchanged, and remove my scribble.`
      : variant === "scribble-text"
        ? `Edit this image. Follow the red handwritten note on the image, keep everything else unchanged, and remove every annotation.`
        : `Edit this image following the numbered marked regions.\nRegion 1 (${v.label}): ${note}. Also remove every marker from the image.`;
await writeFile(path.join(outDir, "prompt.txt"), prompt);
const events = [];
const t0 = Date.now();
console.log(`[probe] ${variant} runChat dispatching (markup flatten, real pair)…`);
const result = await runChat({ prompt, referenceImages: [composite], editMode: { markup: "flatten", targetName: "loop image" } }, ctx, { sink: (ev) => events.push(ev) });
console.log(`[probe] ${variant} settled:`, result.outcome, "events:", events.length);
const urls = [...new Set(JSON.stringify(events).match(/\/api\/files\/[^"\\]+/g) ?? [])].filter((u) => u.endsWith(".png"));
let bytes = 0;
let dims = null;
if (urls.length) {
  const buf = await ctx.files.read(urls[urls.length - 1].replace(/^\/api\/files\//, ""));
  bytes = buf.length;
  await writeFile(path.join(outDir, "edited.png"), buf);
  const head = buf.subarray(0, 24);
  dims = { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
}
const report = { feature: "SIL marker-color probe", variant, prompt, outcome: result.outcome, bytes, dims, elapsedMs: Date.now() - t0, quota: ctx.chat.meter.snapshot() };
await writeFile(path.join(outDir, "result.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
process.exit(result.outcome === "completed" && bytes > 0 ? 0 : 1);
