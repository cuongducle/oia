import { ipcMain, shell } from "electron";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { RuntimeProvisioner, type RuntimeStatus } from "@oia/providers";
import { IPC } from "../shared/channels.js";
import { runtimeSetModeSchema, type RuntimeModeChoice } from "../shared/ipc.js";
import type { RuntimeEvent, RuntimeSnapshot } from "../shared/bridge.js";
import { resolveEffectiveMode } from "../shared/providers-mode.js";

/**
 * TP-D3 — the runtime controller, extracted from main/index.ts (the god-file smell):
 * owns settings.json (provider choice + codex consent), the provisioner singleton,
 * the runtime:* IPC surface, and the abort controller for cancelable install/login.
 * The context rebuild stays in index.ts and is injected as a hook.
 */

export interface DesktopSettings {
  providers: RuntimeModeChoice;
  /** Set the first time the user completes a guided install / in-app login / picks Codex. */
  codexConsent: boolean;
}

export interface RuntimeControllerDeps {
  /** Rebuild the service context when the effective mode may have changed. */
  rebuildContext: () => Promise<void>;
  /** What the CURRENT context actually runs (null before the first build). */
  currentEffective: () => "mock" | "codex" | null;
}

let provisioner: RuntimeProvisioner | null = null;
let activeAbort: AbortController | null = null;
let userDataDir = "";

/** Must be called once after app ready, before any other export here. */
export function initRuntimeController(dir: string): void {
  userDataDir = dir;
}

function settingsFile(): string {
  return path.join(userDataDir, "settings.json");
}

export async function readSettings(): Promise<DesktopSettings> {
  try {
    const raw = JSON.parse(await readFile(settingsFile(), "utf8")) as Partial<DesktopSettings>;
    const providers = raw.providers === "mock" || raw.providers === "codex" || raw.providers === "auto" ? raw.providers : "auto";
    return { providers, codexConsent: raw.codexConsent === true };
  } catch {
    return { providers: "auto", codexConsent: false };
  }
}

async function writeSettings(s: DesktopSettings): Promise<void> {
  const file = settingsFile();
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 2), "utf8");
  await rename(tmp, file); // atomic — a crash never truncates the choice
}

/** Consent is sticky: one explicit runtime action is enough, it is never auto-granted. */
async function markConsent(): Promise<void> {
  const s = await readSettings();
  if (!s.codexConsent) await writeSettings({ ...s, codexConsent: true });
}

export function getProvisioner(): RuntimeProvisioner {
  provisioner ??= new RuntimeProvisioner({ managedDir: path.join(userDataDir, "codex") });
  return provisioner;
}

export async function effectiveMode(): Promise<"mock" | "codex"> {
  const settings = await readSettings();
  // effective mode needs no subprocess when the choice is explicit or CI-pinned
  if (settings.providers !== "auto") {
    const pinned = resolveEffectiveMode({ choice: settings.providers, consent: settings.codexConsent, runtimeState: null, env: process.env });
    if (pinned !== "mock" || settings.providers === "mock") return pinned;
  }
  const runtime = await getProvisioner().status();
  return resolveEffectiveMode({ choice: settings.providers, consent: settings.codexConsent, runtimeState: runtime.state, env: process.env });
}

export async function runtimeSnapshotFor(current: "mock" | "codex" | null): Promise<RuntimeSnapshot> {
  const settings = await readSettings();
  const runtime = await getProvisioner().status();
  return {
    runtime,
    providersMode: settings.providers,
    effective: current ?? resolveEffectiveMode({ choice: settings.providers, consent: settings.codexConsent, runtimeState: runtime.state, env: process.env }),
  };
}

/** Friendly, localized-name rejections: ProviderErrors cross IPC as their errorClass. */
function ipcRuntimeError(err: unknown): never {
  const errAny = err as { name?: string; errorClass?: string; issues?: unknown };
  if (errAny && typeof errAny === "object" && errAny.name === "ProviderError" && typeof errAny.errorClass === "string") {
    const e = new Error(errAny.errorClass) as Error & { name: string };
    e.name = "RuntimeProviderError";
    throw e;
  }
  if (errAny && typeof errAny === "object" && Array.isArray(errAny.issues)) {
    const e = new Error("invalid-request") as Error & { name: string };
    e.name = "IpcValidationError";
    throw e;
  }
  throw err;
}

export function registerRuntimeIpc(deps: RuntimeControllerDeps): void {
  const rebuildIfAuto = async (): Promise<void> => {
    const settings = await readSettings();
    if (settings.providers !== "auto") {
      await deps.rebuildContext(); // explicit choice: always honor it immediately
      return;
    }
    const mode = await effectiveMode();
    if (deps.currentEffective() !== mode) await deps.rebuildContext();
  };

  ipcMain.handle(IPC.runtimeStatus, async () => runtimeSnapshotFor(deps.currentEffective()).catch(ipcRuntimeError));

  ipcMain.handle(IPC.runtimeInstall, async (event) => {
    try {
      activeAbort = new AbortController();
      const { status } = await getProvisioner().install(
        (p) => event.sender.send(IPC.runtimeEvent, { type: "install", phase: p.phase, pct: p.pct, detail: p.detail }),
        { signal: activeAbort.signal },
      );
      await markConsent();
      await rebuildIfAuto();
      return { runtime: status };
    } catch (err) {
      ipcRuntimeError(err);
    } finally {
      activeAbort = null;
    }
  });

  ipcMain.handle(IPC.runtimeLogin, async (event) => {
    try {
      activeAbort = new AbortController();
      const { ok, status } = await getProvisioner().login(
        {
          onAuthUrl: (url) => {
            // origin-checked in the provisioner; openExternal as the reliable fallback
            void shell.openExternal(url).catch(() => {});
            event.sender.send(IPC.runtimeEvent, { type: "login-url", url });
          },
          onPhase: (phase, detail) => event.sender.send(IPC.runtimeEvent, { type: "login-phase", phase, detail }),
        },
        { signal: activeAbort.signal },
      );
      if (ok) await markConsent();
      await rebuildIfAuto();
      return { ok, runtime: status };
    } catch (err) {
      ipcRuntimeError(err);
    } finally {
      activeAbort = null;
    }
  });

  ipcMain.handle(IPC.runtimeLogout, async () => {
    try {
      const status: RuntimeStatus = await getProvisioner().logout();
      await rebuildIfAuto();
      return { runtime: status };
    } catch (err) {
      ipcRuntimeError(err);
    }
  });

  ipcMain.handle(IPC.runtimeCancel, () => {
    const cancelled = activeAbort !== null;
    activeAbort?.abort("user-cancelled");
    return cancelled;
  });

  ipcMain.handle(IPC.runtimeSetMode, async (_e, raw: unknown) => {
    try {
      const { mode } = runtimeSetModeSchema.parse(raw);
      const settings = await readSettings();
      await writeSettings({ providers: mode, codexConsent: settings.codexConsent || mode === "codex" });
      await deps.rebuildContext();
      return await runtimeSnapshotFor(deps.currentEffective());
    } catch (err) {
      ipcRuntimeError(err);
    }
  });
}
