// Offline replay of ONE task-real run through production typography and font ranking.
// Usage: node scripts/deconstruct-render-real.mjs <runDir> <original.png>
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { atomicWriteJson, renameWithRetry } from "@oia/tasks";
import { access, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import electron from "electron";

const [, , runArg, originalArg, mode] = process.argv;
const diagnostic = mode === '--diagnostic';
if (!runArg || !originalArg) throw new Error("usage: deconstruct-render-real.mjs <runDir> <original.png>");
const desktop = path.resolve(import.meta.dirname, "..");
const run = path.resolve(runArg);
for (const name of ['reconstructed.png', 'replay.json']) {
  if (await access(path.join(run, name)).then(() => true, () => false)) throw new Error(`Refusing to overwrite replay evidence: ${run}`);
}
const provenance = diagnostic ? JSON.parse(await readFile(path.join(run, 'provenance.json'), 'utf8')) : null;
const final = diagnostic
  ? { taskResult: { texts: JSON.parse(await readFile(path.join(run, 'texts-final.json'), 'utf8')) } }
  : JSON.parse(await readFile(path.join(run, "final.json"), "utf8"));
const report = diagnostic
  ? { saved: [{ name: 'deconstruct-0.png' }], originalSha256: provenance.inputSha256 }
  : JSON.parse(await readFile(path.join(run, "report.json"), "utf8"));
if (!diagnostic && (final.progress !== "succeeded" || report.progress !== "succeeded")) throw new Error("A completed task with a plate is required; use --diagnostic with explicit provenance for unaccepted artifacts.");
if (report.taskId && report.taskId !== final.taskId) throw new Error("Report and task record belong to different runs.");
const saved = report.saved;
if (saved.length !== 1 || !final.taskResult?.texts) throw new Error("Expected one plate and its authoritative text result.");
const dir = await mkdtemp(path.join(tmpdir(), "oia-text-replay-"));
try {
  const lib = (name) => JSON.stringify(path.join(desktop, `src/renderer/lib/${name}.ts`));
  await build({ stdin: { contents: `
import { inkBounds } from ${lib("glyph-raster")};
import { matchedDeconstructScene } from ${lib("deconstruct-font-match")};
import { StaticCanvas } from "fabric";
window.replay = async ({ original, plate, texts, w, h }) => {
  await document.fonts.ready;
  const png = Uint8Array.from(atob(original), c => c.charCodeAt(0));
  {
    const unavailable = async () => { throw new Error('Offline replay deliberately disables the Lens task.'); };
    const result = await matchedDeconstructScene(
      { png, imageUrl: 'data:image/png;base64,' + plate, w, h, texts },
      { uploadAsset: unavailable, submitTask: unavailable, getTask: unavailable, cancelTask: unavailable },
      { stopped: () => false, onTask: () => {} },
    );
    const scene = result.scene;
    const c = new StaticCanvas(null, { width: w, height: h, enableRetinaScaling: false });
    try {
      await c.loadFromJSON(scene); c.renderAll();
      const png = c.toDataURL({ format: 'png' });
      const objects = c.getObjects();
      objects.forEach(o => o.set('visible', false));
      const geometry = [];
      for (const [i, t] of texts.entries()) {
        const object = objects[i + 2];
        object.set('visible', true); c.renderAll();
        const ink = inkBounds(c.getElement());
        const expected = { x: t.box.x*w, y: t.box.y*h, width: t.box.w*w, height: t.box.h*h };
        const error = ink ? Math.max(...Object.keys(expected).map(k => Math.abs(ink[k]-expected[k]))) : null;
        geometry.push({ i, text: t.text, ink, expected, maxErrorPx: error, checked: (t.typography?.angle ?? 0) === 0 });
        object.set('visible', false);
      }
      return { png, scene, fontNote: result.note, geometry, geometryPassed: geometry.every(g => !g.checked || (g.maxErrorPx !== null && g.maxErrorPx <= 3)) };
    } finally { c.dispose(); }
  }
};`, resolveDir: desktop }, bundle: true, format: "iife", outfile: path.join(dir, "bundle.js") });
  const css = (await readFile(path.join(desktop, "src/renderer/app.css"), "utf8")).split("\n")
    .filter(l => l.startsWith("@font-face")).join("\n")
    .replaceAll('url("fonts/', `url("${pathToFileURL(path.join(desktop, "src/renderer/fonts/")).href}`);
  const extraCss = diagnostic ? await readFile(path.join(run, 'fonts.css'), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; }) : '';
  await writeFile(path.join(dir, "page.html"), `<html><head><style>${css}\n${extraCss}</style></head><body><script src="bundle.js"></script></body></html>`);
  const original = await readFile(path.resolve(originalArg));
  let expected = report.originalSha256 ?? report.uploads?.[0]?.sha256;
  if (!expected && report.uploads?.[0]?.url) {
    const recorded = await readFile(path.join(run, "data/files", report.uploads[0].url.replace(/^\/api\/files\//, "")));
    expected = createHash("sha256").update(recorded).digest("hex");
  }
  if (!expected || createHash("sha256").update(original).digest("hex") !== expected) throw new Error("Original image does not match this run's captured input.");
  const plate = await readFile(path.join(run, saved[0].name));
  const payload = { original: original.toString("base64"), plate: plate.toString("base64"), texts: final.taskResult.texts, w: original.readUInt32BE(16), h: original.readUInt32BE(20) };
  await writeFile(path.join(dir, "payload.json"), JSON.stringify(payload));
  await writeFile(path.join(dir, "run.cjs"), `
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadFile(${JSON.stringify(path.join(dir, "page.html"))});
  const payload = fs.readFileSync(${JSON.stringify(path.join(dir, "payload.json"))}, "utf8");
  const result = await win.webContents.executeJavaScript("window.replay(" + payload + ")");
  fs.writeFileSync(${JSON.stringify(path.join(dir, "result.json"))}, JSON.stringify(result));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });`);
  const result = spawnSync(electron, [path.join(dir, "run.cjs")], { stdio: "inherit", timeout: 180000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Replay exited ${result.status}`);
  const rendered = JSON.parse(await readFile(path.join(dir, 'result.json'), 'utf8'));
  const image = Buffer.from(rendered.png.split(',')[1], 'base64');
  delete rendered.png;
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const fonts = [];
  for (const [, url] of extraCss.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    if (!url.startsWith('file:')) throw new Error('Offline diagnostic fonts must be captured local files.');
    const bytes = await readFile(fileURLToPath(url));
    fonts.push({ url, sha256: sha(bytes) });
  }
  Object.assign(rendered, {
    scope: 'Production matchedDeconstructScene with Lens deliberately disabled; no provider quota, not an Editor or detector end-to-end run.',
    qualityAccepted: false, diagnostic, fontPersistenceVerified: false,
    inputs: { originalSha256: sha(original), plateSha256: sha(plate), textsSha256: sha(JSON.stringify(final.taskResult.texts)), fontsCssSha256: sha(extraCss), fonts },
  });
  const staged = path.join(run, '.reconstructed.tmp.png');
  await writeFile(staged, image, { flag: 'wx' });
  await renameWithRetry(staged, path.join(run, 'reconstructed.png'));
  await atomicWriteJson(path.join(run, 'replay.json'), rendered);
  if (!rendered.geometryPassed) throw new Error('Painted glyph geometry drift exceeds 3px; inspect replay.json. This is not a quality-acceptance check.');
  console.log(`Saved ${path.join(run, 'reconstructed.png')}`);
} finally { await rm(dir, { recursive: true, force: true }); }
