import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, protocol, session, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { writeFile, mkdir as mkdirAsync } from "node:fs/promises";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { IPC } from "../shared/channels.js";
import { appMenuTemplate, smokeModeFromEnv, resolveUserDataOverride } from "./releaseGate.js";
import { shutdownSequence } from "./shutdownSequence.js";
import { oiaFilesKey } from "./oiaProtocol.js";
import { fixturePngB64, fixturePptxB64, brokenPptxB64 } from "./shotFixture.js";

import { TRAFFIC_LIGHTS } from "../shared/trafficLights.js";
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
import { runShotBusy } from "./shotBusy.js";
import { buildServiceEnv } from "../shared/providers-mode.js";

/**
 * D11 (reorg step 4a), the Electron MAIN process owns windows, menus, dialogs,
 * the oia://files protocol, and the codex runtime controller. The SERVICE layer
 * (ServiceContext: runChat, task store, projects/templates/sessions, files, NSFW)
 * lives in a separate utility process (src/utility) reached through the typed
 * RPC in main/utilityClient, a services crash can no longer take the window
 * down, and the main thread never blocks on provider work.
 *
 * Renderer contract is UNCHANGED: the same IPC channels, the same zod validation
 * in shared/ipc.ts, main validates, then forwards to the utility process.
 *
 * TP-D3 (unchanged): the codex runtime is managed in-app; this process owns the
 * provider-mode choice (settings.json in userData) and rebuilds the utility's
 * service context when it changes. CI smoke/shot always run mock.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

let ctxMode: "mock" | "codex" | null = null; // what the CURRENT utility context was built with
let ctxGeneration = -1; // which utility FORK built it, mismatch (crash+restart) forces re-init

/** Serialize context builds, concurrent IPC must never build two contexts. */
let buildLock: Promise<unknown> = Promise.resolve();
function withBuildLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = buildLock.then(fn);
  buildLock = run.catch(() => {}); // the chain never rejects; callers see their own error
  return run;
}

/** The provider env the utility context builds from: mode + resolved codex binary.
 *  T3: assembled by the PURE builder in shared/providers-mode; main never mutates
 *  process.env (the old set-then-restore CODEX_BIN dance leaked global state). */
async function contextEnv(): Promise<Record<string, string | undefined>> {
  const mode = await effectiveMode();
  const det = mode === "codex" ? await getProvisionerSafe() : null;
  const env = buildServiceEnv(process.env, mode, det);
  env.OIA_LENS_DIR = process.env.OIA_LENS_DIR ?? (app.isPackaged ? path.join(process.resourcesPath, "lens") : path.resolve(here, "../../resources/lens"));
  // shot-busy paces the mock pair so the mid-run UI stays photographable,
  // registry-only knob (T3 pattern), injected here, never via process.env mutation.
  if (smokeModeFromEnv(process.env, app.isPackaged) === "shot-busy") env.OIA_MOCK_STEP_DELAY_MS = "350";
  return env;
}

/** Boot (or rebuild) the utility service context under the build lock.
 *  Cached by (mode, generation): re-init only on the first call, a mode change,
 *  or after a utility crash (a new fork has no context, generation mismatch). */
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

/** detect() without side effects, no status probe, no login round trip. */
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
  { scheme: "oia", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }, // corsEnabled: scene images load with crossOrigin=anonymous, without it ACAO is treated as opaque and every image fails
]);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Oia",
    // T1 (macos-design-2026.md): native-feel chrome on macOS, traffic lights
    // inline with the app's top bars (padding + drag region in app.css); the
    // system title bar stays intact on Windows/Linux. x + the bar inset share
    // TRAFFIC_LIGHTS (shared/trafficLights.ts), the shot gate pins the pair.
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: TRAFFIC_LIGHTS.x, y: 21 } } : {}),
    webPreferences: {
      preload: path.join(here, "../preload/index.cjs"), // .cjs, see electron.vite.config note
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // preload only needs contextBridge/ipcRenderer, sandboxed works
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
  // TP-D5: closing the window kills in-flight generations, quota never burns unseen
  win.on("closed", cancelAllJobs);
  return win;
}

function cancelAllJobs(): void {
  void utility.call({ cmd: "cancelAll" }).catch(() => {});
}

/** Agent-job frames seen since app start (newest first, capped), the For Agents
 *  panel gets history even for jobs that ran while it was closed. */
const agentJobRing: (AgentJobFrame & { at: number })[] = [];

function registerIpc(): void {
  registerRuntimeIpc({
    rebuildContext,
    currentEffective: () => ctxMode,
  });
  // F2: every IPC handler first admits only OUR renderer windows; a foreign
  // sender (should none ever exist) gets a stable ForbiddenSender error.
  const handle = (ch: string, fn: (event: IpcMainInvokeEvent, raw: unknown) => unknown): void => {
    ipcMain.handle(ch, async (event, raw) => {
      if (!isOwnRendererSender(event)) throw forbiddenSenderError();
      return fn(event, raw);
    });
  };
  handle(IPC.chatRun, async (event, raw: unknown) => {
    try {
      const req = chatRequestSchema.parse(raw); // validated HERE, the utility trusts main
      await ensureUtility();
      // requestId: random UUID, two rapid chats from one sender must NEVER share
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
  handle(IPC.segmentStatus, async () => {
    try {
      await ensureUtility();
      return await utility.call({ cmd: "segment.status" });
    } catch (err) {
      ipcError(err);
    }
  });
  handle(IPC.segmentDownload, async () => {
    try {
      await ensureUtility();
      return await utility.call({ cmd: "segment.download" });
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
  // reorg step 5, import a self-hosted web app's .data dir; an empty sourceDir
  // opens the native folder picker (null = user canceled, nothing ran)
  handle(IPC.dataImportWeb, async (event, raw: unknown) => {
    try {
      let { sourceDir } = dataImportWebSchema.parse(raw);
      if (!sourceDir) {
        const win = BrowserWindow.fromWebContents(event.sender);
        const pick = await dialog.showOpenDialog(win!, {
          title: "Import from web app, choose the .data folder",
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
  // to every live window, the For Agents feed reads both. `lane` separates agent-API
  // runs from quick-tools runs (both metered, both must stay visible, hard rule 6).
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
      // Test modes have no human to answer a native save dialog (the shot gate
      // would hang on it): auto-save into the sandboxed userData instead, the
      // renderer path (saved=true + path) stays the one under test.
      if (smokeModeFromEnv(process.env, app.isPackaged)) {
        const dir = path.join(app.getPath("userData"), "shot-export");
        const target = path.join(dir, fileName);
        await mkdirAsync(dir, { recursive: true });
        await writeFile(target, bytes);
        return { saved: true as const, path: target };
      }
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
 *  file:// cannot hit the LocalFileStore, without this, the canvas renders empty. */
function registerAssetProtocol(): void {
  protocol.handle("oia", async (request) => {
    try {
      const key = oiaFilesKey(request.url);
      if (!key) return new Response(null, { status: 404 });
      await ensureUtility();
      const bytes = (await utility.call({ cmd: "files.read", key })) as Uint8Array;
      const ext = key.split(".").pop() ?? "";
      // scene objects load with crossOrigin="anonymous" (file:// → oia:// is cross-origin):
      // without ACAO the image load is blocked and fabric loadFromJSON rejects
      return new Response(bytes as unknown as BodyInit, {
        headers: {
          "content-type": { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", ttf: "font/ttf", txt: "text/plain; charset=utf-8" }[ext] ?? "application/octet-stream",
          "cache-control": "public, max-age=31536000, immutable",
          "access-control-allow-origin": "*",
        },
      });
    } catch (err) {
      // Log, then 404, a swallow-everything catch hid the poisoned-realpath bug for hours.
      console.error("[oia://] handler error:", err instanceof Error ? err.stack : String(err));
      return new Response(null, { status: 404 });
    }
  });
}

/** Scripted end-to-end check without a human, now through the REAL main→utility
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
 * services process mid-session, then make a normal call, the client MUST detect
 * the dead generation, fork a fresh utility, re-init the context, and answer.
 * This is the regression test for the "one crash bricked the app" bug.
 */
async function crashSmoke(): Promise<void> {
  await ensureUtility();
  // reorg step 5 gate: a project that exists BEFORE the crash must come back intact
  // after the crash + refork (per-project files, the store reloads from disk).
  await utility.call({ cmd: "projects.create", input: { name: "crash-smoke survivor" } });
  const before = (await utility.call({ cmd: "projects.list" })) as { name?: string }[];
  utility.kill(); // simulate a services crash
  for (let i = 0; i < 40 && !utility.crashed; i++) await new Promise((r) => setTimeout(r, 100));
  if (!utility.crashed) {
    console.log("DESKTOP_CRASH_SMOKE FAILED exit-event never observed");
    app.exit(1);
    return;
  }
  // the same path every IPC handler takes, must self-heal via the generation check
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
 * SG-2 (surgepix-parity-todo.md): scripted smoke against a PACKAGED build.
 * The 2026-11 release lesson: `electron .` test modes sandbox userData, but a
 * packaged app had no such switch, so a scripted boot landed on the REAL profile
 * and its asset GC ran. Now OIA_USER_DATA_DIR (validated + probed in main) puts
 * the whole app, stores and loopback discovery file into a throwaway dir, and
 * this mode proves it end to end: renderer boots, utility context comes up, one
 * MOCK task (the OIA_DESKTOP_ prefix default-denies real providers) completes
 * through the task store. Marker lines are asserted by scripts/packaged-smoke.mjs.
 */
async function packagedSmoke(): Promise<void> {
  const t0 = Date.now();
  const fail = (why: string): void => {
    console.error(`DESKTOP_PACKAGED_SMOKE FAILED ${why}`);
    app.exit(1);
  };
  registerAssetProtocol();
  const win = createWindow();
  const loaded = await new Promise<boolean>((resolve) => {
    win.webContents.once("did-finish-load", () => resolve(true));
    win.webContents.once("did-fail-load", () => resolve(false));
    setTimeout(() => resolve(false), 20_000);
  });
  console.log(`[packaged-smoke] renderer loaded=${loaded} userData=${app.getPath("userData")}`);
  if (!loaded) return fail("renderer did not load");
  // SAFETY: non-null is guaranteed by smokeModeFromEnv: "packaged-smoke" is
  // only reachable when OIA_USER_DATA_DIR is set (Boolean(env.OIA_USER_DATA_DIR)).
  const override = process.env.OIA_USER_DATA_DIR!.trim();
  if (path.resolve(app.getPath("userData")) !== path.resolve(override)) {
    return fail("userData is not the OIA_USER_DATA_DIR override");
  }
  await ensureUtility();
  console.log("[packaged-smoke] utility context up");
  const discovery = path.join(app.getPath("userData"), "agent-api.json");
  if (!existsSync(discovery)) return fail(`loopback discovery file missing: ${discovery}`);
  console.log("[packaged-smoke] loopback discovery present");
  const started = (await utility.call({ cmd: "tasks.submit", type: "generate-poster", params: { prompt: "packaged smoke banner" } })) as { taskId: string; progress: string };
  type PsTaskState = { progress: string; taskResult: { download?: string } | null; msg?: string };
  let final: PsTaskState | null = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    final = (await utility.call({ cmd: "tasks.get", taskId: started.taskId })) as PsTaskState | null;
    if (final && final.progress !== "processing") break;
  }
  console.log(`[packaged-smoke] task ${started.taskId} progress=${final?.progress} download=${final?.taskResult?.download ?? "-"} msg=${final?.msg ?? ""}`);
  if (!final || final.progress !== "succeeded" || !final.taskResult?.download?.startsWith("/api/files/")) {
    return fail("the mock task did not complete with a stored asset");
  }
  console.log(`DESKTOP_PACKAGED_SMOKE OK renderer+utility+task in ${Math.round((Date.now() - t0) / 1000)}s`);
  app.exit(0);
}

/**
 * TP-D3 exit check, the REAL run through the shell wiring (quota-billed, opt-in via
 * OIA_DESKTOP_REAL_SMOKE=1, never in CI): auto mode must resolve codex from the live
 * runtime state, one real banner completes, assets land in the store with bytes on disk.
 *
 * DA gates (designer-agent-loop.md, owner-approved quota 2026-11-06) run in the SAME
 * invocation so a future pin bump re-verifies every paid surface in one go (D12 rule):
 * - DA-RESEARCH: one poster whose facts need a web lookup, codex `--search` must run
 *   through the BUNDLED binary and researchNotes[] must come back with real sources.
 * - DA-REFINE: one poster whose exact copy is deliberately hard to render, the critic
 *   must really read the image (readImage) and the verdict must be honest; rounds ≥ 1
 *   additionally proves the refine→re-generate path on the real pair.
 */
async function realSmoke(): Promise<void> {
  const t0 = Date.now();
  await ensureUtility();
  type Ev = { content?: string; error?: string; errorClass?: string; renderData?: { msgMeta?: unknown[]; taskMeta?: { id: string; content: string; status?: string }[]; selfImprove?: { rounds: number; verdict: string; issues: string[]; refinePath?: string } } };
  const collect = async (req: Record<string, unknown>): Promise<{ outcome: string; jobId: string; events: Ev[] }> => {
    const events: Ev[] = [];
    const off = utility.onUtilityEvent((ev) => {
      if (ev.type === "chatEvent") events.push(ev.ev as Ev);
    });
    try {
      const { outcome, jobId } = (await utility.call({ cmd: "chatRun", req }, { requestId: "real-smoke" })) as { outcome: string; jobId: string };
      return { outcome, jobId, events };
    } finally {
      off();
    }
  };
  const failFast = (line: string) => {
    console.error(line);
    app.exit(1);
  };
  /** Asset bytes on disk behind a job's canvas, a canvas meta without stored
   * bytes is not a banner (job 0's old inline loop, shared with the DA gates). */
  const assetBytesOf = async (events: Ev[]): Promise<number> => {
    const canvas = events.flatMap((e) => (e.renderData?.msgMeta ?? []) as { type?: string; canvas?: { objects?: { src?: string }[] } }[]).find((m) => m.type === "canvas");
    let bytes = 0;
    for (const o of canvas?.canvas?.objects ?? []) {
      const src = o.src ?? "";
      if (src.startsWith("/api/files/")) {
        try {
          bytes += ((await utility.call({ cmd: "files.read", key: src.replace("/api/files/", "") })) as Uint8Array).length;
        } catch {
          /* missing asset counted as 0 */
        }
      }
    }
    return bytes;
  };

  // ---- job 0: the D12 pair check (unchanged) ----
  const job0 = await collect({ prompt: "banner trà sữa giảm 20% ngày 8/11, khổ dọc Shopee", mode: "clean-plate" });
  const snap = await runtimeSnapshotFor(await effectiveMode());
  const assetBytes = await assetBytesOf(job0.events);
  const err0 = job0.events.find((e) => e.errorClass);
  const ok0 =
    job0.outcome === "completed" &&
    snap.effective === "codex" &&
    snap.runtime.state === "ready" &&
    assetBytes > 10_000;
  console.log(
    `DESKTOP_REAL_SMOKE ${ok0 ? "OK" : "FAILED"} outcome=${job0.outcome} effective=${snap.effective} runtime=${snap.runtime.state} ` +
      `version=${snap.runtime.version ?? "?"} assetBytes=${assetBytes} events=${job0.events.length} ` +
      `${err0 ? `error=${err0.errorClass}` : "no-error"} jobId=${job0.jobId} took=${Math.round((Date.now() - t0) / 1000)}s`,
  );
  if (!ok0) {
    failFast("DESKTOP_REAL_SMOKE FAILED, pair check (job 0) failed; skipping the DA gates");
    return;
  }

  // ---- DA-RESEARCH (slice 1 gate): facts that need a live lookup. ALSO runs
  // refine (rounds 1), the DEFAULT combination (research + selfImprove together,
  // teardown #7) must be proven on the real pair, not just each loop alone ----
  const t1 = Date.now();
  const job1 = await collect({
    prompt:
      "banner quảng bá ngày Black Friday 2026 cho shop trà sữa, phải tra web lấy NGÀY Black Friday 2026 chính xác in lên banner, kèm giảm giá 35%",
    research: true,
    selfImprove: { rounds: 1 },
  });
  const notesEv = job1.events.find((e) => (e.content ?? "").includes("Research notes:"));
  const noteLines = (notesEv?.content ?? "").split("\n").filter((l) => l.trim().startsWith("-"));
  // teardown #17: "sourced" means a domain-ish or URL citation, any trailing
  // parenthesis (e.g. "(mock planner)") must NOT pass
  const sourced = noteLines.filter((l) => /\((?:[^)]*https?:\/\/[^)]*|[^)]*[a-z0-9-]+\.[a-z]{2,}[^)]*)\)\s*$/i.test(l.trim())).length;
  const researchNode = job1.events.at(-1)?.renderData?.taskMeta?.find((tm) => tm.content === "Researching the web");
  const combinedVerdict = [...job1.events].reverse().find((e) => e.renderData?.selfImprove)?.renderData?.selfImprove;
  const ok1 =
    job1.outcome === "completed" && Boolean(notesEv) && noteLines.length > 0 && sourced > 0 &&
    researchNode?.status === "1" && Boolean(combinedVerdict) && (combinedVerdict?.verdict === "pass" || combinedVerdict?.verdict === "best-effort");
  console.log(
    `DESKTOP_REAL_SMOKE_DA_RESEARCH ${ok1 ? "OK" : "FAILED"} outcome=${job1.outcome} notes=${noteLines.length} sourced=${sourced} ` +
      `researchNode=${researchNode?.status ?? "absent"} refine=${combinedVerdict ? `${combinedVerdict.verdict}/r${combinedVerdict.rounds}` : "none"} ` +
      `${job1.events.find((e) => e.errorClass)?.errorClass ?? "no-error"} ` +
      `jobId=${job1.jobId} took=${Math.round((Date.now() - t1) / 1000)}s`,
  );
  if (!ok1) {
    failFast("DESKTOP_REAL_SMOKE_DA_RESEARCH FAILED, --search did not yield sourced notes, or the combined research+refine run produced no honest verdict");
    return;
  }

  // ---- DA-REFINE (slice 2f gate): copy deliberately hard to render → the critic must really look ----
  const t2 = Date.now();
  const job2 = await collect({
    prompt:
      "poster dọc, nền pastel, in ĐÚNG từng chữ dòng này: 'TRÀ SỮA TRÂN CHÂU ĐƯỜNG ĐEN GIẢM GIÁ 35% · CHỈ DUY NHẤT THỨ SÁU 27/11 · MÃ GIAM35 · FREESHIP ĐƠN TỪ 99K'",
    selfImprove: { rounds: 2 },
  });
  const verdict = [...job2.events].reverse().find((e) => e.renderData?.selfImprove)?.renderData?.selfImprove;
  const checks = Math.max(
    0,
    ...job2.events.flatMap((e) => e.renderData?.taskMeta?.filter((tm) => tm.content.startsWith("Checking round")).map((tm) => Number(tm.content.replace(/\D+/g, ""))) ?? [0]),
  );
  const refineAssetBytes = await assetBytesOf(job2.events);
  const ok2 =
    job2.outcome === "completed" && Boolean(verdict) && (verdict?.verdict === "pass" || verdict?.verdict === "best-effort") && refineAssetBytes > 10_000;
  console.log(
    `DESKTOP_REAL_SMOKE_DA_REFINE ${ok2 ? (verdict && verdict.rounds >= 1 ? "OK-REFINED" : "OK-FIRST-TRY") : "FAILED"} ` +
      `outcome=${job2.outcome} rounds=${verdict?.rounds ?? "none"} verdict=${verdict?.verdict ?? "none"} path=${verdict?.refinePath ?? "-"} checks=${checks} ` +
      `issues=${verdict?.issues?.length ?? 0} assetBytes=${refineAssetBytes} ` +
      `${job2.events.find((e) => e.errorClass)?.errorClass ?? "no-error"} ` +
      `jobId=${job2.jobId} took=${Math.round((Date.now() - t2) / 1000)}s`,
  );
  if (!ok2) {
    failFast("DESKTOP_REAL_SMOKE_DA_REFINE FAILED, no honest selfImprove verdict on the winning canvas");
    return;
  }
  if (verdict && verdict.rounds < 1) {
    // not a failure, the critic passed the first image; but the refine turn itself stayed
    // unproven this run. Loud, because the doc gate wants ≥1 recorded round.
    console.log("DESKTOP_REAL_SMOKE_DA_REFINE NOTE: critic passed the first image, the refine→re-generate path was NOT exercised this run (rerun to prove it)");
  }
  console.log(`DESKTOP_REAL_SMOKE_ALL_OK took=${Math.round((Date.now() - t0) / 1000)}s`);
  app.exit(0);
}

/**
 * Visual verification (the "open eyes" mode): open the real window, run a chat through
 * the renderer bridge, wait for the canvas, capture a PNG to out/desktop-*.png.
 * Exit codes: 2 bridge missing · 3 home verify · 4/5 editor · 6 autosave · 7/8 workspace
 * · 9 tools · 10 brand kit · 11 for-agents · 12 tool AI · 13 clipboard gate
 * · 17 A1 variant gate (preview-apply, docs/designs/variant-preview-apply.md)
 * · 18 C1 outline gate (docs/designs/outline-gate.md)
 * · 22 R6 composer (platform size menu + Skills ▾ + Recent designs, ui-v11)
 * · 23 R6 Skills click-through (a menu item opens THAT tool in the Tools view).
 */
async function shot(): Promise<void> {
  registerAssetProtocol();
  // SG-9: the remove-bg gate needs its SUCCESS branch observable in CI too.
  // rembg is a local CLI most runners don't have; a PATH fake that echoes a
  // fixed transparent PNG pins the WIRING (button → task → spawn → layer swap),
  // never segmentation quality. Installed BEFORE createWindow because the
  // utility process forks with this PATH and never re-reads it.
  const fakeBinDir = path.join(app.getPath("userData"), "shot-fake-bin");
  const { mkdir: mkdirP, writeFile: writeFileP } = await import("node:fs/promises");
  await mkdirP(fakeBinDir, { recursive: true });
  await writeFileP(path.join(fakeBinDir, "fake-cutout.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", "base64"));
  await writeFileP(path.join(fakeBinDir, "rembg"), "#!/bin/sh\n# Oia shot-gate wiring fake for rembg (SG-9). First call FAILS (error-path gate:\n# the layer must survive untouched), later calls emit the fixture cutout PNG.\ncat > /dev/null\nd=\"$(dirname \"$0\")\"\nif [ ! -f \"$d/.called\" ]; then\n  touch \"$d/.called\"\n  echo \"fake rembg failure for the error-path gate\" >&2\n  exit 1\nfi\ncat \"$d/fake-cutout.png\"\n", { mode: 0o755 });
  const shotPathBackup = process.env.PATH;
  process.env.PATH = `${fakeBinDir}:${process.env.PATH ?? ""}`;
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
  // T1 chrome gate (darwin): the traffic-light padding shipped GREEN while broken
  // once, the marker wasn't set and no assert noticed. Pin the PAIR now: marker
  // present AND the bar's computed padding equals the shared constant exactly.
  if (process.platform === "darwin") {
    const chrome = await win.webContents.executeJavaScript(`(() => {
      const bar = document.querySelector(".sidebarHead");
      return {
        marker: document.documentElement.dataset.platform ?? null,
        pad: bar ? getComputedStyle(bar).paddingLeft : null,
        drag: bar ? getComputedStyle(bar).webkitAppRegion : null,
      };
    })()`, true);
    console.log("[shot] chrome verify:", JSON.stringify(chrome));
    if (chrome.marker !== "darwin" || chrome.pad !== `${TRAFFIC_LIGHTS.insetPx}px` || chrome.drag !== "drag") {
      console.error("DESKTOP_SHOT CHROME VERIFY FAILED");
      app.exit(15);
      return;
    }
    // Dark-mode: a gate here was REMOVED (2026-10-31 teardown). It flipped
    // nativeTheme and asserted the nav pill color, but nothing in this stack
    // flips (probe: neither themeSource=dark nor real system dark moves ANY
    // computed color, explicit or UA-default). The gate could never fail; it
    // was theater shipped against a symptom that was never reproduced. The
    // color-scheme:light pin stays as light-app hygiene (D8), not as a fix.
  }
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
    console.error("[shot] bridge missing, preload failed (sandbox/CSP/format?)");
    app.exit(2);
    return;
  }
  // drive the SAME UI a user would: type into the composer and click Create,
  // gates the real submit path (progress chips, ✓ summary, result card), not just the bridge.
  // (smoke mode intentionally drives the bridge instead: it gates the ENGINE e2e without UI)
  await win.webContents.executeJavaScript(
    `(() => {
      const ta = document.querySelector('[data-testid="design-idea"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, 'banner smoke trà sữa giảm 20%');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      const btn = document.querySelector('[data-testid="create-btn"]');
      if (!btn || btn.disabled) return 'create-btn missing/disabled';
      btn.click();
      return 'submitted';
    })()`,
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
    const gen = document.querySelector('.genSummary')?.textContent ?? "";
    const canvas = document.querySelector(".result canvas");
    if (!canvas) return { ok: false, why: "no canvas", err, gen };
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
    return { ok: nonWhite > 50 && !err && /^✓ Generated in \\d+s$/.test(gen), painted: nonWhite, err, gen };
  })()`, true);
  console.log("[shot] verify:", JSON.stringify(verify));
  if (!verify || !verify.ok) {
    console.error("DESKTOP_SHOT VERIFY FAILED");
    app.exit(3);
    return;
  }
  await snap(win, "desktop-home.png");

  // ---- DA (designer-agent-loop): auto refine default ON, badge on the result,
  // the cost-label law (DA-5), switch OFF remembered + label gone (DA-4) ----
  const da = await win.webContents.executeJavaScript(`(async () => {
    const badge = document.querySelector('[data-testid="auto-refined-badge"]')?.textContent ?? null;
    const open = () => { if (!document.querySelector('.advancedSettings')) document.querySelector('.advancedToggle')?.click(); };
    open();
    await new Promise((r) => setTimeout(r, 120));
    const sw = document.querySelector('[data-testid="auto-refine-switch"]');
    const research = document.querySelector('[aria-label="Research the web"]');
    return { badge, cost: document.querySelector('[data-testid="cost-hint"]')?.textContent ?? null, switchOn: sw?.getAttribute('aria-checked') ?? null, hasResearch: Boolean(research), researchOn: research?.getAttribute('aria-checked') ?? null, researchNote: document.querySelector('.aiNotes')?.textContent ?? "" };
  })()`, true);
  console.log("[shot] DA:", JSON.stringify(da));
  if (
    !da || da.badge !== "auto-refined · round 1" ||
    !da.cost || !da.cost.includes("Auto refine on · up to 2 images + 2 reads") ||
    da.switchOn !== "true" || !da.hasResearch || da.researchOn !== "true" ||
    !da.researchNote.includes("Research unavailable on mock") // default ON announces honestly on a pair that cannot search
  ) {
    console.error("DESKTOP_SHOT DA FAILED, auto-refine badge, cost label, or the default-on switch is missing");
    app.exit(23);
    return;
  }
  const daOff = await win.webContents.executeJavaScript(`(async () => {
    const sw = document.querySelector('[data-testid="auto-refine-switch"]');
    sw?.click();
    await new Promise((r) => setTimeout(r, 120));
    const off = sw?.getAttribute('aria-checked');
    const costOff = document.querySelector('[data-testid="cost-hint"]')?.textContent ?? null;
    sw?.click(); // restore the decided default for the gates that follow
    await new Promise((r) => setTimeout(r, 80));
    // close the advanced panel, the C1 gate below toggles it open itself
    if (document.querySelector('.advancedSettings')) document.querySelector('.advancedToggle')?.click();
    await new Promise((r) => setTimeout(r, 80));
    return { off, costOff, restored: sw?.getAttribute('aria-checked'), panelClosed: !document.querySelector('.advancedSettings') };
  })()`, true);
  console.log("[shot] DA off:", JSON.stringify(daOff));
  if (!daOff || daOff.off !== "false" || (daOff.costOff ?? "") !== "" || daOff.restored !== "true") {
    console.error("DESKTOP_SHOT DA FAILED, switching auto refine off did not clear the cost label or remember the choice");
    app.exit(24);
    return;
  }

  // ---- Style preset (surgepix pattern): the select ships 10 presets + Auto (SC-2 added editorial/swiss),
  // the choice persists, and Auto cleans the key back out ------------------------
  const styleGate = await win.webContents.executeJavaScript(`(async () => {
    if (!document.querySelector('.advancedSettings')) document.querySelector('.advancedToggle')?.click();
    await new Promise((r) => setTimeout(r, 120));
    const sel = document.querySelector('select[aria-label="Style preset"]');
    if (!sel) return { ok: false, why: "no style select" };
    const opts = [...sel.options].map((o) => o.value);
    sel.value = "bold";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
    const stored = localStorage.getItem("oia.style");
    const shown = sel.value;
    sel.value = "";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    // restore the panel-closed state the next gate (C1) expects from daOff
    if (document.querySelector('.advancedSettings')) document.querySelector('.advancedToggle')?.click();
    await new Promise((r) => setTimeout(r, 100));
    return { ok: opts.length === 11 && stored === "bold" && shown === "bold" && localStorage.getItem("oia.style") === null, options: opts.length, stored, shown, cleared: localStorage.getItem("oia.style") === null };
  })()`, true);
  console.log("[shot] style preset:", JSON.stringify(styleGate));
  if (!styleGate || !styleGate.ok) {
    console.error("DESKTOP_SHOT STYLE PRESET FAILED, select missing, choice not persisted, or Auto did not clean the key");
    app.exit(25);
    return;
  }

  // ---- UI v1.1 R6: a use-case chip seeds the prompt AND the ratio (Deck also 3 pages) ----
  const r6 = await win.webContents.executeJavaScript(`(async () => {
    const chip = (name) => [...document.querySelectorAll(".useCaseChip")].find((b) => b.textContent === name);
    const aspect = () => document.querySelector('select[aria-label="Aspect ratio"]')?.value ?? null;
    const live = chip("Livestream"), deck = chip("Deck");
    if (!live || !deck) return "no-chips";
    live.click();
    await new Promise((r) => setTimeout(r, 100));
    const liveAspect = aspect();
    deck.click();
    await new Promise((r) => setTimeout(r, 100));
    const deckAspect = aspect();
    const deckPages = document.querySelector(".advancedToggle")?.textContent ?? null;
    const prompt = document.querySelector('[data-testid="design-idea"]')?.value ?? "";
    const sel = document.querySelector('select[aria-label="Aspect ratio"]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, "auto"); // C1 below runs at the default ratio
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return { liveAspect, deckAspect, deckPages, prompt };
  })()`, true);
  console.log("[shot] R6 chips:", JSON.stringify(r6));
  if (!r6 || r6.liveAspect !== "9:16" || r6.deckAspect !== "16:9" || r6.deckPages !== "3 pages" || !r6.prompt) {
    console.error("DESKTOP_SHOT R6 FAILED, a use-case chip did not set its ratio/pages");
    app.exit(21);
    return;
  }

  // ---- UI v1.1 R6 (completing): platform-grouped size pill, Skills ▾, Recent designs ----
  const r6c = await win.webContents.executeJavaScript(`(async () => {
    const sel = document.querySelector('select[aria-label="Aspect ratio"]');
    const groups = [...sel.querySelectorAll("optgroup")].map((g) => g.getAttribute("label"));
    const shopee = [...sel.options].find((o) => o.value === "shopee-1x1");
    const coversStarred = [...sel.options].filter((o) => o.value.endsWith("-live-cover")).every((o) => o.textContent.includes("★"));
    const set = (v) => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, v); sel.dispatchEvent(new Event("change", { bubbles: true })); };
    set("shopee-1x1");
    await new Promise((r) => setTimeout(r, 100));
    const shopeeSelected = sel.value === "shopee-1x1";
    set("auto"); // C1 below runs at the default ratio
    const skillsBtn = document.querySelector('.skillsWrap [aria-haspopup="menu"]');
    skillsBtn?.click();
    await new Promise((r) => setTimeout(r, 120));
    const skillItems = [...document.querySelectorAll(".skillsMenu [role=menuitem]")].map((b) => b.querySelector("strong")?.textContent ?? "");
    document.querySelector(".menuScrim")?.click();
    await new Promise((r) => setTimeout(r, 80));
    const menuClosed = !document.querySelector(".skillsMenu");
    const recent = document.querySelector('[data-testid="recent-designs"]');
    const recentCards = recent ? recent.querySelectorAll(".galleryCard").length : 0;
    const seeAll = Boolean(document.querySelector('[data-testid="recent-see-all"]'));
    return { groups, shopee: shopee?.textContent ?? null, coversStarred, shopeeSelected, skillItems, menuClosed, recentCards, seeAll };
  })()`, true);
  console.log("[shot] R6 composer:", JSON.stringify(r6c));
  if (
    !r6c || !r6c.groups.includes("Marketplace") || !r6c.groups.includes("Livestream") ||
    !r6c.shopee?.includes("Shopee 1:1") || !r6c.coversStarred || !r6c.shopeeSelected ||
    r6c.skillItems.length < 3 || !r6c.skillItems.includes("All tools") || !r6c.menuClosed ||
    r6c.recentCards < 1 || !r6c.seeAll
  ) {
    console.error("DESKTOP_SHOT R6 COMPOSER FAILED, size menu not platform-grouped, Skills menu missing, or Recent designs row absent");
    app.exit(22);
    return;
  }

  // ---- C1 outline gate: a 2-page deck stops for review BEFORE any image burns ----
  console.log("[shot] C1: running a gated 2-page deck (mock pair)…");
  const c1Setup = await win.webContents.executeJavaScript(`(async () => {
    const adv = document.querySelector(".advancedToggle");
    if (!adv) return "no-advanced";
    adv.click();
    await new Promise((r) => setTimeout(r, 200)); // React must mount the panel before we query it
    const panel = document.querySelector("#advanced-settings");
    if (!panel) return "no-panel";
    const sel = panel.querySelector("select");
    if (!sel) return "no-pages-select";
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(sel, "2");
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    const sw = panel.querySelector('[role=switch][aria-label="Review outline before generating"]');
    const cost = document.querySelector('[data-testid="deck-cost"]')?.textContent ?? null;
    return { switchDefaultOn: sw ? sw.getAttribute("aria-checked") : null, cost };
  })()`, true);
  console.log("[shot] C1 setup:", JSON.stringify(c1Setup));
  // DA-5: the deck label keeps C1's contract AND appends the per-page refine
  // worst case (2 pages × (1 round + 1) = 4), auto refine was restored ON above.
  if (!c1Setup || c1Setup.switchDefaultOn !== "true" || c1Setup.cost !== "2 pages ≈ 2 images · Auto refine on · up to 4 images + 4 reads") {
    console.error("DESKTOP_SHOT C1 FAILED, switch not default-on or cost label missing");
    app.exit(18);
    return;
  }
  const c1Submitted = await win.webContents.executeJavaScript(`(() => {
    if (!document.querySelector(".result canvas")) return "stale-result"; // sanity: first run's card present
    const ta = document.querySelector('[data-testid="design-idea"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, "two page deck about milk tea promotion");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    const btn = document.querySelector('[data-testid="create-btn"]');
    if (!btn || btn.disabled) return "create-disabled";
    btn.click();
    return "submitted";
  })()`, true);
  if (c1Submitted !== "submitted") {
    console.error(`DESKTOP_SHOT C1 FAILED, could not submit deck (${c1Submitted})`);
    app.exit(18);
    return;
  }
  let outlineShown = false;
  for (let i = 0; i < 60; i++) {
    outlineShown = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector('[data-testid="outline-card"]'))`,
      true,
    );
    if (outlineShown) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!outlineShown) {
    const why = await win.webContents.executeJavaScript(`({
      alerts: [...document.querySelectorAll('[role=alert],[role=status]')].map((n) => n.textContent.slice(0, 120)),
      pages: document.querySelector("#advanced-settings select")?.value ?? null,
      prompt: document.querySelector('[data-testid="design-idea"]')?.value ?? null,
    })`, true).catch(() => null);
    console.error(`DESKTOP_SHOT C1 FAILED, outline card never appeared (${JSON.stringify(why)})`);
    app.exit(18);
    return;
  }
  await new Promise((r) => setTimeout(r, 500));
  const c1Card = await win.webContents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll("[data-testid^=outline-title-]")].map((i) => i.value);
    const gone = !document.querySelector(".result canvas"); // NO image was generated in phase 1
    const gen = document.querySelector('[data-testid="outline-generate"]');
    return { rows, resultHiddenWhileReviewing: gone, genEnabled: gen ? !gen.disabled : null, cost: document.querySelector('[data-testid="outline-cost"]')?.textContent ?? null };
  })()`, true);
  console.log("[shot] C1 card:", JSON.stringify(c1Card));
  // teardown #1: the card where the user APPROVES the spend shows the SAME cost
  // law as the composer, with auto refine default-on that includes the worst case
  if (!c1Card || c1Card.rows.length !== 2 || c1Card.resultHiddenWhileReviewing !== true || c1Card.genEnabled !== true || c1Card.cost !== "2 pages ≈ 2 images · Auto refine on · up to 4 images + 4 reads") {
    console.error("DESKTOP_SHOT C1 FAILED, card state wrong (rows/hidden-result/enabled/cost)");
    app.exit(18);
    return;
  }
  // edit a title (the card's whole point), snap WITH the card, then pay
  await win.webContents.executeJavaScript(`(() => {
    const inp = document.querySelector('[data-testid="outline-title-0"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(inp, "Milk tea cover");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  })()`, true);
  await snap(win, "desktop-outline.png");
  await win.webContents.executeJavaScript(`document.querySelector('[data-testid="outline-generate"]').click()`, true);
  let deckReady = false;
  for (let i = 0; i < 60; i++) {
    deckReady = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector(".result canvas")) && !document.querySelector('[data-testid="outline-card"]')`,
      true,
    );
    if (deckReady) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 800));
  const deckVerify = await win.webContents.executeJavaScript(`(() => {
    const err = document.querySelector('[role=alert]')?.textContent ?? "";
    const canvas = document.querySelector(".result canvas");
    return { ok: Boolean(canvas) && !err, err, hasCanvas: Boolean(canvas) };
  })()`, true);
  console.log("[shot] C1 deck:", JSON.stringify(deckVerify));
  if (!deckVerify || !deckVerify.ok) {
    console.error("DESKTOP_SHOT C1 FAILED, deck did not generate after approval");
    app.exit(18);
    return;
  }
  console.log("[shot] C1 outline gate OK (default-on + cost label + 2-row card + no burn while reviewing + deck after approval)");

  // ---- C1 escape hatch: switch OFF multi-page runs go STRAIGHT through (no card) ----
  console.log("[shot] C1-off: 3 pages with the gate disabled…");
  const offSetup = await win.webContents.executeJavaScript(`(async () => {
    const sw = document.querySelector('[role=switch][aria-label="Review outline before generating"]');
    if (!sw) return "no-switch";
    if (sw.getAttribute("aria-checked") !== "true") return "unexpected-state";
    sw.click();
    await new Promise((r) => setTimeout(r, 200));
    const sel = document.querySelector("#advanced-settings select");
    if (!sel) return "no-select";
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(sel, "3");
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    const cost = document.querySelector('[data-testid="deck-cost"]')?.textContent ?? null;
    const ta = document.querySelector('[data-testid="design-idea"]');
    const tset = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    tset.call(ta, "three page direct deck no review");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    const btn = document.querySelector('[data-testid="create-btn"]');
    if (!btn || btn.disabled) return "create-disabled";
    btn.click();
    return { cost, off: sw.getAttribute("aria-checked") };
  })()`, true);
  console.log("[shot] C1-off setup:", JSON.stringify(offSetup));
  if (!offSetup || offSetup.off !== "false" || offSetup.cost !== "3 pages ≈ 3 images · Auto refine on · up to 6 images + 6 reads") {
    console.error(`DESKTOP_SHOT C1 FAILED, off-branch setup wrong (${JSON.stringify(offSetup)})`);
    app.exit(18);
    return;
  }
  // two-phase poll: the previous deck's canvas must UNMOUNT first (submit clears it),
  // or we would photograph the stale canvas and call the new run done
  let goneSeen = false;
  for (let i = 0; i < 30; i++) {
    goneSeen = await win.webContents.executeJavaScript(`!document.querySelector(".result canvas")`, true);
    if (goneSeen) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!goneSeen) {
    console.error("DESKTOP_SHOT C1 FAILED, off-branch: previous result never unmounted");
    app.exit(18);
    return;
  }
  let directReady = false;
  for (let i = 0; i < 60; i++) {
    directReady = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector(".result canvas")) && Boolean(document.querySelector(".genSummary"))`,
      true,
    );
    if (directReady) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 600));
  const offVerify = await win.webContents.executeJavaScript(`(() => {
    const card = Boolean(document.querySelector('[data-testid="outline-card"]'));
    const canvas = Boolean(document.querySelector(".result canvas"));
    const err = document.querySelector('[role=alert]')?.textContent ?? "";
    return { noCard: !card, canvas, err };
  })()`, true);
  console.log("[shot] C1-off verify:", JSON.stringify(offVerify));
  if (!offVerify || offVerify.noCard !== true || offVerify.canvas !== true || offVerify.err) {
    console.error("DESKTOP_SHOT C1 FAILED, gate off must skip the card and generate directly");
    app.exit(18);
    return;
  }
  console.log("[shot] C1 gate-off OK (direct 3-page run, no outline card)");

  // ---- D2 remainder: drive the EDITOR port with eyes -------------------------
  console.log("[shot] opening the editor…");
  const clicked = await win.webContents.executeJavaScript(`(() => {
    const btn = document.querySelector('[data-testid="open-editor"]');
    if (!btn) return false;
    btn.click();
    return true;
  })()`, true);
  if (!clicked) {
    console.error("DESKTOP_SHOT EDITOR FAILED, open-editor button missing");
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
    return { ok: rail === 8 && dock && strip && nonWhite > 50, painted: nonWhite, rail, dock, strip, err };
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

  // ---- A1 preview-apply: edit via the AI dock must NEVER touch the canvas ----------
  // The regression this pins: the pre-A1 code auto-merged the result onto the page.
  // If that path ever comes back, canvasUntouched fails here (variant-preview-apply VA-3).
  console.log("[shot] A1: running an editor AI edit (mock pair)…");
  const sessionsBefore = await win.webContents.executeJavaScript(`window.oia.listSessions().then((s) => s.length)`, true);
  const submitEdit = (text: string) => win.webContents.executeJavaScript(`(() => {
    const c = (window).__oiaCanvas;
    if (!c) return "no-canvas";
    if (!window.__oiaShotBefore) (window).__oiaShotBefore = JSON.stringify(c.toObject().objects.map((o) => o.src ?? null));
    const ta = document.querySelector('[aria-label="AI edit request"]');
    if (!ta) return "no-composer";
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, ${JSON.stringify(text)});
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    const btn = document.querySelector('.aiComposerControls .generateBtn[aria-label="Send edit request"]');
    if (!btn || btn.disabled) return "send-missing";
    btn.click();
    return "submitted";
  })()`, true);
  const waitCards = async (n: number) => {
    for (let i = 0; i < 60; i++) {
      const count = await win.webContents.executeJavaScript(
        `document.querySelectorAll('[data-testid="variant-card"]').length`,
        true,
      );
      if (count === n) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  };
  const submitted = await submitEdit("make the background pastel");
  if (submitted !== "submitted") {
    console.error(`DESKTOP_SHOT A1 FAILED, could not submit edit (${submitted})`);
    app.exit(17);
    return;
  }
  if (!(await waitCards(1))) {
    console.error("DESKTOP_SHOT A1 FAILED, first variant card never arrived");
    app.exit(17);
    return;
  }
  await new Promise((r) => setTimeout(r, 600)); // let the job settle (busy state clears)
  const a1Verify = await win.webContents.executeJavaScript(`(() => {
    const c = (window).__oiaCanvas;
    const before = JSON.parse((window).__oiaShotBefore);
    const after = c.toObject().objects.map((o) => o.src ?? null);
    const cards = document.querySelectorAll('[data-testid="variant-card"]').length;
    const replace = document.querySelector('[data-testid="variant-replace"]');
    return {
      cards,
      replaceDisabledNoSelection: replace ? replace.disabled : null,
      canvasUntouched: JSON.stringify(after) === JSON.stringify(before), // VA-3: the core pin
      costHintHiddenInMock: !document.querySelector('[data-testid="cost-hint"]'),
    };
  })()`, true);
  console.log("[shot] A1 verify:", JSON.stringify(a1Verify));
  if (!a1Verify || a1Verify.cards !== 1 || a1Verify.canvasUntouched !== true || a1Verify.replaceDisabledNoSelection !== true || a1Verify.costHintHiddenInMock !== true) {
    console.error("DESKTOP_SHOT A1 VERIFY FAILED (exactly 1 deduped card / untouched canvas)");
    app.exit(17);
    return;
  }
  // select the artwork image → Replace must swap EXACTLY ONE src (VA-4). The mock
  // placeholder is deterministic per prompt, so the edit's artwork is a DIFFERENT
  // asset than the Home generation the canvas came from, the flagship behavior is
  // proven e2e here, not just in unit tests.
  const selected = await win.webContents.executeJavaScript(`(async () => {
    const c = (window).__oiaCanvas;
    const img = c.getObjects().find((o) => o.src && o.name !== "clip");
    if (!img) return false;
    c.setActiveObject(img);
    c.requestRenderAll();
    await new Promise((r) => setTimeout(r, 200));
    const replace = document.querySelector('[data-testid="variant-replace"]');
    const undo = document.querySelector('.edTop [title="Undo"]');
    // painted-pixel proxy: a white-on-white label passed every DOM assert before
    // (the dark-mode lesson, element-exists gates cannot see color). Contrast check:
    // enabled Replace must not share background and text color.
    const cs = replace ? getComputedStyle(replace) : null;
    return { enabled: Boolean(replace && !replace.disabled), undoDisabledBefore: undo ? undo.disabled : null, bg: cs ? cs.backgroundColor : null, fg: cs ? cs.color : null };
  })()`, true);
  if (!selected || selected.enabled !== true || selected.undoDisabledBefore !== true) {
    console.error(`DESKTOP_SHOT A1 FAILED, Replace enable state wrong (${JSON.stringify(selected)})`);
    app.exit(17);
    return;
  }
  if (!selected.bg || !selected.fg || selected.bg.replace(/\s/g, "") === selected.fg.replace(/\s/g, "")) {
    console.error(`DESKTOP_SHOT A1 FAILED, Replace label invisible (bg=${selected.bg} fg=${selected.fg})`);
    app.exit(17);
    return;
  }
  await win.webContents.executeJavaScript(`document.querySelector('[data-testid="variant-replace"]').click()`, true);
  await new Promise((r) => setTimeout(r, 1200)); // replaceCurrentScene reloads the page
  const swapVerify = await win.webContents.executeJavaScript(`(() => {
    const c = (window).__oiaCanvas;
    const before = JSON.parse((window).__oiaShotBefore);
    const objs = c.toObject().objects;
    const changed = objs.filter((o, i) => (o.src ?? null) !== (before[i] ?? null)).length;
    const undo = document.querySelector('.edTop [title="Undo"]');
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
    return { countKept: objs.length === before.length, changedSrcs: changed, undoEnabledAfter: undo ? !undo.disabled : null, err };
  })()`, true);
  console.log("[shot] A1 swap:", JSON.stringify(swapVerify));
  if (!swapVerify || swapVerify.countKept !== true || swapVerify.changedSrcs !== 1 || swapVerify.undoEnabledAfter !== true || swapVerify.err) {
    console.error("DESKTOP_SHOT A1 SWAP FAILED, must change EXACTLY one src, keep count, flip undo on, no error");
    app.exit(17);
    return;
  }
  // VA-1 pinning, proven e2e: a second edit in the same dock must join the SAME
  // conversation (sessions grow by 1 across BOTH edits) and add a second card.
  const second = await submitEdit("make it warmer and bolder");
  if (second !== "submitted") {
    console.error(`DESKTOP_SHOT A1 FAILED, second edit could not be submitted (${second})`);
    app.exit(17);
    return;
  }
  if (!(await waitCards(2))) {
    console.error("DESKTOP_SHOT A1 FAILED, second variant card never arrived");
    app.exit(17);
    return;
  }
  await new Promise((r) => setTimeout(r, 600));
  const sessionsAfter = await win.webContents.executeJavaScript(`window.oia.listSessions().then((s) => s.length)`, true);
  if (sessionsAfter !== sessionsBefore + 1) {
    console.error(`DESKTOP_SHOT A1 FAILED, session pinning broken (before=${sessionsBefore} after=${sessionsAfter}, expected +1)`);
    app.exit(17);
    return;
  }
  // snap WITH the tray visible, the artifact must show the feature it certifies
  await snap(win, "desktop-editor.png");
  // "Not now" hides every card (VA-7), the record stays in the session either way
  await win.webContents.executeJavaScript(`(async () => {
    for (let i = 0; i < 10; i++) {
      const b = document.querySelector('[data-testid="variant-dismiss"]');
      if (!b) break;
      b.click();
      await new Promise((r) => setTimeout(r, 150)); // let React unmount the card before re-querying
    }
  })()`, true);
  await new Promise((r) => setTimeout(r, 300));
  const dismissed = await win.webContents.executeJavaScript(
    `!document.querySelector('[data-testid="variant-card"]')`,
    true,
  );
  if (dismissed !== true) {
    console.error("DESKTOP_SHOT A1 FAILED, Not now did not hide the cards");
    app.exit(17);
    return;
  }
  console.log("[shot] A1 preview-apply OK (deduped cards + untouched canvas + exact-one-src swap + session pinning + dismiss)");

  // ---- ME (markup-edit.md): Circle-to-edit, capability-gated toolbar button,
  // annotate overlay strokes, ask panel, dispatched edit → 3rd variant card, and
  // the C3-lesson pin: the annotation NEVER enters the scene JSON. ----
  const meEntry = await win.webContents.executeJavaScript(`(async () => {
    const c = (window).__oiaCanvas;
    const img = c.getObjects().find((o) => o.src && o.name !== "clip");
    if (!img) return { ok: false, why: "no image layer" };
    c.setActiveObject(img);
    c.requestRenderAll();
    await new Promise((r) => setTimeout(r, 250));
    const btn = document.querySelector('[data-testid="ctx-circle-edit"]');
    if (!btn) return { ok: false, why: "no circle button, markup capability not wired" };
    btn.click();
    await new Promise((r) => setTimeout(r, 200));
    return { ok: Boolean(document.querySelector('[data-testid="markup-overlay"]') && document.querySelector('[data-testid="markup-bar"]')) };
  })()`, true);
  if (!meEntry || meEntry.ok !== true) {
    console.error(`DESKTOP_SHOT ME FAILED, annotate session did not open (${JSON.stringify(meEntry)})`);
    app.exit(30);
    return;
  }
  const meDrew = await win.webContents.executeJavaScript(`(async () => {
    const ov = document.querySelector('[data-testid="markup-overlay"]');
    if (!ov) return { ok: false, why: "overlay gone" };
    const r = ov.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const base = { bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, pointerType: "mouse" };
    ov.dispatchEvent(new PointerEvent("pointerdown", { ...base, clientX: cx - 70, clientY: cy }));
    for (let i = 0; i <= 10; i++) {
      ov.dispatchEvent(new PointerEvent("pointermove", { ...base, clientX: cx - 70 + i * 14, clientY: cy + Math.sin(i) * 8 }));
    }
    ov.dispatchEvent(new PointerEvent("pointerup", { ...base, clientX: cx + 70, clientY: cy }));
    await new Promise((res) => setTimeout(res, 150));
    const done = document.querySelector('[data-testid="markup-bar"] button:not([disabled])');
    // pixel truth: is the fabric canvas still painted, and did the overlay actually draw red?
    const sample = (cnv) => { const t = document.createElement("canvas"); t.width = 64; t.height = 64; const tc = t.getContext("2d"); tc.drawImage(cnv, 0, 0, 64, 64); return tc.getImageData(0, 0, 64, 64).data; };
    const fc = (window).__oiaCanvas;
    const upper = fc.lowerCanvasEl.parentElement.querySelector("canvas.upper-canvas") ?? fc.lowerCanvasEl;
    const fd = sample(upper);
    let painted = 0;
    for (let i = 0; i < fd.length; i += 4) { if (fd[i] < 245 || fd[i+1] < 245 || fd[i+2] < 245) painted++; }
    const od = sample(ov);
    let red = 0;
    for (let i = 0; i < od.length; i += 4) { if (od[i] > 180 && od[i+1] < 90 && od[i+2] < 90) red++; }
    return { ok: Boolean(done), doneLabel: done ? done.textContent : null, painted, red,
             };
  })()`, true);
  if (!meDrew || meDrew.ok !== true || meDrew.doneLabel !== "Done circling" || meDrew.painted < 40 || meDrew.red < 3) {
    console.error(`DESKTOP_SHOT ME FAILED, stroke did not arm Done / paint truth failed (${JSON.stringify(meDrew)})`);
    app.exit(30);
    return;
  }
  console.log(`[shot] ME draw pixels: fabric painted=${meDrew.painted}/4096 overlay red=${meDrew.red}/4096`);
  await snap(win, "desktop-editor-markup.png"); // the artifact must show the red circle
  const meSent = await win.webContents.executeJavaScript(`(async () => {
    document.querySelector('[data-testid="markup-bar"] button:not([disabled])').click();
    await new Promise((r) => setTimeout(r, 150));
    const ask = document.querySelector('[data-testid="markup-ask"]');
    if (!ask) return { ok: false, why: "ask panel missing" };
    const ta = ask.querySelector("textarea");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, "make the circled area cleaner");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    const c = (window).__oiaCanvas;
    (window).__oiaShotBefore2 = JSON.stringify(c.toObject().objects.map((o) => o.src ?? null));
    const run = [...ask.querySelectorAll("button")].find((b) => b.textContent.includes("Run"));
    if (!run || run.disabled) return { ok: false, why: "run missing/disabled" };
    run.click();
    return { ok: true, costHiddenInMock: !ask.querySelector(".mono") };
  })()`, true);
  if (!meSent || meSent.ok !== true || meSent.costHiddenInMock !== true) {
    console.error(`DESKTOP_SHOT ME FAILED, ask/run flow wrong (${JSON.stringify(meSent)})`);
    app.exit(30);
    return;
  }
  if (!(await waitCards(1))) {
    const meDbg = await win.webContents.executeJavaScript(`(() => ({
      err: [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" "),
      timeline: document.querySelector("[data-testid='ai-timeline'], .aiNotes")?.textContent?.slice(0, 300) ?? null,
      ask: Boolean(document.querySelector('[data-testid="markup-ask"]')),
      overlay: Boolean(document.querySelector('[data-testid="markup-overlay"]')),
    }))()`, true);
    console.error(`DESKTOP_SHOT ME FAILED, the markup edit never produced a variant card (${JSON.stringify(meDbg)})`);
    app.exit(30);
    return;
  }
  await new Promise((r) => setTimeout(r, 500));
  const mePurity = await win.webContents.executeJavaScript(`(() => {
    const c = (window).__oiaCanvas;
    const now = JSON.stringify(c.toObject().objects.map((o) => o.src ?? null));
    const overlayGone = !document.querySelector('[data-testid="markup-overlay"]');
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
    return { sceneUntouched: now === (window).__oiaShotBefore2, overlayGone, err };
  })()`, true);
  if (!mePurity || mePurity.sceneUntouched !== true || mePurity.overlayGone !== true || mePurity.err) {
    console.error(`DESKTOP_SHOT ME FAILED, scene purity broken (${JSON.stringify(mePurity)})`);
    app.exit(30);
    return;
  }
  console.log("[shot] ME circle-to-edit OK (button gated by capability · stroke → ask → 3rd card · annotation never in the scene)");

  // ---- Workspace view: projects list + recent conversations over IPC -------------
  console.log("[shot] opening Workspace…");
  const wentBack = await win.webContents.executeJavaScript(`(() => {
    const back = document.querySelector('[data-testid="editor-root"] .edTop .iconBtn');
    if (!back) return false;
    back.click();
    return true;
  })()`, true);
  if (!wentBack) {
    console.error("DESKTOP_SHOT WORKSPACE FAILED, editor back button missing");
    app.exit(7);
    return;
  }
  await new Promise((r) => setTimeout(r, 800));
  await win.webContents.executeJavaScript(`(() => {
    const pills = [...document.querySelectorAll(".viewNav .navPill")];
    const ws = pills.find((p) => p.textContent.trim() === "Projects");
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
  const wsVerify = await win.webContents.executeJavaScript(`(async () => {
    const cards = document.querySelectorAll(".projectGrid article").length;
    const preview = Boolean(document.querySelector(".projectGrid .projectPreview .scenePreview"));
    const samples = document.querySelectorAll(".projectGrid article[data-sample] .sampleBadge").length;
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
    // VISUAL FIT gate: every rendered thumbnail canvas must sit INSIDE its card box,
    // the fabric wrapper's inline px sizes used to overflow and clip half the artwork.
    const fits = [...document.querySelectorAll(".projectGrid .projectPreview .scenePreview")].map((s) => {
      const box = s.closest(".projectPreview").getBoundingClientRect();
      const c = s.querySelector("canvas");
      if (!c) return { ok: false, why: "no canvas" };
      const r = c.getBoundingClientRect();
      return { ok: r.left >= box.left - 2 && r.right <= box.right + 2 && r.top >= box.top - 2 && r.bottom <= box.bottom + 2,
               why: Math.round(r.width) + "x" + Math.round(r.height) + " in " + Math.round(box.width) + "x" + Math.round(box.height) };
    });
    const fitOk = fits.length > 0 && fits.every((f) => f.ok);
    // R2: the Samples filter shows exactly the samples; AI history holds the conversations
    const chip = (t) => [...document.querySelectorAll(".filterChip")].find((b) => b.textContent === t);
    chip("Samples")?.click();
    await new Promise((r) => setTimeout(r, 150));
    const samplesOnly = document.querySelectorAll(".projectGrid article").length === samples
      && document.querySelectorAll(".projectGrid article:not([data-sample])").length === 0;
    chip("All")?.click();
    const tab = (t) => [...document.querySelectorAll(".segmented button")].find((b) => b.textContent === t);
    tab("AI history")?.click();
    await new Promise((r) => setTimeout(r, 150));
    const chats = document.querySelectorAll(".chatGrid .chatCard").length;
    tab("Projects")?.click();
    await new Promise((r) => setTimeout(r, 400));
    return { ok: cards >= 1 && preview && chats >= 1 && samples >= 1 && samplesOnly && fitOk && !err, cards, preview, samples, samplesOnly, chats, fitOk, fits: fits.map((f) => f.why).slice(0, 6), err };
  })()`, true);
  console.log("[shot] workspace verify:", JSON.stringify(wsVerify));
  if (!wsVerify || !wsVerify.ok) {
    console.error("DESKTOP_SHOT WORKSPACE VERIFY FAILED");
    app.exit(8);
    return;
  }
  await snap(win, "desktop-workspace.png");

  // ---- C3: livestream overlay preset + safe-zone guides + export purity ----------
  // Pins live-overlay-presets.md gates 2-4: transparent PNG survives the real
  // fabric toDataURL lane; guides (DOM layer) never leak into rendered bytes;
  // the guide toggle refuses a non-9:16 artboard instead of lying.
  console.log("[shot] C3: creating a livestream overlay project…");
  // R2: Projects › New opens the Create sheet; the C3 artboards are its Livestream row
  const sheetOpen = await win.webContents.executeJavaScript(`(async () => {
    const btn = document.querySelector('[data-testid="projects-new"]');
    if (!btn) return "no-new-btn";
    btn.click();
    await new Promise((r) => setTimeout(r, 300));
    if (!document.querySelector('[data-testid="create-sheet"]')) return "no-sheet";
    const rows = [...document.querySelectorAll(".createSizeRow")];
    const live = rows.find((r) => r.querySelector(".createSizeGroup")?.textContent === "Livestream");
    const liveItems = live ? live.querySelectorAll(".createSize").length : 0;
    const stars = document.querySelectorAll(".createSheet .officialStar").length; // LV-10: only the two covers
    return liveItems === 3 && stars === 2 ? "open" : "live-" + liveItems + "-stars-" + stars;
  })()`, true);
  if (sheetOpen !== "open") {
    console.error(`DESKTOP_SHOT R2 FAILED, create sheet (${sheetOpen})`);
    app.exit(22);
    return;
  }
  await new Promise((r) => setTimeout(r, 800)); // scene previews in the template lane mount lazily
  await snap(win, "desktop-create.png");
  const liveCreated = await win.webContents.executeJavaScript(`(() => {
    const overlay = [...document.querySelectorAll(".createSize")].find((b) => b.textContent.includes("Livestream overlay"));
    if (!overlay) return "no-overlay-item";
    overlay.click();
    return "clicked";
  })()`, true);
  if (liveCreated !== "clicked") {
    console.error(`DESKTOP_SHOT C3 FAILED, create sheet item (${liveCreated})`);
    app.exit(19);
    return;
  }
  let liveReady = false;
  for (let i = 0; i < 40; i++) {
    liveReady = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector('[data-testid="editor-root"] .canvasWrap[data-transparent="true"] canvas'))`,
      true,
    );
    if (liveReady) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 1200));
  if (!liveReady) {
    console.error("DESKTOP_SHOT C3 FAILED, overlay artboard never mounted transparent");
    app.exit(19);
    return;
  }
  // Alpha + guides-purity on the REAL canvas (same fabric toDataURL lane export uses).
  const alphaGate = await win.webContents.executeJavaScript(`(async () => {
    const c = (window).__oiaCanvas;
    if (!c) return { ok: false, why: "no-canvas" };
    const corners = async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const px = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
      return { w: img.width, h: img.height, tl: px(0, 0), tr: px(img.width - 1, 0), bl: px(0, img.height - 1), br: px(img.width - 1, img.height - 1) };
    };
    const btn = document.querySelector('[aria-label="Toggle platform safe-zone guides"]');
    if (!btn) return { ok: false, why: "no-guide-btn" };
    if (btn.disabled) return { ok: false, why: "guide-btn-disabled-on-916" };
    btn.click();
    await new Promise((r) => setTimeout(r, 300));
    const zones = document.querySelectorAll(".canvasWrap .guideZone").length;
    const badge = document.querySelector(".canvasWrap .guideBadge")?.textContent ?? "";
    const pressed = btn.getAttribute("aria-pressed");
    const pngOn = c.toDataURL({ format: "png", multiplier: 1 });
    const cornersOn = await corners(pngOn);
    // Re-query the button each time: React re-renders it on state change and a
    // stale node's click() is silently lost (caught by the vision check on the snap).
    // The cycle is off→TikTok→Shopee→off, so click UNTIL it is off, bounded.
    let zonesOff = -1;
    for (let i = 0; i < 3; i++) {
      document.querySelector('[aria-label="Toggle platform safe-zone guides"]')?.click();
      await new Promise((r) => setTimeout(r, 300));
      zonesOff = document.querySelectorAll(".canvasWrap .guideZone").length;
      if (zonesOff === 0) break;
    }
    const pngOff = c.toDataURL({ format: "png", multiplier: 1 });
    return {
      ok: pressed === "true" && zones >= 3 && badge.length > 0 && zonesOff === 0
        && cornersOn.tl === 0 && cornersOn.tr === 0 && cornersOn.bl === 0 && cornersOn.br === 0
        && pngOn === pngOff,
      zones, zonesOff, badge, pressed, cornersOn, bytesIdentical: pngOn === pngOff,
    };
  })()`, true);
  console.log("[shot] C3 alpha/guides gate:", JSON.stringify(alphaGate));
  if (!alphaGate || !alphaGate.ok) {
    console.error("DESKTOP_SHOT C3 FAILED, alpha corners must be 0 and guides must not change rendered bytes");
    app.exit(19);
    return;
  }
  // Template pack: apply "Flash sale price", native text on the transparent artboard.
  const tplApplied = await win.webContents.executeJavaScript(`(async () => {
    const rail = [...document.querySelectorAll('.railBtn')].find((b) => b.getAttribute("aria-label") === "Templates");
    if (!rail) return "no-rail";
    rail.click();
    await new Promise((r) => setTimeout(r, 300));
    const groups = [...document.querySelectorAll(".panelBox h5.tplGroup")].map((h) => h.textContent);
    const tpl = [...document.querySelectorAll(".panelBox .presetBtn")].find((b) => b.textContent.includes("Flash sale price"));
    if (!tpl) return "no-template-btn:" + groups.join("|");
    tpl.click();
    await new Promise((r) => setTimeout(r, 900));
    const c = (window).__oiaCanvas;
    const objs = c ? c.toObject().objects : [];
    const flash = objs.some((o) => o.type === "Textbox" && String(o.text ?? "").includes("FLASH SALE"));
    const clip = objs.find((o) => o.name === "clip");
    return { ok: Boolean(flash && clip && clip.fill === "transparent"), groups, flash, fill: clip?.fill ?? null };
  })()`, true);
  console.log("[shot] C3 template gate:", JSON.stringify(tplApplied));
  if (!tplApplied || !tplApplied.ok) {
    console.error("DESKTOP_SHOT C3 FAILED, Flash sale template did not land as native text on a transparent clip");
    app.exit(19);
    return;
  }
  // Snap WITH guides visible, the artifact must show the feature it certifies
  // (same rule as the A1 tray snap). Guides were switched off in the alpha gate.
  await win.webContents.executeJavaScript(`(async () => {
    const btn = document.querySelector('[aria-label="Toggle platform safe-zone guides"]');
    if (btn && !btn.disabled) { btn.click(); await new Promise((r) => setTimeout(r, 300)); }
    return document.querySelectorAll(".canvasWrap .guideZone").length;
  })()`, true);
  await snap(win, "desktop-live-overlay.png");
  // and off again before the refusal check measures a clean slate
  await win.webContents.executeJavaScript(`(async () => {
    const btn = document.querySelector('[aria-label="Toggle platform safe-zone guides"]');
    let n = -1;
    for (let i = 0; i < 3; i++) {
      btn?.click();
      await new Promise((r) => setTimeout(r, 300));
      n = document.querySelectorAll(".canvasWrap .guideZone").length;
      if (n === 0) break;
    }
    return n;
  })()`, true);
  // LV-6 honest refusal: a 3:4 studio template must DISABLE the guide toggle,
  // not show a 9:16 guide on a poster artboard.
  const refused = await win.webContents.executeJavaScript(`(async () => {
    const tpl = [...document.querySelectorAll(".panelBox .presetBtn")].find((b) => b.textContent.includes("Matcha every day"));
    if (!tpl) return { ok: false, why: "no-poster-template" };
    tpl.click();
    await new Promise((r) => setTimeout(r, 900));
    const btn = document.querySelector('[aria-label="Toggle platform safe-zone guides"]');
    // Teardown C3: applying an opaque template must flip the wrap OFF transparent,
    // the attr drives the checkerboard AND the export alpha hint; a stale pages
    // state would keep lying "transparent" after the scene went white.
    const wrap = document.querySelector('[data-testid="editor-root"] .canvasWrap');
    return { ok: Boolean(btn && btn.disabled && !wrap?.getAttribute("data-transparent")), disabled: btn ? btn.disabled : null, title: btn?.title ?? "", zones: document.querySelectorAll(".canvasWrap .guideZone").length, stillTransparent: wrap?.getAttribute("data-transparent") ?? null };
  })()`, true);
  console.log("[shot] C3 refusal gate:", JSON.stringify(refused));
  if (!refused || !refused.ok) {
    console.error("DESKTOP_SHOT C3 FAILED, guide toggle must refuse a non-9:16 artboard");
    app.exit(19);
    return;
  }
  console.log("[shot] C3 OK (transparent alpha + guides never in bytes + template pack + honest refusal)");
  // leave the editor so the Tools scenario below starts from the nav
  await win.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-testid="editor-root"] .edTop .iconBtn')?.click();
    return true;
  })()`, true);
  await new Promise((r) => setTimeout(r, 800));

  // ---- B1: deconstruct import, old banner in, editable text layers out (mock pair)
  // Pins deconstruct-import.md: price hidden in mock, two-phase task, texts ride
  // the result, the scene opens in the editor with native Textboxes (DC-1/DC-8).
  console.log("[shot] B1: deconstructing a fixture banner…");
  const deconStarted = await win.webContents.executeJavaScript(`(async () => {
    const pills = [...document.querySelectorAll(".viewNav .navPill")];
    pills.find((p) => p.textContent.trim() === "Projects")?.click();
    await new Promise((r) => setTimeout(r, 600));
    document.querySelector('[data-testid="projects-new"]')?.click(); // R2: images come in through the Create sheet
    await new Promise((r) => setTimeout(r, 300));
    const input = document.querySelector('input[aria-label="Bring an image"]');
    if (!input) return "no-input";
    // real PNG bytes (the shared shot fixture), a garbage blob would fail the preview Image load
    const bytes = Uint8Array.from(atob("${fixturePngB64()}"), (c) => c.charCodeAt(0));
    const file = new File([bytes], "old-banner.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const editable = document.querySelector('[data-testid="create-image-editable"]');
    if (!editable || !document.querySelector('[data-testid="create-image-background"]')) return "no-image-choices";
    if (/image \+/.test(editable.textContent)) return "price-shown-in-trial"; // mock: nothing is billed
    editable.click();
    return "picked";
  })()`, true);
  if (deconStarted !== "picked") {
    console.error(`DESKTOP_SHOT B1 FAILED, picker (${deconStarted})`);
    app.exit(20);
    return;
  }
  let deconDialog = false;
  for (let i = 0; i < 20 && !deconDialog; i++) {
    deconDialog = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector('[data-testid="decon-confirm"]'))`, true,
    );
    if (!deconDialog) await new Promise((r) => setTimeout(r, 250));
  }
  const deconDialogState = await win.webContents.executeJavaScript(`(() => {
    const cost = document.querySelector('[data-testid="decon-cost"]');
    const img = document.querySelector(".deconPreview img");
    return { dialog: Boolean(cost === null && img) }; // mock provider → cost label HIDDEN
  })()`, true);
  if (!deconDialog || !deconDialogState?.dialog) {
    console.error(`DESKTOP_SHOT B1 FAILED, confirm dialog (open=${deconDialog}, state=${JSON.stringify(deconDialogState)})`);
    app.exit(20);
    return;
  }
  await win.webContents.executeJavaScript(`document.querySelector('[data-testid="decon-confirm"]').click()`, true);
  // teardown B1 pin: "Cancel" must stay clickable WHILE the run is in flight
  // (the 2s first-poll window guarantees the busy state is observable in mock)
  const cancelAlive = await win.webContents.executeJavaScript(`(() => {
    const btn = [...document.querySelectorAll('.dialogActions .secondaryBtn')].find((b) => b.textContent.includes("Cancel"));
    return btn ? { present: true, disabled: btn.disabled, label: btn.textContent.trim() } : { present: false };
  })()`, true);
  if (!cancelAlive?.present || cancelAlive.disabled !== false) {
    console.error(`DESKTOP_SHOT B1 FAILED, cancel must stay alive mid-run (${JSON.stringify(cancelAlive)})`);
    app.exit(20);
    return;
  }
  console.log(`[shot] B1 cancel-alive gate:`, JSON.stringify(cancelAlive));
  let deconDone: unknown = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    deconDone = await win.webContents.executeJavaScript(`(() => {
      const root = document.querySelector('[data-testid="editor-root"]');
      const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
      return root ? { open: true, err } : { open: false, err };
    })()`, true).catch(() => null);
    if (deconDone && (deconDone as { open: boolean }).open) break;
  }
  // the scene load is async (loadFromJSON + fonts), poll until objects land, not just the root
  for (let i = 0; i < 20; i++) {
    const n = await win.webContents.executeJavaScript(
      `((window).__oiaCanvas ? (window).__oiaCanvas.toObject().objects.length : 0)`,
      true,
    ).catch(() => 0);
    if (n >= 2) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const deconVerify = await win.webContents.executeJavaScript(`(() => {
    const c = (window).__oiaCanvas;
    if (!c) return { ok: false, why: "no-canvas" };
    const objs = c.toObject().objects;
    const boxes = objs.filter((o) => o.type === "Textbox");
    const sale = boxes.some((o) => String(o.text ?? "").includes("SALE 50"));
    const liveImg = c.getObjects().find((o) => typeof o.get("src") === "string");
    const artScaled = liveImg ? [Math.round(liveImg.getScaledWidth()), Math.round(liveImg.getScaledHeight())] : null;
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
    return { ok: sale && boxes.length === 3 && !err && artScaled !== null && artScaled[0] >= 590, textboxes: boxes.length, sale, artScaled, err };
  })()`, true);
  console.log("[shot] B1 verify:", JSON.stringify(deconVerify));
  if (!deconVerify || !deconVerify.ok) {
    console.error("DESKTOP_SHOT B1 VERIFY FAILED, expected 3 native textboxes (SALE 50 present) + clean-plate artwork");
    app.exit(20);
    return;
  }
  // D22: assert painted glyph geometry, not merely the presence of text objects.
  const typographyVerify = await win.webContents.executeJavaScript(`(() => {
    const c = window.__oiaCanvas;
    const texts = c.getObjects().filter((o) => o.type === "textbox");
    const dims = [600, 200];
    const boxes = [[0.08, 0.1, 0.55, 0.09], [0.1, 0.72, 0.45, 0.07], [0.1, 0.81, 0.4, 0.05]];
    return texts.map((o, i) => {
      const canvas = o.toCanvasElement({ withoutTransform: true });
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let x0 = canvas.width, y0 = canvas.height, x1 = -1, y1 = -1;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] < 32) continue;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      const dx = x0 - (canvas.width - o.width) / 2, dy = y0 - (canvas.height - o.height) / 2;
      const r = o.angle * Math.PI / 180;
      const anchor = [o.left + dx * Math.cos(r) - dy * Math.sin(r), o.top + dx * Math.sin(r) + dy * Math.cos(r)];
      const b = boxes[i];
      const anchorOk = Math.abs(anchor[0] - b[0] * dims[0]) <= 3 && Math.abs(anchor[1] - b[1] * dims[1]) <= 3;
      const sizeOk = x1 >= x0 && y1 >= y0 && x1 - x0 + 1 <= b[2] * dims[0] + 3 && Math.abs(y1 - y0 + 1 - b[3] * dims[1]) <= 3;
      return { anchorOk, sizeOk, anchor, ink: [x1 - x0 + 1, y1 - y0 + 1], angle: o.angle, fill: o.fill, spacing: o.charSpacing, lines: o.textLines.length };
    });
  })()`, true);
  console.log("[shot] D22 typography pixels:", JSON.stringify(typographyVerify));
  // D23b: fill is now MEASURED from pixels (dominant ink cluster, seed only a fallback);
  // the fixture's price text is black, the mock seed claims yellow, the gate pins the truth.
  if (typographyVerify.length !== 3 || typographyVerify.some((o: { anchorOk: boolean; sizeOk: boolean; lines: number }) => !o.anchorOk || !o.sizeOk || o.lines !== 1)
      || typographyVerify[1].angle !== -8 || typographyVerify[1].fill !== "#000000" || !Number.isFinite(typographyVerify[2].spacing)) {
    console.error("DESKTOP_SHOT D22 FAILED, glyph size/anchor/style drift");
    app.exit(20);
    return;
  }
  await snap(win, "desktop-deconstruct.png");
  console.log("[shot] B1/D22 OK (mock pair, measured glyphs, rotated text, Vietnamese accents)");

  const recoveredEditVerify = await win.webContents.executeJavaScript(`(async () => {
    const c = window.__oiaCanvas;
    const snapshot = c.toObject();
    const target = c.getObjects().find((o) => o.type === "textbox" && o.get("recoveredTextLine") === true);
    if (!target) return { ok: false, why: "missing recovered text marker" };
    const before = { width: target.width, fontSize: target.fontSize, left: target.left, top: target.top, angle: target.angle };
    const replacement = "Chủ nhật vui vẻ! Cà phê sáng cùng bạn bè";
    const type = (o, text) => {
      c.setActiveObject(o); o.enterEditing();
      const input = o.hiddenTextarea;
      input.value = text; input.selectionStart = input.selectionEnd = text.length;
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      o.exitEditing(); c.renderAll();
    };
    type(target, replacement);
    const edited = {
      text: target.text, lines: target.textLines.length, grew: target.width > before.width, before,
      after: { width: target.width, fontSize: target.fontSize, left: target.left, top: target.top, angle: target.angle },
      sameStyle: target.fontSize === before.fontSize && Math.abs(target.left - before.left) < 0.001 && Math.abs(target.top - before.top) < 0.001 && target.angle === before.angle,
    };
    const saved = c.toObject();
    await c.loadFromJSON(saved);
    const restored = c.getObjects().find((o) => o.text === replacement);
    type(restored, replacement + " nhé!");
    const reloadOk = restored.get("recoveredTextLine") === true && restored.textLines.length === 1;
    const duplicate = await restored.clone();
    const cloneOk = duplicate.get("recoveredTextLine") === true;
    duplicate.dispose();
    type(restored, "Dòng một\\nDòng hai");
    const explicitBreakOk = restored.textLines.length === 2;
    restored.set("recoveredTextLine", false);
    restored.set({ text: "ordinary text", width: 40 });
    const ordinaryWidth = restored.width;
    type(restored, replacement);
    const ordinaryOk = restored.width === ordinaryWidth && restored.textLines.length > 1;
    await c.loadFromJSON(snapshot); c.renderAll();
    return { ok: edited.text === replacement && edited.lines === 1 && edited.grew && edited.sameStyle && reloadOk && cloneOk && explicitBreakOk && ordinaryOk, edited, reloadOk, cloneOk, explicitBreakOk, ordinaryOk };
  })()`, true);
  console.log("[shot] recovered text typing:", JSON.stringify(recoveredEditVerify));
  if (!recoveredEditVerify?.ok) {
    console.error("DESKTOP_SHOT recovered text typing FAILED");
    app.exit(20);
    return;
  }

  // ---- UI v1.1 R4/R5: Layers mirror the Fabric stack; selection drives toolbar + Design tab ----
  const r45 = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const c = (window).__oiaCanvas;
    if (!c) return { ok: false, why: "no canvas" };
    [...document.querySelectorAll(".railBtn")].find((b) => b.getAttribute("aria-label") === "Layers")?.click();
    await wait(200);
    const stack = c.getObjects().map((o, i) => (o.name === "clip" ? -1 : i)).filter((i) => i >= 0).reverse();
    const rows = [...document.querySelectorAll('[data-testid="layers-panel"] .layerRow')].map((r) => Number(r.dataset.layerIndex));
    const orderOk = rows.length === stack.length && rows.every((v, i) => v === stack[i]);

    const tb = c.getObjects().find((o) => o.type === "textbox");
    c.setActiveObject(tb); c.requestRenderAll();
    await wait(150);
    const ctxKind = document.querySelector('[data-testid="ctx-toolbar"]')?.dataset.kind ?? null;
    // the toolbar floats inside the canvas area, above (or just below) the selected layer
    const tbRect = document.querySelector('[data-testid="ctx-toolbar"]')?.getBoundingClientRect();
    const area = document.querySelector(".canvasArea").getBoundingClientRect();
    const wrap = document.querySelector(".canvasWrap").getBoundingClientRect();
    const sel = tb.getBoundingRect();
    const selTop = wrap.top + sel.top * c.viewportTransform[3];
    const ctxPlaced = Boolean(tbRect) && tbRect.width > 120 && tbRect.left >= area.left && tbRect.right <= area.right
      && (tbRect.bottom <= selTop + 2 || tbRect.top >= selTop);
    const rowSelected = Boolean(document.querySelector('[data-testid="layers-panel"] .layerRow.selected'));
    document.querySelector('[data-testid="tab-design"]')?.click();
    await wait(150);
    const x = document.querySelector('[data-testid="inspector"] input[aria-label="X"]');
    const hasSize = Boolean(document.querySelector('[data-testid="inspector"] input[aria-label="Size"]'));
    if (!x) return { ok: false, why: "no X field", orderOk, ctxKind };
    x.focus(); await wait(30);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(x, "123");
    x.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(30);
    x.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); // React onBlur; blur() is a no-op in an unfocused window
    await wait(150);
    const leftAfter = Math.round(tb.left);
    const undoEnabled = !document.querySelector('.edTop [title="Undo"]').disabled;

    const img = c.getObjects().find((o) => typeof o.get("src") === "string");
    c.setActiveObject(img); c.requestRenderAll();
    await wait(150);
    const imgCtx = document.querySelector('[data-testid="ctx-toolbar"]')?.dataset.kind ?? null;
    document.querySelector('[data-testid="ctx-edit-ai"]')?.click();
    await wait(150);
    const aiTab = document.querySelector('[data-testid="tab-ai"]')?.getAttribute("aria-selected");
    const prompt = document.querySelector('textarea[aria-label="AI edit request"]')?.value ?? "";
    c.setActiveObject(tb); c.requestRenderAll(); // leave a text layer selected for the capture
    const ok = orderOk && ctxKind === "text" && ctxPlaced && rowSelected && hasSize && leftAfter === 123 && undoEnabled
      && imgCtx === "image" && aiTab === "true" && prompt.includes("@(selected");
    return { ok, rows: rows.length, orderOk, ctxKind, ctxPlaced, rowSelected, hasSize, leftAfter, undoEnabled, imgCtx, aiTab, prompt: prompt.slice(0, 60) };
  })()`, true);
  console.log("[shot] R4/R5 verify:", JSON.stringify(r45));
  if (!r45 || !r45.ok) {
    console.error("DESKTOP_SHOT R4/R5 FAILED, layers order, toolbar, inspector commit or Edit with AI");
    app.exit(23);
    return;
  }
  await snap(win, "desktop-layers.png");

  // ---- SG-9 (surgepix-parity-todo.md): one-click Remove background on the
  // selected image layer, BOTH branches in one run. The stateful PATH fake fails
  // the first call (the layer must survive byte-identical, honest notice) and
  // answers the second with a cutout (the layer src must swap). A machine with
  // REAL rembg still passes: the fake sits earlier on PATH only in shot mode.
  const rbg = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const c = (window).__oiaCanvas;
    const img = c.getObjects().find((o) => typeof o.get("src") === "string");
    if (!img) return { ok: false, why: "no image layer" };
    c.setActiveObject(img); c.requestRenderAll();
    await wait(150);
    const btn = document.querySelector('[data-testid="ctx-remove-bg"]');
    if (!btn) return { ok: false, why: "no remove-bg button" };
    const runOnce = async (tag) => {
      // fabric 7 setSrc swaps the ELEMENT, the src property stays stale; getSrc()
      // is the truth toObject serializes, so it is the truth for this gate too
      const srcOf = (o) => String(o.getSrc ? o.getSrc() : o.get("src"));
      const before = srcOf(img);
      document.querySelector('.notice [aria-label="Dismiss notice"]')?.click(); // a stale notice would fake a terminal state
      await wait(50);
      btn.click();
      for (let i = 0; i < 90; i++) {
        await wait(1000);
        const notice = document.querySelector('.notice[role=status]')?.textContent ?? "";
        if (notice && !notice.includes("Removing the background")) {
          const changed = srcOf(img) !== before;
          return { tag, notice: notice.slice(0, 140), changed };
        }
      }
      return { tag, notice: "(no terminal notice within 90s)", changed: srcOf(img) !== before };
    };
    const first = await runOnce("first");
    const second = await runOnce("second");
    const errorKeptLayer = !first.changed && !/Background removed/.test(first.notice);
    const successSwapped = second.changed && /Background removed/.test(second.notice);
    return { ok: errorKeptLayer && successSwapped, first, second, errorKeptLayer, successSwapped };
  })()`, true).catch((e) => ({ ok: false, why: String(e) }));
  console.log("[shot] remove-bg verify:", JSON.stringify(rbg));
  if (!rbg || !rbg.ok) {
    console.error("DESKTOP_SHOT REMOVE-BG VERIFY FAILED (failure must keep the layer, success must swap it)");
    app.exit(24);
    return;
  }

  // ---- SG-8: non-destructive Crop on the selected image. Pin the full loop:
  //  button → marquee+shades on canvas (never in scene JSON) → shrink → apply →
  //  clipPath on the layer AND in serialized scene → undo removes it → cancel
  //  path leaves the layer untouched. "Khôi phục và export sau crop" also needs
  //  the roundtrip: reload the serialized scene and check the clip survived.
  const crop = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const c = (window).__oiaCanvas;
    const img = c.getObjects().find((o) => typeof o.get("src") === "string");
    if (!img) return { ok: false, why: "no image layer" };
    const countBefore = c.getObjects().length;
    const clipBefore = Boolean(img.get("clipPath"));
    c.setActiveObject(img); c.requestRenderAll();
    await wait(150);
    document.querySelector('[data-testid="ctx-crop"]')?.click();
    await wait(300);
    const marqueeVisible = c.getObjects().length === countBefore + 5; // marquee + 4 shades
    const dialog = Boolean(document.querySelector('[data-testid="crop-apply"]'));
    if (!marqueeVisible || !dialog) return { ok: false, why: "no marquee/dialog", marqueeVisible, dialog };
    // shrink the marquee to the top-left quarter, the clamp must keep it inside
    const marquee = c.getObjects()[c.getObjects().length - 1];
    const b = img.getBoundingRect();
    marquee.set({ left: b.left, top: b.top, width: b.width / 2, height: b.height / 2, scaleX: 1, scaleY: 1 });
    marquee.setCoords();
    document.querySelector('[data-testid="crop-apply"]')?.click();
    await wait(300);
    const clipApplied = Boolean(img.get("clipPath"));
    const helpersGone = c.getObjects().length === countBefore;
    const sceneJson = JSON.stringify(c.toObject());
    const serialized = sceneJson.includes('"clipPath"');
    // reload the SERIALIZED scene onto a throwaway canvas: the clip must survive
    // (bare 'fabric' is not importable from the page; reuse the live class)
    const rc = new (Object.getPrototypeOf(c).constructor)(document.createElement("canvas"), { renderOnAddRemove: false });
    await rc.loadFromJSON(c.toObject());
    const reloadedClip = Boolean(rc.getObjects().find((o) => o.get("clipPath")));
    await rc.dispose();
    const rendered = await new Promise((res) => { try { c.toDataURL({ format: "png" }); res(true); } catch { res(false); } });
    // undo removes the clip (non-destructive claim). Re-find the image AFTER
    // undo: history restores the scene as NEW object instances, the closure
    // reference would keep testing a dead object.
    document.querySelector('.edTop [title="Undo"]')?.click();
    await wait(400);
    const img2 = c.getObjects().find((o) => typeof o.get("src") === "string");
    const undoCleared = Boolean(img2) && !img2.get("clipPath");
    // cancel path: start again, cancel, layer untouched
    if (img2) { c.setActiveObject(img2); c.requestRenderAll(); }
    await wait(150);
    document.querySelector('[data-testid="ctx-crop"]')?.click(); await wait(250);
    document.querySelector('[data-testid="crop-cancel"]')?.click(); await wait(250);
    const img3 = c.getObjects().find((o) => typeof o.get("src") === "string");
    const cancelClean = Boolean(img3) && !img3.get("clipPath") && c.getObjects().length === countBefore;
    const ok = clipApplied && helpersGone && serialized && reloadedClip && rendered && undoCleared && cancelClean;
    return { ok, clipApplied, helpersGone, serialized, reloadedClip, rendered, undoCleared, cancelClean, clipBefore };
  })()`, true).catch((e) => ({ ok: false, why: String(e) }));
  console.log("[shot] crop verify:", JSON.stringify(crop));
  if (!crop || !crop.ok) {
    console.error("DESKTOP_SHOT CROP VERIFY FAILED (clip + serialize + reload + undo + cancel)");
    app.exit(25);
    return;
  }
  await win.webContents.executeJavaScript(`(() => { const c = (window).__oiaCanvas; c?.discardActiveObject(); c?.requestRenderAll(); })()`, true);
  // leave the editor for the Tools scenario
  await win.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-testid="editor-root"] .edTop .iconBtn')?.click();
    return true;
  })()`, true);
  await new Promise((r) => setTimeout(r, 800));

  // ---- reorg 4c: Tools view, grid + one real runner ----------------------------
  // Entered via the R6 Skills ▾ click-through (Home → Skills → item): the menu item
  // must land on THAT tool, not just the library, then back out to the grid for the
  // list gate below.
  console.log("[shot] opening Tools via the composer Skills menu…");
  const skillNav = await win.webContents.executeJavaScript(`(async () => {
    document.querySelector('.viewNav .navPill')?.click(); // Home is the first nav pill
    await new Promise((r) => setTimeout(r, 400));
    document.querySelector('.skillsWrap [aria-haspopup="menu"]')?.click();
    await new Promise((r) => setTimeout(r, 120));
    const first = [...document.querySelectorAll(".skillsMenu [role=menuitem]")].find((b) => !b.textContent.includes("All tools"));
    const label = first?.querySelector("strong")?.textContent ?? null;
    first?.click();
    await new Promise((r) => setTimeout(r, 500));
    const h1 = document.querySelector('[data-testid="tools-view"] h1')?.textContent ?? null;
    const back = document.querySelector('[data-testid="tools-view"] .ghostBtn');
    back?.click(); // "← All tools", return to the grid for the list gate
    await new Promise((r) => setTimeout(r, 400));
    return { label, openedTool: label && h1 === label, gridBack: Boolean(document.querySelector(".toolGrid")) };
  })()`, true);
  console.log("[shot] R6 skills nav:", JSON.stringify(skillNav));
  if (!skillNav || !skillNav.openedTool || !skillNav.gridBack) {
    console.error("DESKTOP_SHOT R6 SKILLS NAV FAILED, a Skills item did not open its tool");
    app.exit(23);
    return;
  }
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
    const dropzone = document.querySelector('.toolRunner [data-testid="file-dropzone"].empty');
    const dropzonePainted = Boolean(dropzone) && dropzone.getBoundingClientRect().height >= 120;
    const actionWaitsForFile = document.querySelector(".toolRunner .primaryBtn")?.disabled === true;
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
    return { ok: runner && fileInput && actionBtn && dropzonePainted && actionWaitsForFile && !err, runner, fileInput, actionBtn, dropzonePainted, actionWaitsForFile, err };
  })()`, true).catch((e) => ({ ok: false, why: String(e) }));
  console.log("[shot] tools runner verify:", JSON.stringify(toolsVerify));
  if (!toolOpened || !toolsVerify || !toolsVerify.ok) {
    console.error("DESKTOP_SHOT TOOLS VERIFY FAILED (runner)");
    app.exit(9);
    return;
  }
  await snap(win, "desktop-tools.png");

  // the picked file becomes a preview card with real decoded pixels, and unlocks the action
  const toolsPicked = await win.webContents.executeJavaScript(`(async () => {
    const input = document.querySelector(".toolRunner input[type=file]");
    const bytes = Uint8Array.from(atob("${fixturePngB64()}"), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "product-shot.png", { type: "image/png" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 20; i++) {
      const img = document.querySelector('.toolRunner [data-testid="file-dropzone"].filled img');
      if (img && img.complete && img.naturalWidth > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const img = document.querySelector('.toolRunner [data-testid="file-dropzone"].filled img');
    const name = document.querySelector(".toolRunner .fileName")?.textContent;
    const enabled = document.querySelector(".toolRunner .primaryBtn")?.disabled === false;
    const decoded = Boolean(img && img.naturalWidth > 0);
    return { ok: decoded && name === "product-shot.png" && enabled, decoded, name, enabled };
  })()`, true).catch((e) => ({ ok: false, why: String(e) }));
  console.log("[shot] tools file picked verify:", JSON.stringify(toolsPicked));
  if (!toolsPicked || !toolsPicked.ok) {
    console.error("DESKTOP_SHOT TOOLS VERIFY FAILED (file picker)");
    app.exit(9);
    return;
  }
  await snap(win, "desktop-tools-picked.png");

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
  // React re-renders asynchronously, POLL for the enabled button instead of racing it
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
    console.error("DESKTOP_SHOT TOOL AI VERIFY FAILED", JSON.stringify({ aiOpened, bannerCard, prompted, genClicked, aiDone }));
    app.exit(12);
    return;
  }
  await snap(win, "desktop-tools-ai.png");

  // ---- SG-7 (surgepix-parity-todo.md): PPT Translator end-to-end through the
  // REAL runner + task lane (mock pair): pick a deck, translate, save. The error
  // path feeds a non-zip named .pptx: a clear alert, no crash, no saved file.
  console.log("[shot] running the PPT Translator (mock pair)…");
  const pptB64 = await fixturePptxB64();
  await win.webContents.executeJavaScript(`(() => {
    const back = [...document.querySelectorAll(".ghostBtn")].find((b) => b.textContent.includes("All tools"));
    back?.click();
    return true;
  })()`, true);
  await new Promise((r) => setTimeout(r, 500));
  const pptCard = await win.webContents.executeJavaScript(`(() => {
    const card = [...document.querySelectorAll(".toolCard")].find((c) => c.textContent.includes("PPT Translator"));
    if (!card) return false;
    card.click();
    return true;
  })()`, true);
  await new Promise((r) => setTimeout(r, 500));
  const pptPicked = await win.webContents.executeJavaScript(`(async () => {
    const input = document.querySelector(".toolRunner input[type=file]");
    if (!input) return { ok: false, why: "no file input" };
    const bytes = Uint8Array.from(atob("${pptB64}"), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "sale-deck.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 20; i++) {
      const name = document.querySelector(".toolRunner .fileName")?.textContent;
      if (name === "sale-deck.pptx") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const run = document.querySelector('[data-testid="ppt-translate-run"]');
    return { ok: Boolean(run) && run.disabled === false, name: document.querySelector(".toolRunner .fileName")?.textContent };
  })()`, true).catch((e) => ({ ok: false, why: String(e) }));
  console.log("[shot] ppt file picked verify:", JSON.stringify(pptPicked));
  let pptRun = false;
  for (let i = 0; i < 10 && !pptRun; i++) {
    pptRun = await win.webContents.executeJavaScript(`(() => {
      const btn = document.querySelector('[data-testid="ppt-translate-run"]');
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    })()`, true).catch(() => false);
    if (!pptRun) await new Promise((r) => setTimeout(r, 300));
  }
  let pptDone = false;
  let pptVerify: unknown = null;
  for (let i = 0; i < 60 && !pptDone; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    pptVerify = await win.webContents.executeJavaScript(`(() => {
      const saved = [...document.querySelectorAll('[role=status]')].map((n) => n.textContent).join(" ");
      const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
      const busy = document.querySelector('.toolRunner [role=status]')?.textContent ?? "";
      if (saved.includes(".pptx") || err) return { done: true, saved: saved.slice(0, 120), err: err.slice(0, 160) };
      return { done: false, busy: busy.slice(0, 60) };
    })()`, true).catch(() => null);
    pptDone = Boolean(pptVerify && (pptVerify as { done?: boolean }).done);
  }
  const pptOk = Boolean(pptVerify && (pptVerify as { saved?: string }).saved?.includes(".pptx") && !(pptVerify as { err?: string }).err);
  console.log("[shot] ppt translator verify:", JSON.stringify(pptVerify));
  if (!pptCard || !pptPicked?.ok || !pptRun || !pptOk) {
    console.error("DESKTOP_SHOT PPT TRANSLATOR VERIFY FAILED", JSON.stringify({ pptCard, pptPicked, pptRun, pptVerify }));
    app.exit(21);
    return;
  }
  await snap(win, "desktop-tools-ppt.png");

  // SG-7 error path: a non-zip named .pptx must produce a clear alert, no crash.
  const pptBroken = await win.webContents.executeJavaScript(`(async () => {
    const back = [...document.querySelectorAll(".ghostBtn")].find((b) => b.textContent.includes("All tools"));
    back?.click();
    return true;
  })()`, true);
  await new Promise((r) => setTimeout(r, 400));
  await win.webContents.executeJavaScript(`(() => {
    const card = [...document.querySelectorAll(".toolCard")].find((c) => c.textContent.includes("PPT Translator"));
    card?.click();
    return true;
  })()`, true);
  await new Promise((r) => setTimeout(r, 400));
  await win.webContents.executeJavaScript(`(() => {
    const input = document.querySelector(".toolRunner input[type=file]");
    const bytes = Uint8Array.from(atob("${brokenPptxB64()}"), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "broken.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`, true);
  let brokenRun = false;
  for (let i = 0; i < 10 && !brokenRun; i++) {
    brokenRun = await win.webContents.executeJavaScript(`(() => {
      const btn = document.querySelector('[data-testid="ppt-translate-run"]');
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    })()`, true).catch(() => false);
    if (!brokenRun) await new Promise((r) => setTimeout(r, 300));
  }
  let brokenDone = false;
  let brokenVerify: unknown = null;
  for (let i = 0; i < 30 && !brokenDone; i++) {
    await new Promise((r) => setTimeout(r, 500));
    brokenVerify = await win.webContents.executeJavaScript(`(() => {
      const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
      const busy = document.querySelector('.toolRunner [role=status]')?.textContent ?? "";
      const saved = [...document.querySelectorAll('[role=status]')].map((n) => n.textContent).join(" ");
      if (err) return { done: true, err: err.slice(0, 160) };
      if (!busy) return { done: true, err: "" };
      return { done: false };
    })()`, true).catch(() => null);
    brokenDone = Boolean(brokenVerify && (brokenVerify as { done?: boolean }).done);
  }
  const brokenOk = Boolean(brokenVerify && (brokenVerify as { err?: string }).err?.includes("not a valid .pptx"));
  console.log("[shot] ppt broken-file verify:", JSON.stringify({ pptBroken, brokenRun, brokenVerify }));
  if (!pptBroken || !brokenRun || !brokenOk) {
    console.error("DESKTOP_SHOT PPT BROKEN-FILE VERIFY FAILED");
    app.exit(22);
    return;
  }

  // ---- reorg 4d: Brand kit panel, kit form over the real store -----------------
  console.log("[shot] opening Brand kit…");
  await win.webContents.executeJavaScript(`(() => {
    const pills = [...document.querySelectorAll(".viewNav .navPill")];
    pills.find((p) => p.textContent.trim() === "Brand kits")?.click();
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

  // ---- reorg 4d: For Agents, keys form + live loopback base URL ----------------
  console.log("[shot] opening For agents…");
  await win.webContents.executeJavaScript(`(() => {
    const pills = [...document.querySelectorAll(".viewNav .navPill")];
    pills.find((p) => p.textContent.trim() === "Settings")?.click();
    return true;
  })()`, true);
  // UI v1.1 R1: For agents is a Settings section now
  for (let i = 0; i < 20 && !(await win.webContents.executeJavaScript(`Boolean(document.querySelector(".settingsTab"))`, true)); i++) await new Promise((r) => setTimeout(r, 150));
  await win.webContents.executeJavaScript(`(() => {
    [...document.querySelectorAll(".settingsTab")].find((t) => t.textContent.trim() === "For agents")?.click();
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
    // UI v1.1 R1: For agents lives inside Settings, and the sidebar status card replaces
    // the runtime panel that used to sit on the Home hero
    const inSettings = Boolean(document.querySelector(".settingsView .agentsView"));
    const statusCard = Boolean(document.querySelector(".appSidebar .statusCard"));
    const ok = form && baseUrl.startsWith("http://127.0.0.1:") && baseUrl.endsWith("/api") && Number.isInteger(Number(portStr)) && (keysTable || emptyKeys) && inSettings && statusCard && !err;
    return { ok, form, baseUrl, keysTable, emptyKeys, inSettings, statusCard, err };
  })()`, true).catch((e) => ({ ok: false, why: String(e) }));
  console.log("[shot] agents verify:", JSON.stringify(agentsVerify));
  if (!agentsVerify || !agentsVerify.ok) {
    console.error("DESKTOP_SHOT AGENTS VERIFY FAILED");
    app.exit(11);
    return;
  }
  // Clipboard e2e gate: the renderer's navigator.clipboard is DENIED by the F2
  // permission handler, Copy must ride the main-side bridge and confirm visibly.
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
    // macOS clamps windows to the screen, when the page is taller than the CSS viewport,
    // zoom out so the WHOLE page (result card + gallery below the fold) fits one capture.
    // NOTE: getContentSize() is DEVICE px; scrollHeight is CSS px, compare in CSS px only.
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
  // F2: explicit View submenu, role:"viewMenu" shipped Toggle Developer Tools
  // + Reload to sellers. Dev builds (unpackaged) keep reload/devtools for development.
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate(process.platform === "darwin", !app.isPackaged)));
}

/**
 * F1: ONE app instance, ever. Without the lock, a second launch forked a second
 * utility process against the SAME userData: the atomic-write queue is per-process,
 * so two writers saved over each other (last-writer-wins data loss), and two loopback
 * servers fought over one discovery file + one quota guard.
 *
 * EVERY test mode sandboxes its userData in a fresh temp dir (found the hard way:
 * smoke/shot runs against the real userData seeded the owner's Workspace with
 * dozens of "banner smoke"/"New banner" junk projects). The SI smoke isolates too,
 * it never races a real running instance on a dev machine.
 *
 * SG-2: an explicit OIA_USER_DATA_DIR override wins over the test-mode sandbox
 * and is honored in PACKAGED builds too, so a scripted packaged smoke never
 * touches the seller's real profile (the 2026-11 boot accident let asset GC run
 * on the real profile). A bad value (relative, the default dir, unwritable)
 * fails FAST: silently falling back to the default profile would be exactly the
 * accident this exists to prevent.
 */
const userDataOverride = applyUserDataOverride();
if ("error" in userDataOverride) {
  console.error(`[user-data] refusing to start: ${userDataOverride.error}`);
  // showErrorBox runs a NATIVE MODAL loop before ready: in a scripted run nobody
  // dismisses it, app.exit(66) below never executes and the process hangs until
  // the harness kills it. Interactive launches keep the dialog, scripted modes
  // (any smoke mode, packaged-smoke included) get the log line + fast exit only.
  if (!smokeModeFromEnv(process.env, app.isPackaged)) {
    dialog.showErrorBox("Oia cannot start", `${userDataOverride.error}\n\nFix or unset OIA_USER_DATA_DIR, then start Oia again.`);
  }
  app.exit(66);
} else {
if (userDataOverride.dir) {
  app.setPath("userData", userDataOverride.dir);
} else if (smokeModeFromEnv(process.env, app.isPackaged)) {
  app.setPath("userData", mkdtempSync(path.join(tmpdir(), "oia-testmode-")));
}
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  // Marker line asserted by the SI smoke gate (and useful in bug reports).
  console.log("[single-instance] another Oia owns this userData, focusing it and exiting");
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
  // F2: the app loads ONLY local content; no permission has a legitimate
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
  if (mode === "packaged-smoke") {
    await packagedSmoke().catch((err) => {
      console.error("DESKTOP_PACKAGED_SMOKE CRASHED:", err);
      app.exit(1);
    });
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
  if (mode === "shot-busy") {
    await runShotBusy({ registerAssetProtocol, createWindow }).catch((err) => {
      console.error("[shot-busy] FAILED:", err);
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
  // TP-D5 / bug-repro #3: order (cancel settles BEFORE the kill) and the 3s
  // bound are pinned by test/shutdown-sequence.test.ts through this seam.
  void shutdownSequence({
    cancelAll: () => utility.call({ cmd: "cancelAll" }),
    kill: () => utility.kill(),
    exit: () => app.exit(0),
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
}
}

/** SG-2: validate OIA_USER_DATA_DIR (pure rules live in releaseGate) and PROBE
 *  it with a real write before the app commits: a dir that cannot hold a file
 *  must fail here, not half-way through boot on the first store save. */
function applyUserDataOverride(): { ok: true; dir: string | null } | { ok: false; error: string } {
  const raw = process.env.OIA_USER_DATA_DIR?.trim();
  if (!raw) return { ok: true, dir: null };
  const resolved = resolveUserDataOverride(process.env, app.getPath("userData"));
  if ("error" in resolved) return { ok: false, error: resolved.error };
  try {
    mkdirSync(resolved.dir, { recursive: true });
    const probe = path.join(resolved.dir, ".oia-write-probe");
    writeFileSync(probe, "probe");
    rmSync(probe);
  } catch (err) {
    return { ok: false, error: `OIA_USER_DATA_DIR "${resolved.dir}" is not writable: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { ok: true, dir: resolved.dir };
}

/**
 * F1 gate, the single-instance lock, end to end with a REAL second process:
 * spawn this same app (env flags stripped, same userData); it must hit the lock,
 * print the secondary marker and exit quickly instead of booting a second
 * utility process. Old behavior: the child fully started, two writers on the
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
  // The lock is keyed on the user data dir, the child MUST contend for the SAME
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
