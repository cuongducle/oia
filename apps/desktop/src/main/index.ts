import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServiceContext, runChat, cancelJob, providerStatusSnapshot, type ServiceContext } from "@oia/services";
import { IPC, chatRequestSchema, chatCancelSchema, projectsCreateSchema, projectsGetSchema } from "../shared/ipc.js";

/**
 * TP-D1 (D2) — the Electron main process. Owns windows and the typed IPC surface over
 * @oia/services (the SAME orchestration the web SSE adapter calls). Storage lives under
 * app.getPath("userData") — never the cwd (research rule). Providers come from the
 * machine env exactly like the web shell (mock pair by default → D2 runs keyless).
 */
const here = path.dirname(fileURLToPath(import.meta.url));

let ctx: ServiceContext | null = null;
async function ensureCtx(): Promise<ServiceContext> {
  ctx ??= await createServiceContext({ dataDir: path.join(app.getPath("userData"), "data") });
  return ctx;
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Oia",
    webPreferences: {
      preload: path.join(here, "../preload/index.js"),
      contextIsolation: true, // Q7: explicit channels only; no nodeIntegration in the renderer
      nodeIntegration: false,
      sandbox: false, // preload needs require("electron") for the bridge
    },
  });
  // dev server (electron-vite dev) or the built bundle
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(here, "../renderer/index.html"));
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.chatRun, async (event, raw: unknown) => {
    const req = chatRequestSchema.parse(raw);
    const c = await ensureCtx();
    return runChat(req, c, { sink: (ev) => event.sender.send(IPC.chatEvent, ev) });
  });
  ipcMain.handle(IPC.chatCancel, (_e, raw: unknown) => cancelJob(chatCancelSchema.parse(raw).jobId));
  ipcMain.handle(IPC.providerStatus, async () => providerStatusSnapshot(await ensureCtx()));
  ipcMain.handle(IPC.projectsCreate, async (_e, raw: unknown) => {
    const { name, scene } = projectsCreateSchema.parse(raw);
    return (await ensureCtx()).projects.create({ name, scene });
  });
  ipcMain.handle(IPC.projectsGet, async (_e, raw: unknown) => {
    const { id } = projectsGetSchema.parse(raw);
    return (await ensureCtx()).projects.get(id) ?? null;
  });
}

/** Scripted end-to-end check without a human at the window: mock pair → runChat → quit. */
async function smoke(): Promise<void> {
  const c = await ensureCtx();
  const events: unknown[] = [];
  const { outcome } = await runChat({ prompt: "banner smoke trà sữa giảm 20%" }, c, {
    sink: (ev) => { events.push(ev); },
  });
  const text = JSON.stringify(events);
  const ok =
    outcome === "completed" &&
    !text.includes("data:image") && // A1: assetization on this wire too
    text.includes("/api/files/") &&
    text.includes("</Content>");
  console.log(`DESKTOP_SMOKE ${ok ? "OK" : "FAILED"} outcome=${outcome} events=${events.length}`);
  app.exit(ok ? 0 : 1);
  return;
}

app.whenReady().then(async () => {
  registerIpc();
  if (process.env.OIA_DESKTOP_SMOKE === "1") {
    await smoke();
    return;
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
