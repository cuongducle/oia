// Run with: pnpm --filter @oia/desktop exec electron scripts/template-qa.cjs
// Real Fabric/Chromium rendering with bundled fonts and artwork, no provider calls.
const { app, BrowserWindow } = require("electron");
const { build } = require("esbuild");
const { mkdtemp, readFile, writeFile, mkdir, rm } = require("node:fs/promises");
const path = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");

app.whenReady().then(async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "oia-template-qa-"));
  const output = path.resolve(process.env.OIA_TEMPLATE_QA_OUT || path.join(__dirname, "../out/template-qa"));
  let win;
  const timeout = setTimeout(() => { console.error("Template QA timed out"); app.exit(1); }, 120000);
  try {
    await mkdir(output, { recursive: true });
    const bundle = path.join(temporary, "render.js");
    await build({ entryPoints: [path.join(__dirname, "template-qa-renderer.ts")], outfile: bundle, bundle: true, platform: "browser", format: "iife" });
    const renderer = path.resolve(__dirname, "../src/renderer");
    const css = (await readFile(path.join(renderer, "app.css"), "utf8")).split("\n").filter((l) => l.startsWith("@font-face")).join("\n");
    const html = path.join(temporary, "index.html");
    await writeFile(html, `<!doctype html><base href="${pathToFileURL(renderer + path.sep).href}"><style>${css}</style><script src="${pathToFileURL(bundle).href}"></script>`);
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadFile(html);
    const ids = await win.webContents.executeJavaScript("window.templateIds");
    const results = [];
    for (const id of ids) {
      const { png, ...result } = await win.webContents.executeJavaScript(`window.renderTemplate(${JSON.stringify(id)})`);
      await writeFile(path.join(output, `${id}.png`), Buffer.from(png.split(",")[1], "base64"));
      results.push(result);
      console.log(id, JSON.stringify({ overflow: result.overflow, collisions: result.collisions }));
    }
    const { png: menuPng, ...menuProof } = await win.webContents.executeJavaScript('window.renderTemplate("studio-ed-menu", { "42.000₫": "46.000₫" })');
    if (menuProof.overflow.length || menuProof.collisions.length) throw new Error("Edited menu preview fails geometry checks");
    await writeFile(path.join(output, "menu-price-edited.png"), Buffer.from(menuPng.split(",")[1], "base64"));
    await writeFile(path.join(output, "menu-price-proof.json"), JSON.stringify(menuProof, null, 2));
    await writeFile(path.join(output, "report.json"), JSON.stringify(results, null, 2));
    const failed = results.filter((r) => r.overflow.length || r.collisions.length);
    console.log(`Template QA: ${results.length} rendered, ${failed.length} geometry failures. ${output}`);
    process.exitCode = failed.length ? 1 : 0;
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally {
    clearTimeout(timeout);
    win?.destroy();
    await rm(temporary, { recursive: true, force: true });
    app.exit(process.exitCode || 0);
  }
});
