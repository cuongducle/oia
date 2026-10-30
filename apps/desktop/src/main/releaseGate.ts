import type { MenuItemConstructorOptions } from "electron";

/**
 * F2 — what a RELEASE build may do, decided in pure functions so the gates can
 * pin it without booting Electron.
 *
 * Two holes the readiness review caught in the shipped shell:
 * 1. `{ role: "viewMenu" }` silently shipped Toggle Developer Tools + Reload to
 *    sellers (the comment next to it claimed the opposite).
 * 2. every OIA_DESKTOP_* smoke mode was one env var away in release builds —
 *    including REAL_SMOKE, which bills real quota.
 */

export type SmokeMode = "smoke" | "crash" | "real" | "shot" | "si";

/**
 * Smoke/test modes are DEV-BUILD ONLY. CI runs the unpackaged `electron .`, so
 * the gates keep working; a packaged app can never be talked into a test mode
 * (some spawn child processes or burn real provider quota).
 */
export function smokeModeFromEnv(env: NodeJS.ProcessEnv, isPackaged: boolean): SmokeMode | null {
  if (isPackaged) return null;
  if (env.OIA_DESKTOP_SI_SMOKE === "1") return "si";
  if (env.OIA_DESKTOP_SMOKE === "1") return "smoke";
  if (env.OIA_DESKTOP_CRASH_SMOKE === "1") return "crash";
  if (env.OIA_DESKTOP_REAL_SMOKE === "1") return "real";
  if (env.OIA_DESKTOP_SHOT === "1") return "shot";
  return null;
}

/**
 * Explicit View submenu — NEVER role:"viewMenu" (it drags in Reload + Toggle
 * Developer Tools). Dev builds additionally get reload + devtools.
 */
export function appMenuTemplate(isMac: boolean, devTools: boolean): MenuItemConstructorOptions[] {
  const view: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { role: "zoomIn" },
      { role: "zoomOut" },
      { role: "resetZoom" },
      ...(devTools ? [{ role: "reload" as const }, { role: "toggleDevTools" as const }] : []),
    ],
  };
  return [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    { role: "editMenu" as const },
    view,
    { label: "Window", submenu: [{ role: "minimize" as const }, { role: "close" as const }] },
  ];
}
