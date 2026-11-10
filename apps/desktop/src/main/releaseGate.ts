import type { MenuItemConstructorOptions } from "electron";
import path from "node:path";

/**
 * F2: what a RELEASE build may do, decided in pure functions so the gates can
 * pin it without booting Electron.
 *
 * Two holes the readiness review caught in the shipped shell:
 * 1. `{ role: "viewMenu" }` silently shipped Toggle Developer Tools + Reload to
 *    sellers (the comment next to it claimed the opposite).
 * 2. every OIA_DESKTOP_* smoke mode was one env var away in release builds,
 *    including REAL_SMOKE, which bills real quota.
 */

export type SmokeMode = "smoke" | "crash" | "real" | "shot" | "shot-busy" | "si" | "packaged-smoke";

/** SG-2 (surgepix-parity-todo.md): an EXPLICIT userData override the packaged
 *  app honors too, so scripted smoke can run a real release build without ever
 *  touching the seller's profile (the 2026-11 boot accident let asset GC loose
 *  on the real profile). Pure validation; main performs the fs probe.
 *  Rules: absolute paths only, never the default dir or inside it (that IS the
 *  real profile), never empty. */
export function resolveUserDataOverride(
  env: NodeJS.ProcessEnv,
  defaultDir: string,
): { dir: string } | { error: string } {
  const raw = env.OIA_USER_DATA_DIR?.trim();
  if (!raw) return { error: "OIA_USER_DATA_DIR is empty" };
  if (!path.isAbsolute(raw)) {
    return { error: `OIA_USER_DATA_DIR must be an absolute path, got "${raw}"` };
  }
  const resolved = path.resolve(raw);
  const def = path.resolve(defaultDir);
  if (resolved === def) {
    return { error: "OIA_USER_DATA_DIR points at the default profile dir, refusing to run tests against it" };
  }
  if (resolved.startsWith(def + path.sep)) {
    return { error: "OIA_USER_DATA_DIR is inside the default profile dir, refusing to run tests against it" };
  }
  return { dir: resolved };
}

/**
 * Smoke/test modes are DEV-BUILD ONLY, with ONE carve-out: packaged-smoke, the
 * SG-2 scripted release-build check. It may run packaged, but ONLY with BOTH
 * the explicit flag AND a valid OIA_USER_DATA_DIR override, so it can never
 * touch a real profile, and it forces the mock pair (the OIA_DESKTOP_ prefix
 * default-deny in resolveEffectiveMode), so it can never bill quota.
 */
export function smokeModeFromEnv(env: NodeJS.ProcessEnv, isPackaged: boolean): SmokeMode | null {
  const packagedSmoke = env.OIA_DESKTOP_PACKAGED_SMOKE === "1" && Boolean(env.OIA_USER_DATA_DIR);
  if (isPackaged) return packagedSmoke ? "packaged-smoke" : null; // never any other mode, REAL included
  // REAL wins over EVERY mock mode, packaged-smoke included: `pnpm smoke`
  // exports OIA_DESKTOP_SMOKE=1 itself, and a mock mode silently swallowing an
  // outer OIA_DESKTOP_REAL_SMOKE=1 recorded two "real" runs on 2026-11-07 that
  // were actually mock (pin-comment CORRECTION, D12 ledger).
  if (env.OIA_DESKTOP_REAL_SMOKE === "1") return "real";
  if (packagedSmoke) return "packaged-smoke"; // scriptable on dev builds too
  if (env.OIA_DESKTOP_SI_SMOKE === "1") return "si";
  if (env.OIA_DESKTOP_SMOKE === "1") return "smoke";
  if (env.OIA_DESKTOP_CRASH_SMOKE === "1") return "crash";
  if (env.OIA_DESKTOP_SHOT === "1") return "shot";
  if (env.OIA_DESKTOP_SHOT_BUSY === "1") return "shot-busy";
  return null;
}

/**
 * Explicit View submenu, NEVER role:"viewMenu" (it drags in Reload + Toggle
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
