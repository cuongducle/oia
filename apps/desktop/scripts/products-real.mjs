#!/usr/bin/env node
/**
 * W1.1 real-data run (owner rule 2026-11-10): the product-profile lane driven
 * end-to-end in the REAL app with REAL content, twice (boot → quit → boot) to
 * prove persistence. Zero quota by construction: no provider is configured or
 * called, the lane is store + upload + UI only (recorded as such, not as an
 * AI-free substitute for a provider run; W1.2's fill screen owes that one).
 *
 *   node scripts/products-real.mjs <realPhoto.png> <outDir>
 *
 * What is "real" here:
 *  - a real listing image file (bytes from disk, through the real upload IPC),
 *  - seller-copy description + facts carrying the claims recorded from the
 *    9 Wishes Hydra Ampoule II listing scan (16/11, execution-plan W1.1),
 *  - a persistent OIA_USER_DATA_DIR profile (no test-mode env), and a SECOND
 *    app boot on the same profile.
 * The app is driven over CDP (--remote-debugging-port); no test hooks exist in
 * main for this, the UI path is exactly the one a seller types into.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, access, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import electron from "electron"; // under node this is the binary path, the repo's real-run precedent

const [, , photoArg, outDirArg] = process.argv;
if (!photoArg || !outDirArg) {
  console.error("usage: node scripts/products-real.mjs <realPhoto.png> <outDir>");
  process.exit(64);
}
const desktop = path.resolve(import.meta.dirname, "..");
const photo = path.resolve(photoArg);
const outDir = path.resolve(outDirArg);
const profile = path.join(outDir, "profile");
await mkdir(outDir, { recursive: true });
if (await access(path.join(outDir, "summary.json")).then(() => true, () => false)) {
  throw new Error(`Refusing to overwrite real-run evidence: ${outDir}. Use a new run directory.`);
}
const photoBytes = new Uint8Array(await readFile(photo));
const photoB64 = Buffer.from(photoBytes).toString("base64");

const PRODUCT = {
  name: "9 Wishes Hydra Ampoule II 30ml",
  description:
    "Serum cấp ẩm tập trung với 8 tầng HA. Độ ẩm tăng 145,16% sau 72 giờ (thử nghiệm HM-P20-0047, 14 người, 2020). " +
    "Cấp ẩm tức thì +451,76% ngay lần dùng đầu. Không cồn, không hương liệu. Hàng Official Store, 2k+ đã bán. " +
    "Giá và ưu đãi xem phần mô tả giá của sàn.",
  tags: ["Serum", "9Wishes"],
  lockNotes: "Không thay đổi logo 9 Wishes, không thêm chữ lên ảnh chính.",
  facts: [
    { text: "8 tầng HA", source: "listing scan 16/11" },
    { text: "Độ ẩm +145,16% sau 72 giờ (HM-P20-0047, n=14, 2020)", source: "listing scan 16/11" },
    { text: "Cấp ẩm tức thì +451,76% sau 1 lần dùng", source: "listing scan 16/11" },
  ],
};

/** Boot the real app on the persistent profile; resolves a CDP driver. */
async function boot(port) {
  const env = { ...process.env, OIA_USER_DATA_DIR: profile };
  for (const k of Object.keys(env)) if (k.startsWith("OIA_DESKTOP_") || k.startsWith("OIA_MOCK_")) delete env[k];
  const child = spawn(electron, [".", `--remote-debugging-port=${port}`], { cwd: desktop, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (c) => process.stdout.write(`[app] ${c}`));
  child.stderr.on("data", (c) => process.stderr.write(`[app] ${c}`));
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      wsUrl = targets.find((t) => t.type === "page" && /index\.html/.test(t.url))?.webSocketDebuggerUrl ?? null;
    } catch { /* app still booting */ }
  }
  if (!wsUrl) throw new Error("no renderer page target on CDP within 30s");
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP websocket failed")); });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalPage = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.error) throw new Error(`CDP error: ${JSON.stringify(r.error).slice(0, 200)}`);
    if (r.exceptionDetails) throw new Error(`page threw: ${JSON.stringify(r.exceptionDetails).slice(0, 400)}`);
    return r.result?.result?.value;
  };
  return { child, evalPage, screenshot: async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(outDir, name), Buffer.from(r.result?.data ?? "", "base64"));
  }, quit: async () => {
    ws.close();
    child.kill("SIGTERM");
    await new Promise((res) => { child.on("close", res); setTimeout(() => { child.kill("SIGKILL"); res(); }, 8000); });
  } };
}

const setNative = `const setNative = (el, value) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};`;

async function main() {
  // ---- boot 1: create the profile through the real editor -------------------
  let app = await boot(9331);
  try {
    const opened = await app.evalPage(`(async () => {
      await new Promise((r) => setTimeout(r, 1500));
      const pills = [...document.querySelectorAll(".viewNav .navPill")];
      const p = pills.find((x) => x.textContent.trim() === "Products");
      if (!p) return "no-products-pill";
      p.click();
      for (let i = 0; i < 40 && !document.querySelector(".productsView"); i++) await new Promise((r) => setTimeout(r, 250));
      return document.querySelector(".productsView") ? "ok" : "products-view-never";
    })()`);
    if (opened !== "ok") throw new Error(`open: ${opened}`);

    const created = await app.evalPage(`(async () => {
      ${setNative}
      document.querySelector('[data-testid="product-new"]')?.click();
      for (let i = 0; i < 40 && !document.querySelector('[data-testid="product-save"]'); i++) await new Promise((r) => setTimeout(r, 250));
      setNative(document.querySelector("#pe-name"), ${JSON.stringify(PRODUCT.name)});
      setNative(document.querySelector("#pe-desc"), ${JSON.stringify(PRODUCT.description)});
      setNative(document.querySelector("#pe-lock"), ${JSON.stringify(PRODUCT.lockNotes)});
      setNative(document.querySelector("#pe-tags"), ${JSON.stringify(PRODUCT.tags[0])});
      document.querySelector("#pe-tags").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      setNative(document.querySelector("#pe-tags"), ${JSON.stringify(PRODUCT.tags[1])});
      document.querySelector("#pe-tags").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      if (document.querySelectorAll(".miniTag").length !== 2) return "tags:" + document.querySelectorAll(".miniTag").length;
      if (![...document.querySelectorAll(".miniTag")].some((m) => m.textContent.includes("9Wishes"))) return "tag-2-lost";
      ${PRODUCT.facts.map((f) => `
      setNative(document.querySelector(".factAdd input"), ${JSON.stringify(f.text)});
      setNative(document.querySelector(".factAdd .factSrcInput"), ${JSON.stringify(f.source)});
      document.querySelector(".factAdd .secondaryBtn")?.click();
      await new Promise((r) => setTimeout(r, 150));`).join("")}
      if (document.querySelectorAll(".factRow").length !== ${PRODUCT.facts.length}) return "facts:" + document.querySelectorAll(".factRow").length;
      const bytes = Uint8Array.from(atob("${photoB64}"), (c) => c.charCodeAt(0));
      const input = document.querySelector('[data-testid="product-photo-input"]');
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], ${JSON.stringify(path.basename(photo))}, { type: "image/png" }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      for (let i = 0; i < 60 && document.querySelectorAll(".photoTile").length < 1; i++) await new Promise((r) => setTimeout(r, 250));
      if (document.querySelectorAll(".photoTile").length !== 1) return "photo-upload";
      if (!document.querySelector(".photoTile .photoMain")) return "main-badge-missing";
      document.querySelector('[data-testid="product-save"]')?.click();
      for (let i = 0; i < 60 && !document.querySelector('[data-testid="product-row"]'); i++) await new Promise((r) => setTimeout(r, 250));
      const row = [...document.querySelectorAll('[data-testid="product-row"]')].find((r) => r.textContent.includes(${JSON.stringify(PRODUCT.name)}));
      if (!row) return "row-missing";
      const cells = [...row.querySelectorAll('[role=cell]')].map((c) => c.textContent.trim());
      if (cells[4] !== "1") return "photos-cell:" + cells[4];
      if (cells[5] !== "${PRODUCT.facts.length}") return "facts-cell:" + cells[5];
      const thumb = row.querySelector(".productsThumb img");
      if (!thumb || !thumb.src.startsWith("oia://files/")) return "thumb:" + (thumb ? thumb.src : "none");
      return "ok|desc-first-line=" + row.querySelector(".productsDesc")?.textContent.slice(0, 60);
    })()`);
    await app.screenshot("phase1-library.png");
    if (!created.startsWith("ok")) throw new Error(`create: ${created}`);
    console.log(`[real] phase 1: ${created}`);
    await app.quit();
  } catch (e) { await app.quit().catch(() => {}); throw e; }

  // ---- boot 2: same profile, the profile must still be there ----------------
  app = await boot(9332);
  try {
    const persisted = await app.evalPage(`(async () => {
      await new Promise((r) => setTimeout(r, 1500));
      const pills = [...document.querySelectorAll(".viewNav .navPill")];
      pills.find((x) => x.textContent.trim() === "Products")?.click();
      for (let i = 0; i < 40 && !document.querySelector(".productsView"); i++) await new Promise((r) => setTimeout(r, 250));
      const row = [...document.querySelectorAll('[data-testid="product-row"]')].find((r) => r.textContent.includes(${JSON.stringify(PRODUCT.name)}));
      if (!row) return "row-gone-after-restart";
      const cells = [...row.querySelectorAll('[role=cell]')].map((c) => c.textContent.trim());
      return "ok|photos=" + cells[4] + "|facts=" + cells[5] + "|count=" + document.querySelector(".productsCount")?.textContent;
    })()`);
    await app.screenshot("phase2-after-restart.png");
    if (!persisted.startsWith("ok")) throw new Error(`persist: ${persisted}`);
    console.log(`[real] phase 2: ${persisted}`);
    await app.quit();
  } catch (e) { await app.quit().catch(() => {}); throw e; }

  // ---- on-disk evidence ------------------------------------------------------
  const productsDir = path.join(profile, "data", "products"); // ServiceContext roots stores under <userData>/data
  const files = (await readdir(productsDir).catch(() => [])).filter((f) => f.endsWith(".json"));
  const record = files.length === 1 ? JSON.parse(await readFile(path.join(productsDir, files[0]), "utf8")) : null;
  const summary = {
    at: new Date().toISOString(),
    lane: "W1.1 product profiles (schema+store+Products view)",
    quota: "0 provider calls by construction; no provider configured",
    photo: { file: photo, sha256: createHash("sha256").update(photoBytes).digest("hex"), bytes: photoBytes.length },
    productFiles: files,
    storeRecord: record && {
      name: record.name,
      tags: record.tags,
      photos: record.photos.map((p) => p.ref),
      factsKept: record.facts.filter((f) => f.kept).length,
      lockNotes: record.lockNotes,
    },
  };
  await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("[real] summary written; run OK");
}

main().catch((e) => { console.error(`PRODUCTS_REAL FAILED: ${e.message}`); process.exit(1); });
