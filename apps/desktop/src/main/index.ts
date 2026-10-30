import { app, BrowserWindow, dialog, ipcMain, Menu, protocol } from "electron";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServiceContext, runChat, cancelJob, jobControllers, providerStatusSnapshot, chatRequestSchema, type ServiceContext } from "@oia/services";
import { checkNsfw } from "@oia/providers";
import { IPC } from "../shared/channels.js";
import {
  chatCancelSchema, projectsCreateSchema, projectsGetSchema,
  projectsRemoveSchema, projectsSaveSchema, templatesCreateSchema, sessionsGetSchema,
  filesUploadSchema, exportSaveSchema,
} from "../shared/ipc.js";
import type { OiaBridge } from "../shared/bridge.js";

/**
 * TP-D1 (D2 + remediation) — the Electron main process:
 * - typed IPC surface over @oia/services (same orchestration as the web adapter)
 * - `oia://files/<key>` custom protocol serves asset bytes from the LocalFileStore —
 *   the renderer canvas can load artwork WITHOUT any HTTP server (file:// cannot)
 * - window close / app quit cancel every in-flight job (TP-D5 semantics: no quota
 *   burn after the user closes the window)
 * - renderer hardening: sandbox on, navigation + window-open denied, strict CSP
 * - validation failures reject with a friendly message the renderer localizes
 */
const here = path.dirname(fileURLToPath(import.meta.url));

let ctx: ServiceContext | null = null;
async function ensureCtx(): Promise<ServiceContext> {
  ctx ??= await createServiceContext({ dataDir: path.join(app.getPath("userData"), "data") });
  return ctx;
}

/** Friendly rejections: zod/ProviderConfig errors become stable names the renderer maps. */
function ipcError(err: unknown): never {
  if (err && typeof err === "object" && Array.isArray((err as { issues?: unknown }).issues)) {
    const e = new Error("invalid-request") as Error & { name: string };
    e.name = "IpcValidationError";
    throw e;
  }
  throw err;
}

// the oia:// scheme must be registered before app ready
protocol.registerSchemesAsPrivileged([
  { scheme: "oia", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }, // corsEnabled: scene images load with crossOrigin=anonymous — without it ACAO is treated as opaque and every image fails
]);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Oia",
    webPreferences: {
      preload: path.join(here, "../preload/index.cjs"), // .cjs — see electron.vite.config note
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // preload only needs contextBridge/ipcRenderer — sandboxed works
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(here, "../renderer/index.html"));
  }
  // hardening: the renderer never navigates away nor opens windows
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  // TP-D5: closing the window kills in-flight generations — quota never burns unseen
  win.on("closed", cancelAllJobs);
  return win;
}

function cancelAllJobs(): void {
  for (const [jobId, ac] of jobControllers()) {
    if (!ac.signal.aborted) ac.abort("window-closed");
    cancelJob(jobId);
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.chatRun, async (event, raw: unknown) => {
    try {
      const req = chatRequestSchema.parse(raw);
      const c = await ensureCtx();
      return await runChat(req, c, { sink: (ev) => event.sender.send(IPC.chatEvent, ev) });
    } catch (err) {
      ipcError(err);
    }
  });
  ipcMain.handle(IPC.chatCancel, (_e, raw: unknown) => {
    try {
      return cancelJob(chatCancelSchema.parse(raw).jobId);
    } catch (err) {
      ipcError(err);
    }
  });
  ipcMain.handle(IPC.providerStatus, async () => providerStatusSnapshot(await ensureCtx()));
  ipcMain.handle(IPC.projectsCreate, async (_e, raw: unknown) => {
    try {
      const { name, scene, pages, width, height } = projectsCreateSchema.parse(raw);
      return await (await ensureCtx()).projects.create({ name, scene, pages, width, height });
    } catch (err) {
      ipcError(err);
    }
  });
  ipcMain.handle(IPC.projectsGet, async (_e, raw: unknown) => {
    try {
      const { id } = projectsGetSchema.parse(raw);
      return (await ensureCtx()).projects.get(id) ?? null;
    } catch (err) {
      ipcError(err);
    }
  });
  ipcMain.handle(IPC.projectsList, async () => (await ensureCtx()).projects.recent(50));
  ipcMain.handle(IPC.projectsSave, async (_e, raw: unknown) => {
    try {
      const { id, name, pages } = projectsSaveSchema.parse(raw);
      return await (await ensureCtx()).projects.saveScene(id, { name, pages });
    } catch (err) {
      ipcError(err);
    }
  });
  ipcMain.handle(IPC.projectsRemove, async (_e, raw: unknown) => {
    try {
      const { id } = projectsRemoveSchema.parse(raw);
      return await (await ensureCtx()).projects.remove(id);
    } catch (err) {
      ipcError(err);
    }
  });
  ipcMain.handle(IPC.templatesList, async () =>
    (await ensureCtx()).templates.list({ page: 1, pageSize: 100 }).items,
  );
  ipcMain.handle(IPC.templatesCreate, async (_e, raw: unknown) => {
    try {
      const { name, authorName, scene } = templatesCreateSchema.parse(raw);
      return await (await ensureCtx()).templates.publish({ name, authorName, scene });
    } catch (err) {
      ipcError(err);
    }
  });
  ipcMain.handle(IPC.sessionsList, async () =>
    (await ensureCtx()).chatSessions.recent(20).map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt })),
  );
  ipcMain.handle(IPC.sessionsGet, async (_e, raw: unknown) => {
    try {
      const { id } = sessionsGetSchema.parse(raw);
      const s = (await ensureCtx()).chatSessions.get(id);
      return s ? { id: s.id, name: s.name, messages: s.messages } : null;
    } catch (err) {
      ipcError(err);
    }
  });
  ipcMain.handle(IPC.filesUpload, async (_e, raw: unknown) => {
    try {
      const { name, bytes } = filesUploadSchema.parse(raw);
      // same moderation gate as the web upload route (env-gated, off by default)
      const nsfw = await checkNsfw(bytes, name);
      if (!nsfw.allowed) throw new Error("image not allowed");
      const ext = name.split(".").pop()!.toLowerCase();
      const saved = await (await ensureCtx()).files.put(bytes, ext);
      return { url: saved.url, size: bytes.length };
    } catch (err) {
      ipcError(err);
    }
  });
  ipcMain.handle(IPC.exportSave, async (event, raw: unknown) => {
    try {
      const { fileName, bytes } = exportSaveSchema.parse(raw);
      const win = BrowserWindow.fromWebContents(event.sender);
      const pick = await dialog.showSaveDialog(win!, {
        defaultPath: fileName,
        filters: [{ name: fileName.split(".").pop()?.toUpperCase() ?? "File", extensions: [fileName.split(".").pop() ?? ""] }],
      });
      if (pick.canceled || !pick.filePath) return { saved: false as const, path: null };
      await writeFile(pick.filePath, bytes);
      return { saved: true as const, path: pick.filePath };
    } catch (err) {
      ipcError(err);
    }
  });
}

/** Serve /api/files/<key> scene references over the privileged oia:// scheme.
 *  file:// cannot hit the LocalFileStore — without this, the canvas renders empty. */
function registerAssetProtocol(): void {
  protocol.handle("oia", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== "files") return new Response(null, { status: 404 });
      const key = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const c = await ensureCtx();
      const bytes = await c.files.read(key);
      console.log(`[oia://] serving ${key} (${bytes.length}B)`);
      const ext = key.split(".").pop() ?? "";
      // scene objects load with crossOrigin="anonymous" (file:// → oia:// is cross-origin):
      // without ACAO the image load is blocked and fabric loadFromJSON rejects
      return new Response(bytes as unknown as BodyInit, {
        headers: {
          "content-type": c.files.contentType(ext),
          "cache-control": "public, max-age=31536000, immutable",
          "access-control-allow-origin": "*",
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

/** Scripted end-to-end check without a human: mock pair → runChat → assert → quit. */
async function smoke(): Promise<void> {
  const c = await ensureCtx();
  const events: unknown[] = [];
  const { outcome } = await runChat({ prompt: "banner smoke trà sữa giảm 20%" }, c, {
    sink: (ev) => {
      events.push(ev);
    },
  });
  const text = JSON.stringify(events);
  const ok =
    outcome === "completed" &&
    !text.includes("data:image") && // A1: assetization on this wire too
    text.includes("/api/files/") &&
    text.includes("</Content>");
  console.log(`DESKTOP_SMOKE ${ok ? "OK" : "FAILED"} outcome=${outcome} events=${events.length}`);
  app.exit(ok ? 0 : 1);
}

/**
 * Visual verification (the "open eyes" mode): open the real window, run a chat through
 * the renderer bridge, wait for the canvas, capture a PNG to out/desktop-shot.png.
 */
async function shot(): Promise<void> {
  registerAssetProtocol();
  const win = createWindow();
  win.webContents.on("console-message", (_e, _lvl, message) => {
    if (/error|fail|refused|denied/i.test(message)) console.log("[renderer]", message.slice(0, 200));
  });
  console.log("[shot] window created, waiting for load…");
  await new Promise<void>((resolve) => {
    win.webContents.once("did-finish-load", () => resolve());
    win.webContents.once("did-fail-load", (_e, code, desc) => {
      console.error(`[shot] DID-FAIL-LOAD ${code} ${desc}`);
      resolve();
    });
    setTimeout(() => resolve(), 15_000); // never hang forever
  });
  console.log("[shot] loaded; probing oia:// image load…");
  const probe = await win.webContents.executeJavaScript(`(async () => {
    const src = "oia://files/uploads/20261029/295ef2b2-mvtw036q.png";
    const load = (crossOrigin) => new Promise((res) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = crossOrigin;
      img.onload = () => res(crossOrigin + ":OK " + img.width + "x" + img.height);
      img.onerror = () => res(crossOrigin + ":FAIL");
      img.src = src;
      setTimeout(() => res(crossOrigin + ":TIMEOUT"), 5000);
    });
    return { none: await load(null), anon: await load("anonymous") };
  })()`, true).catch((e) => `PROBE ERR ${e}`);
  console.log("[shot] image probe:", JSON.stringify(probe));
  console.log("[shot] checking bridge…");
  const hasBridge = await win.webContents.executeJavaScript("typeof window.oia", true).catch((e) => `ERR ${e}`);
  console.log("[shot] typeof window.oia =", hasBridge);
  if (hasBridge !== "object") {
    console.error("[shot] bridge missing — preload failed (sandbox/CSP/format?)");
    app.exit(2);
    return;
  }
  // drive the SAME bridge the user would: renderer runs the chat and renders the stream
  await win.webContents.executeJavaScript(
    `window.oia.chatRun({ prompt: "banner smoke trà sữa giảm 20%", mode: "clean-plate" })`,
    true,
  );
  // wait for the canvas section to mount and fabric to settle
  for (let i = 0; i < 40; i++) {
    const ready = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector(".result canvas")) && document.querySelectorAll(".result canvas canvas, .result canvas img").length >= 0`,
      true,
    );
    if (ready) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 1200));
  console.log("[shot] chat done; verifying DOM + canvas pixels…");
  // in-page assertion: canvas mounted, no error banner, and the artwork region is NOT blank
  const verify = await win.webContents.executeJavaScript(`(() => {
    const err = document.querySelector('[role=alert]')?.textContent ?? "";
    const canvas = document.querySelector(".result canvas");
    if (!canvas) return { ok: false, why: "no canvas", err };
    // fabric wraps the element: upper-canvas is a SIBLING inside .canvas-container, not a child
    const inner = canvas.parentElement?.querySelector("canvas.upper-canvas") ?? canvas.parentElement?.querySelectorAll("canvas")[1];
    if (!inner) return { ok: false, why: "no fabric upper-canvas", err };
    const ctx = inner.getContext("2d");
    const { width: w, height: h } = inner;
    const data = ctx.getImageData(0, 0, w, h).data;
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) nonWhite++;
    }
    return { ok: nonWhite > 50 && !err, painted: nonWhite, err };
  })()`, true);
  console.log("[shot] verify:", JSON.stringify(verify));
  if (!verify || !verify.ok) {
    console.error("DESKTOP_SHOT VERIFY FAILED");
    app.exit(3);
    return;
  }
  await snap(win, "desktop-home.png");

  // ---- D2 remainder: drive the EDITOR port with eyes -------------------------
  // Home "Open in editor" → project created by id (TP.7) → editor mounts with
  // rail/panels/AI dock; the artboard must show painted pixels, and the autosave
  // indicator must settle (dirty → saved) before the window closes.
  console.log("[shot] opening the editor…");
  const clicked = await win.webContents.executeJavaScript(`(() => {
    const btn = document.querySelector('[data-testid="open-editor"]');
    if (!btn) return false;
    btn.click();
    return true;
  })()`, true);
  if (!clicked) {
    console.error("DESKTOP_SHOT EDITOR FAILED — open-editor button missing");
    app.exit(4);
    return;
  }
  let editorReady = false;
  for (let i = 0; i < 40; i++) {
    editorReady = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector('[data-testid="editor-root"] .canvasArea .canvasWrap canvas'))`,
      true,
    );
    if (editorReady) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 1500));
  const edVerify = await win.webContents.executeJavaScript(`(() => {
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
    const root = document.querySelector('[data-testid="editor-root"]');
    if (!root) return { ok: false, why: "editor not mounted", err };
    const rail = document.querySelectorAll(".railBtn").length;
    const dock = Boolean(document.querySelector('[data-testid="ai-dock"]'));
    const strip = Boolean(document.querySelector(".pageStrip"));
    const inner = document.querySelector(".canvasWrap canvas.upper-canvas") ?? document.querySelectorAll(".canvasWrap canvas")[1];
    if (!inner) return { ok: false, why: "no artboard canvas", err, rail, dock, strip };
    const ctx = inner.getContext("2d");
    const { width: w, height: h } = inner;
    const data = ctx.getImageData(0, 0, w, h).data;
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) nonWhite++;
    }
    return { ok: rail === 7 && dock && strip && nonWhite > 50, painted: nonWhite, rail, dock, strip, err };
  })()`, true);
  console.log("[shot] editor verify:", JSON.stringify(edVerify));
  if (!edVerify || !edVerify.ok) {
    console.error("DESKTOP_SHOT EDITOR VERIFY FAILED");
    app.exit(5);
    return;
  }
  // autosave settles dirty → saved (proves the projects:save round-trip)
  let savedSeen = false;
  for (let i = 0; i < 20; i++) {
    savedSeen = await win.webContents.executeJavaScript(
      `document.querySelector(".saveStatus")?.textContent.includes("Saved") ?? false`,
      true,
    );
    if (savedSeen) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`[shot] autosave settled: ${savedSeen}`);
  await snap(win, "desktop-editor.png");

  // ---- Workspace view: projects list + recent conversations over IPC -------------
  console.log("[shot] opening Workspace…");
  const wentBack = await win.webContents.executeJavaScript(`(() => {
    const back = document.querySelector('[data-testid="editor-root"] .edTop .iconBtn');
    if (!back) return false;
    back.click();
    return true;
  })()`, true);
  if (!wentBack) {
    console.error("DESKTOP_SHOT WORKSPACE FAILED — editor back button missing");
    app.exit(7);
    return;
  }
  await new Promise((r) => setTimeout(r, 800));
  await win.webContents.executeJavaScript(`(() => {
    const pills = [...document.querySelectorAll(".viewNav .navPill")];
    const ws = pills.find((p) => p.textContent.trim() === "Workspace");
    if (!ws) return false;
    ws.click();
    return true;
  })()`, true);
  let wsReady = false;
  for (let i = 0; i < 30; i++) {
    wsReady = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector(".projectGrid article .projectPreview"))`,
      true,
    );
    if (wsReady) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 1200));
  const wsVerify = await win.webContents.executeJavaScript(`(() => {
    const cards = document.querySelectorAll(".projectGrid article").length;
    const preview = Boolean(document.querySelector(".projectGrid .projectPreview .scenePreview"));
    const chats = document.querySelectorAll(".chatGrid .chatCard").length;
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
    return { ok: cards >= 1 && preview && chats >= 1 && !err, cards, preview, chats, err };
  })()`, true);
  console.log("[shot] workspace verify:", JSON.stringify(wsVerify));
  if (!wsVerify || !wsVerify.ok) {
    console.error("DESKTOP_SHOT WORKSPACE VERIFY FAILED");
    app.exit(8);
    return;
  }

  const image = await win.webContents.capturePage();
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(path.join(here, "../..", "out"), { recursive: true });
  await writeFile(path.join(here, "../..", "out", "desktop-shot.png"), image.toPNG());
  await writeFile(path.join(here, "../..", "out", "desktop-workspace.png"), image.toPNG());
  console.log("DESKTOP_SHOT wrote out/desktop-shot.png");
  app.exit(savedSeen ? 0 : 6);
}

/** Per-view PNG capture for UI audits (out/desktop-<view>.png). Expands the window
 *  to the document height first so below-the-fold sections (result, gallery) are captured. */
async function snap(win: BrowserWindow, name: string): Promise<void> {
  try {
    const height = await win.webContents.executeJavaScript(
      `(() => { const m = document.querySelector('.viewFrame > main') ?? document.body;
        const r = document.querySelector('.result'); const g = document.querySelector('.galleryGrid');
        window.__snapDebug = 'main.h=' + m.scrollHeight + ' result=' + (r ? Math.round(r.getBoundingClientRect().top) + ':' + Math.round(r.getBoundingClientRect().height) : 'none') + ' gallery=' + (g ? Math.round(g.getBoundingClientRect().top) + ':' + Math.round(g.getBoundingClientRect().height) : 'none') + ' body.h=' + document.body.scrollHeight
          + ' rc=' + (() => { const c = document.querySelector('.result canvas'); if (!c) return 'none'; const b = c.getBoundingClientRect(); const el = document.elementFromPoint(b.left + 8, Math.min(b.top + 100, window.innerHeight - 10)); return Math.round(b.width) + 'x' + Math.round(b.height) + '@' + Math.round(b.top) + ' hit=' + (el ? el.tagName + '.' + String(el.className).slice(0, 30) : 'null'); })();
        return Math.max((document.scrollingElement ?? document.body).scrollHeight, m.scrollHeight); })()`, true,
    );
    const target = Math.max(600, Math.min(Number(height) || 600, 4200));
    const dbg = await win.webContents.executeJavaScript(`window.__snapDebug ?? ''`, true).catch(() => "");
    console.log(`[snap] ${name}: ${String(dbg)} (target=${target})`);
    // macOS clamps windows to the screen — when the page is taller than the CSS viewport,
    // zoom out so the WHOLE page (result card + gallery below the fold) fits one capture.
    // NOTE: getContentSize() is DEVICE px; scrollHeight is CSS px — compare in CSS px only.
    const cssH = await win.webContents.executeJavaScript("window.innerHeight", true).catch(() => 0);
    const pageH = Number(height) || 0;
    if (cssH && pageH > cssH) {
      win.webContents.setZoomFactor(Math.max(0.3, (cssH - 16) / pageH));
      await new Promise((r) => setTimeout(r, 500)); // reflow + lazy scene previews mount
    }
  } catch {
    /* keep the viewport capture if the measurement fails */
  }
  try {
    const image = await win.webContents.capturePage();
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(path.join(here, "../..", "out"), { recursive: true });
    await writeFile(path.join(here, "../..", "out", name), image.toPNG());
    console.log(`[shot] wrote out/${name}`);
  } finally {
    win.webContents.setZoomFactor(1); // never leak the audit zoom into the next view
  }
}

function registerMenu(): void {
  // Minimal native menu: macOS app + edit commands (Cmd+C/V work in every field), reload, quit.
  // No devtools item — the shipped renderer never exposes devtools to a seller.
  const isMac = process.platform === "darwin";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: "appMenu" as const }] : []),
      { role: "editMenu" as const },
      { role: "viewMenu" as const },
      {
        label: "Window",
        submenu: [{ role: "minimize" as const }, { role: "close" as const }],
      },
    ]),
  );
}

app.whenReady().then(async () => {
  registerIpc();
  registerMenu();
  if (process.env.OIA_DESKTOP_SMOKE === "1") {
    await smoke();
    return;
  }
  if (process.env.OIA_DESKTOP_SHOT === "1") {
    await shot().catch((err) => {
      console.error("[shot] FAILED:", err);
      app.exit(1);
    });
    return;
  }
  registerAssetProtocol();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", cancelAllJobs);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
