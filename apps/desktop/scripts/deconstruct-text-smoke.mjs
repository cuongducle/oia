// Offline pixel regressions in real Electron. No private fixtures or provider calls.
import { build } from "esbuild";
import electron from "electron";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
const desktop = path.resolve(import.meta.dirname, "..");
const dir = await mkdtemp(path.join(tmpdir(), "oia-text-pixels-"));
try {
  await build({ stdin: { resolveDir: desktop, contents: `
import { run } from ${JSON.stringify(path.join(desktop, "test/deconstruct-pixels.browser.ts"))};
window.checkTextPixels = run;
` }, bundle: true, format: "iife", outfile: path.join(dir, "bundle.js") });
  const css = (await readFile(path.join(desktop, "src/renderer/app.css"), "utf8")).split("\n").filter(l => l.startsWith("@font-face")).join("\n").replaceAll('url("fonts/', `url("${pathToFileURL(path.join(desktop, "src/renderer/fonts/")).href}`);
  await writeFile(path.join(dir, "page.html"), `<style>${css}</style><script src="bundle.js"></script>`);
  await writeFile(path.join(dir, "run.cjs"), `
const { app, BrowserWindow } = require("electron");
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadFile(${JSON.stringify(path.join(dir, "page.html"))});
  console.log(JSON.stringify(await win.webContents.executeJavaScript("window.checkTextPixels()"), null, 2));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });`);
  const args = process.platform === "linux" ? ["--no-sandbox", path.join(dir, "run.cjs")] : [path.join(dir, "run.cjs")];
  const result = spawnSync(electron, args, { stdio: "inherit", windowsHide: true, timeout: 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Text pixel regression gate exited ${result.status}`);
} finally { await rm(dir, { recursive: true, force: true }); }
