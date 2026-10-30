import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, protocol, session, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { IPC } from "../shared/channels.js";
import { appMenuTemplate, smokeModeFromEnv } from "./releaseGate.js";
import { forbiddenSenderError, isOwnRendererSender } from "./ipcGuard.js";
import {
  chatRequestSchema,
  chatCancelSchema, projectsCreateSchema, projectsGetSchema,
  projectsRemoveSchema, projectsSaveSchema, templatesCreateSchema, sessionsGetSchema,
  filesUploadSchema, exportSaveSchema,
  taskSubmitSchema, taskGetSchema, taskCancelSchema,
  brandKitUpsertSchema, brandKitRemoveSchema, apiKeyCreateSchema, apiKeyRevokeSchema,
  clipboardWriteSchema, dataImportWebSchema,
} from "../shared/ipc.js";
import type { AgentJobFrame } from "../shared/bridge.js";
import { utility } from "./utilityClient.js";
import { initRuntimeController, registerRuntimeIpc, effectiveMode, runtimeSnapshotFor } from "./runtime.js";
import { buildServiceEnv } from "../shared/providers-mode.js";

/**
 * D11 (reorg step 4a) — the Electron MAIN process owns windows, menus, dialogs,
 * the oia://files protocol, and the codex runtime controller. The SERVICE layer
 * (ServiceContext: runChat, task store, projects/templates/sessions, files, NSFW)
 * lives in a separate utility process (src/utility) reached through the typed
 * RPC in main/utilityClient — a services crash can no longer take the window
 * down, and the main thread never blocks on provider work.
 *
 * Renderer contract is UNCHANGED: the same IPC channels, the same zod validation
 * in shared/ipc.ts — main validates, then forwards to the utility process.
 *
 * TP-D3 (unchanged): the codex runtime is managed in-app; this process owns the
 * provider-mode choice (settings.json in userData) and rebuilds the utility's
 * service context when it changes. CI smoke/shot always run mock.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

let ctxMode: "mock" | "codex" | null = null; // what the CURRENT utility context was built with
let ctxGeneration = -1; // which utility FORK built it — mismatch (crash+restart) forces re-init

/** Serialize context builds — concurrent IPC must never build two contexts. */
let buildLock: Promise<unknown> = Promise.resolve();
function withBuildLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = buildLock.then(fn);
  buildLock = run.catch(() => {}); // the chain never rejects; callers see their own error
  return run;
}

/** The provider env the utility context builds from: mode + resolved codex binary.
 *  T3 — assembled by the PURE builder in shared/providers-mode; main never mutates
 *  process.env (the old set-then-restore CODEX_BIN dance leaked global state). */
async function contextEnv(): Promise<Record<string, string | undefined>> {
  const mode = await effectiveMode();
  const det = mode === "codex" ? await getProvisionerSafe() : null;
  return buildServiceEnv(process.env, mode, det);
}

/** Boot (or rebuild) the utility service context under the build lock.
 *  Cached by (mode, generation): re-init only on the first call, a mode change,
 *  or after a utility crash (a new fork has no context — generation mismatch). */
async function ensureUtility(): Promise<void> {
  return withBuildLock(async () => {
    utility.start();
    const mode = await effectiveMode();
    if (ctxMode === mode && utility.gen === ctxGeneration) return;
    await utility.call({ cmd: "init", dataDir: path.join(app.getPath("userData"), "data"), userDataDir: app.getPath("userData"), env: await contextEnv() });
    ctxMode = mode;
    ctxGeneration = utility.gen;
  });
}

/** Rebuild on the next ensureUtility (mode choice or runtime state changed). */
async function rebuildContext(): Promise<void> {
  await withBuildLock(async () => {
    await utility.call({ cmd: "cancelAll" }).catch(() => {}); // never mix contexts mid-job
    await utility.call({ cmd: "rebuild", env: await contextEnv() });
    ctxMode = await effectiveMode();
    ctxGeneration = utility.gen;
  });
}

/** detect() without side effects — no status probe, no login round trip. */
async function getProvisionerSafe(): Promise<string | null> {
  const { getProvisioner } = await import("./runtime.js");
  return (await getProvisioner().detect()).bin;
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
  void utility.call({ cmd: "cancelAll" }).catch(() => {});
}

/** Agent-job frames seen since app start (newest first, capped) — the For Agents
 *  panel gets history even for jobs that ran while it was closed. */
const agentJobRing: (AgentJobFrame & { at: number })[] = [];

function registerIpc(): void {
  registerRuntimeIpc({
    rebuildContext,
    currentEffective: () => ctxMode,
  });
  // F2 — every IPC handler first admits only OUR renderer windows; a foreign
  // sender (should none ever exist) gets a stable ForbiddenSender error.
  const handle = (ch: string, fn: (event: IpcMainInvokeEvent, raw: unknown) => unknown): void => {
    ipcMain.handle(ch, async (event, raw) => {
      if (!isOwnRendererSender(event)) throw forbiddenSenderError();
      return fn(event, raw);
    });
  };
  handle(IPC.chatRun, async (event, raw: unknown) => {
    try {
      const req = chatRequestSchema.parse(raw); // validated HERE — the utility trusts main
      await ensureUtility();
      // requestId: random UUID — two rapid chats from one sender must NEVER share
      // a routing key (Date.now() collided on double-submit and dropped events)
      const result = await utility.call(
        { cmd: "chatRun", req },
        { requestId: randomUUID(), sender: event.sender },
      );
      return result;
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.chatCancel, async (_e, raw: unknown) => {
    try {
      return await utility.call({ cmd: "chatCancel", jobId: chatCancelSchema.parse(raw).jobId });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.providerStatus, async () => {
    try {
      await ensureUtility();
      return await utility.call({ cmd: "providerStatus" });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.projectsCreate, async (_e, raw: unknown) => {
    try {
      const { name, scene, pages, width, height } = projectsCreateSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "projects.create", input: { name, scene, pages, width, height } });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.projectsGet, async (_e, raw: unknown) => {
    try {
      const { id } = projectsGetSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "projects.get", id });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.projectsList, async () => {
    await ensureUtility();
    return await utility.call({ cmd: "projects.list" });
  });
  handle(IPC.projectsSave, async (_e, raw: unknown) => {
    try {
      const { id, name, pages } = projectsSaveSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "projects.save", id, patch: { name, pages } });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.projectsRemove, async (_e, raw: unknown) => {
    try {
      const { id } = projectsRemoveSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "projects.remove", id });
    } catch (err) {
      ipcError(err);
    }
  });
  // reorg step 5 — import a self-hosted web app's .data dir; an empty sourceDir
  // opens the native folder picker (null = user canceled, nothing ran)
  handle(IPC.dataImportWeb, async (event, raw: unknown) => {
    try {
      let { sourceDir } = dataImportWebSchema.parse(raw);
      if (!sourceDir) {
        const win = BrowserWindow.fromWebContents(event.sender);
        const pick = await dialog.showOpenDialog(win!, {
          title: "Import from web app — choose the .data folder",
          properties: ["openDirectory", "showHiddenFiles"],
        });
        if (pick.canceled || !pick.filePaths[0]) return null;
        sourceDir = pick.filePaths[0];
      }
      await ensureUtility();
      return await utility.call({ cmd: "data.importWeb", sourceDir });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.templatesList, async () => {
    await ensureUtility();
    return await utility.call({ cmd: "templates.list" });
  });
  handle(IPC.templatesCreate, async (_e, raw: unknown) => {
    try {
      const { name, authorName, scene } = templatesCreateSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "templates.create", input: { name, authorName, scene } });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.sessionsList, async () => {
    await ensureUtility();
    return await utility.call({ cmd: "sessions.list" });
  });
  handle(IPC.sessionsGet, async (_e, raw: unknown) => {
    try {
      const { id } = sessionsGetSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "sessions.get", id });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.filesUpload, async (_e, raw: unknown) => {
    try {
      const { name, bytes } = filesUploadSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "files.put", name, bytes });
    } catch (err) {
      ipcError(err);
    }
  });
  // ---- reorg step 4c: quick tools task lane ---------------------------------------
  handle(IPC.taskSubmit, async (_e, raw: unknown) => {
    try {
      const { type, params } = taskSubmitSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "tasks.submit", type, params });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.taskGet, async (_e, raw: unknown) => {
    try {
      const { taskId } = taskGetSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "tasks.get", taskId });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.taskCancel, async (_e, raw: unknown) => {
    try {
      const { taskId } = taskCancelSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "tasks.cancel", taskId });
    } catch (err) {
      ipcError(err);
    }
  });
  // ---- reorg step 4d: brand kits + For Agents --------------------------------------
  handle(IPC.brandKitsList, async () => {
    await ensureUtility();
    return await utility.call({ cmd: "brandKits.list" });
  });
  handle(IPC.brandKitsUpsert, async (_e, raw: unknown) => {
    try {
      const input = brandKitUpsertSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "brandKits.upsert", input });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.brandKitsRemove, async (_e, raw: unknown) => {
    try {
      const { id } = brandKitRemoveSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "brandKits.remove", id });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.apiKeysList, async () => {
    await ensureUtility();
    return await utility.call({ cmd: "keys.list" });
  });
  handle(IPC.apiKeysCreate, async (_e, raw: unknown) => {
    try {
      const { name, ttlDays } = apiKeyCreateSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "keys.create", name, ttlDays });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.apiKeysRevoke, async (_e, raw: unknown) => {
    try {
      const { id } = apiKeyRevokeSchema.parse(raw);
      await ensureUtility();
      return await utility.call({ cmd: "keys.revoke", id });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.agentStatus, async () => {
    await ensureUtility();
    const port = (await utility.call({ cmd: "loopback.port" })) as number | null;
    return { port, recentJobs: agentJobRing.map((j) => ({ ...j })) };
  });
  handle(IPC.clipboardWrite, async (_e, raw: unknown) => {
    try {
      const { text } = clipboardWriteSchema.parse(raw);
      clipboard.writeText(text); // MAIN-side: unaffected by the deny-all permission handler
      return true;
    } catch (err) {
      ipcError(err);
    }
  });
  // agentJob events: buffered in main (survive a utility crash+refork) and streamed
  // to every live window — the For Agents feed reads both. `lane` separates agent-API
  // runs from quick-tools runs (both metered, both must stay visible — hard rule 6).
  utility.onUtilityEvent((ev) => {
    if (ev.type !== "agentJob") return;
    const frame: AgentJobFrame = { taskId: ev.taskId, event: ev.event, taskType: ev.taskType, lane: ev.lane };
    agentJobRing.unshift({ ...frame, at: Date.now() });
    agentJobRing.length = Math.min(agentJobRing.length, 50);
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.agentJobEvent, frame);
    }
  });
  handle(IPC.exportSave, async (event, raw: unknown) => {
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
      await ensureUtility();
      const bytes = (await utility.call({ cmd: "files.read", key })) as Uint8Array;
      const ext = key.split(".").pop() ?? "";
      // scene objects load with crossOrigin="anonymous" (file:// → oia:// is cross-origin):
      // without ACAO the image load is blocked and fabric loadFromJSON rejects
      return new Response(bytes as unknown as BodyInit, {
        headers: {
          "content-type": { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" }[ext] ?? "application/octet-stream",
          "cache-control": "public, max-age=31536000, immutable",
          "access-control-allow-origin": "*",
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

/** Scripted end-to-end check without a human — now through the REAL main→utility
 *  boundary (that is the point of D11): mock pair → fork utility → chatRun → assert. */
async function smoke(): Promise<void> {
  await ensureUtility();
  const events: unknown[] = [];
  const off = utility.onUtilityEvent((ev) => {
    if (ev.type === "chatEvent") events.push(ev.ev);
  });
  const { outcome } = (await utility.call(
    { cmd: "chatRun", req: { prompt: "banner smoke trà sữa giảm 20%" } },
    { requestId: "smoke" },
  )) as { outcome: string };
  off();
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
 * CRASH-SMOKE (the error-path gate the happy-path smoke cannot be): kill the
 * services process mid-session, then make a normal call — the client MUST detect
 * the dead generation, fork a fresh utility, re-init the context, and answer.
 * This is the regression test for the "one crash bricked the app" bug.
 */
async function crashSmoke(): Promise<void> {
  await ensureUtility();
  // reorg step 5 gate: a project that exists BEFORE the crash must come back intact
  // after the crash + refork (per-project files — the store reloads from disk).
  await utility.call({ cmd: "projects.create", input: { name: "crash-smoke survivor" } });
  const before = (await utility.call({ cmd: "projects.list" })) as { name?: string }[];
  utility.kill(); // simulate a services crash
  for (let i = 0; i < 40 && !utility.crashed; i++) await new Promise((r) => setTimeout(r, 100));
  if (!utility.crashed) {
    console.log("DESKTOP_CRASH_SMOKE FAILED exit-event never observed");
    app.exit(1);
    return;
  }
  // the same path every IPC handler takes — must self-heal via the generation check
  await ensureUtility();
  const after = (await utility.call({ cmd: "projects.list" }).catch((e) => e)) as { name?: string }[];
  const ok = Array.isArray(before) && Array.isArray(after) &&
    after.some((p) => p.name === "crash-smoke survivor"); // the data survived, not just the wiring
  console.log(
    `DESKTOP_CRASH_SMOKE ${ok ? "OK" : "FAILED"} before=${Array.isArray(before) ? before.length : "err"} ` +
      `recovered=${Array.isArray(after) ? after.length : String(after)}`,
  );
  app.exit(ok ? 0 : 1);
}

/**
 * TP-D3 exit check — the REAL run through the shell wiring (quota-billed, opt-in via
 * OIA_DESKTOP_REAL_SMOKE=1, never in CI): auto mode must resolve codex from the live
 * runtime state, one real banner completes, assets land in the store with bytes on disk.
 */
async function realSmoke(): Promise<void> {
  const t0 = Date.now();
  await ensureUtility();
  const events: { error?: string; errorClass?: string; renderData?: { msgMeta?: unknown[] } }[] = [];
  const off = utility.onUtilityEvent((ev) => {
    if (ev.type === "chatEvent") events.push(ev.ev as (typeof events)[number]);
  });
  const { outcome, jobId } = (await utility.call(
    { cmd: "chatRun", req: { prompt: "banner trà sữa giảm 20% ngày 8/11, khổ dọc Shopee", mode: "clean-plate" } },
    { requestId: "real-smoke" },
  )) as { outcome: string; jobId: string };
  off();
  const snap = await runtimeSnapshotFor(await effectiveMode());
  const canvasMeta = events.flatMap((e) => (e.renderData?.msgMeta ?? []) as { type?: string }[]).find((m) => m.type === "canvas");
  // asset bytes must exist on disk — a canvas meta without stored bytes is not a banner
  let assetBytes = 0;
  const scene = (canvasMeta as { canvas?: { objects?: { src?: string }[] } } | undefined)?.canvas;
  for (const o of scene?.objects ?? []) {
    const src = o.src ?? "";
    if (src.startsWith("/api/files/")) {
      try {
        assetBytes += ((await utility.call({ cmd: "files.read", key: src.replace("/api/files/", "") })) as Uint8Array).length;
      } catch {
        /* missing asset counted as 0 */
      }
    }
  }
  const err = events.find((e) => e.errorClass);
  const ok =
    outcome === "completed" &&
    snap.effective === "codex" &&
    snap.runtime.state === "ready" &&
    Boolean(canvasMeta) &&
    assetBytes > 10_000;
  console.log(
    `DESKTOP_REAL_SMOKE ${ok ? "OK" : "FAILED"} outcome=${outcome} effective=${snap.effective} runtime=${snap.runtime.state} ` +
      `version=${snap.runtime.version ?? "?"} assetBytes=${assetBytes} events=${events.length} ` +
      `${err ? `error=${err.errorClass}` : "no-error"} jobId=${jobId} took=${Math.round((Date.now() - t0) / 1000)}s`,
  );
  app.exit(ok ? 0 : 1);
}

/**
 * Visual verification (the "open eyes" mode): open the real window, run a chat through
 * the renderer bridge, wait for the canvas, capture a PNG to out/desktop-*.png.
 * Exit codes: 2 bridge missing · 3 home verify · 4/5 editor · 6 autosave · 7/8 workspace
 * · 9 tools · 10 brand kit · 11 for-agents · 12 tool AI · 13 clipboard gate.
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
  await snap(win, "desktop-workspace.png");

  // ---- reorg 4c: Tools view — grid + one real runner ----------------------------
  console.log("[shot] opening Tools…");
  await win.webContents.executeJavaScript(`(() => {
    const pills = [...document.querySelectorAll(".viewNav .navPill")];
    pills.find((p) => p.textContent.trim() === "Tools")?.click();
    return true;
  })()`, true);
  let toolsReady = false;
  for (let i = 0; i < 24; i++) {
    toolsReady = await win.webContents.executeJavaScript(
      `document.querySelectorAll(".toolGrid .toolCard").length >= 10`, true,
    );
    if (toolsReady) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const toolsListVerify = await win.webContents.executeJavaScript(`(() => {
    const cards = document.querySelectorAll(".toolGrid .toolCard").length;
    const sections = document.querySelectorAll(".toolSection").length;
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
    return { ok: cards >= 10 && sections >= 4 && !err, cards, sections, err };
  })()`, true).catch((e) => ({ ok: false, why: String(e) }));
  console.log("[shot] tools list verify:", JSON.stringify(toolsListVerify));
  if (!toolsListVerify || !toolsListVerify.ok) {
    console.error("DESKTOP_SHOT TOOLS VERIFY FAILED (list)");
    app.exit(9);
    return;
  }
  const toolOpened = await win.webContents.executeJavaScript(`(() => {
    const card = [...document.querySelectorAll(".toolCard")].find((c) => c.textContent.includes("PNG to JPG"));
    if (!card) return false;
    card.click();
    return true;
  })()`, true);
  await new Promise((r) => setTimeout(r, 600));
  const toolsVerify = await win.webContents.executeJavaScript(`(() => {
    const runner = Boolean(document.querySelector(".toolRunner"));
    const fileInput = Boolean(document.querySelector(".toolRunner input[type=file]"));
    const actionBtn = Boolean(document.querySelector(".toolRunner .primaryBtn"));
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
    return { ok: runner && fileInput && actionBtn && !err, runner, fileInput, actionBtn, err };
  })()`, true).catch((e) => ({ ok: false, why: String(e) }));
  console.log("[shot] tools runner verify:", JSON.stringify(toolsVerify));
  if (!toolOpened || !toolsVerify || !toolsVerify.ok) {
    console.error("DESKTOP_SHOT TOOLS VERIFY FAILED (runner)");
    app.exit(9);
    return;
  }
  await snap(win, "desktop-tools.png");

  // tool AI end-to-end through the REAL bridge (mock pair): submitTask → taskStore
  // → poll getTask → result image. This is the 4c gate "tool AI (mock pair)".
  console.log("[shot] running the YouTube Banner Maker (mock pair)…");
  const aiOpened = await win.webContents.executeJavaScript(`(() => {
    const back = [...document.querySelectorAll(".ghostBtn")].find((b) => b.textContent.includes("All tools"));
    back?.click();
    return true;
  })()`, true);
  await new Promise((r) => setTimeout(r, 500));
  const bannerCard = await win.webContents.executeJavaScript(`(() => {
    const card = [...document.querySelectorAll(".toolCard")].find((c) => c.textContent.includes("YouTube Banner Maker"));
    if (!card) return false;
    card.click();
    return true;
  })()`, true);
  await new Promise((r) => setTimeout(r, 500));
  const prompted = await win.webContents.executeJavaScript(`(() => {
    const ta = document.querySelector(".toolRunner textarea");
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, "matcha tea banner, calm greens");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`, true);
  // React re-renders asynchronously — POLL for the enabled button instead of racing it
  let genClicked = false;
  for (let i = 0; i < 20 && !genClicked; i++) {
    genClicked = await win.webContents.executeJavaScript(`(() => {
      const btn = document.querySelector(".toolRunner .primaryBtn");
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    })()`, true).catch(() => false);
    if (!genClicked) await new Promise((r) => setTimeout(r, 300));
  }
  let aiDone = false;
  let aiVerify: unknown = null;
  for (let i = 0; i < 60 && !aiDone; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    aiVerify = await win.webContents.executeJavaScript(`(() => {
      const img = document.querySelector(".aiResult img");
      const busy = document.querySelector('.toolRunner [role=status]')?.textContent ?? "";
      const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
      if (img && img.complete && img.naturalWidth > 0) return { ok: true, src: img.src.slice(0, 60) };
      return { ok: false, busy: busy.slice(0, 60), err };
    })()`, true).catch(() => null);
    aiDone = Boolean(aiVerify && (aiVerify as { ok: boolean }).ok);
  }
  console.log("[shot] tool AI verify:", JSON.stringify(aiVerify));
  if (!aiOpened || !bannerCard || !prompted || !genClicked || !aiDone) {
    console.error("DESKTOP_SHOT TOOL AI VERIFY FAILED");
    app.exit(12);
    return;
  }
  await snap(win, "desktop-tools-ai.png");

  // ---- reorg 4d: Brand kit panel — kit form over the real store -----------------
  console.log("[shot] opening Brand kit…");
  await win.webContents.executeJavaScript(`(() => {
    const pills = [...document.querySelectorAll(".viewNav .navPill")];
    pills.find((p) => p.textContent.trim() === "Brand kit")?.click();
    return true;
  })()`, true);
  let kitReady = false;
  for (let i = 0; i < 20; i++) {
    kitReady = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector(".kitFields"))`, true,
    );
    if (kitReady) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const kitVerify = await win.webContents.executeJavaScript(`(() => {
    const fields = Boolean(document.querySelector(".kitFields"));
    const title = Boolean(document.querySelector(".kitTitleInput"));
    const save = [...document.querySelectorAll(".kitActions .primaryBtn")].some((b) => b.textContent.includes("Save"));
    const list = document.querySelectorAll(".kitListItem").length;
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
    return { ok: fields && title && save && !err, fields, title, save, list, err };
  })()`, true).catch((e) => ({ ok: false, why: String(e) }));
  console.log("[shot] brandkit verify:", JSON.stringify(kitVerify));
  if (!kitVerify || !kitVerify.ok) {
    console.error("DESKTOP_SHOT BRANDKIT VERIFY FAILED");
    app.exit(10);
    return;
  }
  await snap(win, "desktop-brandkit.png");

  // ---- reorg 4d: For Agents — keys form + live loopback base URL ----------------
  console.log("[shot] opening For agents…");
  await win.webContents.executeJavaScript(`(() => {
    const pills = [...document.querySelectorAll(".viewNav .navPill")];
    pills.find((p) => p.textContent.trim() === "For agents")?.click();
    return true;
  })()`, true);
  let agentsReady = false;
  for (let i = 0; i < 30; i++) {
    agentsReady = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector(".apiKeyForm")) && (Boolean(document.querySelector(".baseUrlCode")) || document.body.textContent.includes("starting"))`,
      true,
    );
    if (agentsReady) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  const agentsVerify = await win.webContents.executeJavaScript(`(() => {
    const form = Boolean(document.querySelector(".apiKeyForm"));
    const baseUrl = document.querySelector(".baseUrlCode")?.textContent ?? "";
    const keysTable = Boolean(document.querySelector(".tableScroll table"));
    const emptyKeys = Boolean(document.querySelector(".emptyState"));
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
    const portStr = baseUrl.slice("http://127.0.0.1:".length, baseUrl.length - "/api".length);
    const ok = form && baseUrl.startsWith("http://127.0.0.1:") && baseUrl.endsWith("/api") && Number.isInteger(Number(portStr)) && (keysTable || emptyKeys) && !err;
    return { ok, form, baseUrl, keysTable, emptyKeys, err };
  })()`, true).catch((e) => ({ ok: false, why: String(e) }));
  console.log("[shot] agents verify:", JSON.stringify(agentsVerify));
  if (!agentsVerify || !agentsVerify.ok) {
    console.error("DESKTOP_SHOT AGENTS VERIFY FAILED");
    app.exit(11);
    return;
  }
  // Clipboard e2e gate: the renderer's navigator.clipboard is DENIED by the F2
  // permission handler — Copy must ride the main-side bridge and confirm visibly.
  const copyBtn = await win.webContents.executeJavaScript(`(() => {
    const btn = document.querySelector('.baseUrlCode ~ .iconBtn, .agentSection .toolRow .iconBtn[aria-label="Copy base URL"]');
    if (!btn) return false;
    btn.click();
    return true;
  })()`, true);
  let copiedSeen = false;
  for (let i = 0; i < 10 && !copiedSeen; i++) {
    await new Promise((r) => setTimeout(r, 200));
    copiedSeen = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector('[data-copied="1"]'))`, true,
    ).catch(() => false);
  }
  console.log(`[shot] clipboard copy gate: clicked=${copyBtn} copied=${copiedSeen}`);
  if (!copyBtn || !copiedSeen) {
    console.error("DESKTOP_SHOT CLIPBOARD VERIFY FAILED");
    app.exit(13);
    return;
  }
  await snap(win, "desktop-agents.png");

  const image = await win.capturePage();
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(path.join(here, "../..", "out"), { recursive: true });
  await writeFile(path.join(here, "../..", "out", "desktop-shot.png"), image.toPNG());
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
    const image = await win.capturePage();
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(path.join(here, "../..", "out"), { recursive: true });
    await writeFile(path.join(here, "../..", "out", name), image.toPNG());
    console.log(`[shot] wrote out/${name}`);
  } finally {
    win.webContents.setZoomFactor(1); // never leak the audit zoom into the next view
  }
}

function registerMenu(): void {
  // F2: explicit View submenu — role:"viewMenu" shipped Toggle Developer Tools
  // + Reload to sellers. Dev builds (unpackaged) keep reload/devtools for development.
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate(process.platform === "darwin", !app.isPackaged)));
}

/**
 * F1 — ONE app instance, ever. Without the lock, a second launch forked a second
 * utility process against the SAME userData: the atomic-write queue is per-process,
 * so two writers saved over each other (last-writer-wins data loss), and two loopback
 * servers fought over one discovery file + one quota guard. The smoke isolates its
 * userData so it never races a real running instance on a dev machine.
 */
if (process.env.OIA_DESKTOP_SI_SMOKE === "1") {
  app.setPath("userData", mkdtempSync(path.join(tmpdir(), "oia-si-smoke-")));
}
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  // Marker line asserted by the SI smoke gate (and useful in bug reports).
  console.log("[single-instance] another Oia owns this userData — focusing it and exiting");
  app.quit();
} else {
  app.on("second-instance", () => {
    // Someone tried to launch us again: surface the existing window instead.
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

app.whenReady().then(async () => {
  initRuntimeController(path.join(app.getPath("userData")));
  registerIpc();
  registerMenu();
  // F2 — the app loads ONLY local content; no permission has a legitimate
  // requester. Deny every request (camera/clipboard-read/geolocation/…) instead
  // of Electron's default grant-all.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    console.warn(`[security] denied permission request: ${permission}`);
    callback(false);
  });
  const mode = smokeModeFromEnv(process.env, app.isPackaged); // test modes: dev builds only
  if (mode === "si") {
    await singleInstanceSmoke();
    return;
  }
  if (mode === "smoke") {
    await smoke();
    return;
  }
  if (mode === "crash") {
    await crashSmoke();
    return;
  }
  if (mode === "real") {
    await realSmoke().catch((err) => {
      console.error("DESKTOP_REAL_SMOKE CRASHED:", err);
      app.exit(1);
    });
    return;
  }
  if (mode === "shot") {
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

let shuttingDown = false;
app.on("before-quit", (e) => {
  if (shuttingDown) return;
  shuttingDown = true;
  e.preventDefault();
  void (async () => {
    // Give in-flight generations one honest chance to die BEFORE the kill: cancel
    // aborts the controllers → CliRuntime kills the detached codex trees. Fire-and-
    // forget here would race SIGTERM and could orphan a quota-burning child (the
    // TP-D5 regression this fixes). Bounded so quit never hangs.
    await Promise.race([
      utility.call({ cmd: "cancelAll" }).catch(() => {}),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
    utility.kill();
    app.exit(0);
  })();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
}

/**
 * F1 gate — the single-instance lock, end to end with a REAL second process:
 * spawn this same app (env flags stripped, same userData); it must hit the lock,
 * print the secondary marker and exit quickly instead of booting a second
 * utility process. Old behavior: the child fully started — two writers on the
 * same stores (the failure mode this gate exists to catch).
 */
async function singleInstanceSmoke(): Promise<void> {
  registerAssetProtocol();
  createWindow();
  const childEnv: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("OIA_DESKTOP_") && v !== undefined) childEnv[k] = v;
  }
  const appRoot = app.getAppPath();
  // The lock is keyed on the user data dir — the child MUST contend for the SAME
  // isolated dir the parent setPath'd, never the dev machine's real one.
  const child = spawn(
    process.execPath,
    [appRoot, `--user-data-dir=${app.getPath("userData")}`, ...process.argv.slice(2)],
    {
      cwd: appRoot,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let sawMarker = false;
  child.stdout.on("data", (c: Buffer) => {
    if (c.toString("utf8").includes("[single-instance]")) sawMarker = true;
  });
  child.stderr.on("data", (c: Buffer) => process.stderr.write(`[si-child] ${c}`));

  const exited = await new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
    const timer = setTimeout(() => resolve({ code: null, timedOut: true }), 30_000);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut: false });
    });
  });
  if (!exited.timedOut) child.kill();
  const ok = !exited.timedOut && sawMarker;
  console.log(
    `DESKTOP_SI_SMOKE ${ok ? "OK" : "FAILED"} secondaryExited=${!exited.timedOut} ` +
      `marker=${sawMarker} code=${exited.code}`,
  );
  app.exit(ok ? 0 : 1);
}
