import type { RuntimeStatus } from "@oia/providers";
import type { RuntimeModeChoice } from "./ipc.js";

/**
 * TP-D3 — the provider-mode resolver, pure and testable (no Electron imports).
 *
 * Consent rule (the quota-honesty fix): "auto" only ever selects codex when the user
 * has ACTED through the runtime surface — completed a guided install, completed an
 * in-app login, or explicitly chosen the Codex segment. A dev machine with a brew
 * codex + live ChatGPT session must not silently start burning quota on first launch;
 * it gets mock + a one-click "Dùng Codex thật" instead. CI (smoke/shot) is pinned mock
 * regardless; an explicit env pin wins over everything else.
 */

export interface DesktopProvidersEnv {
  OIA_DESKTOP_SMOKE?: string;
  OIA_DESKTOP_SHOT?: string;
  OIA_DESKTOP_PROVIDERS?: string;
  /** Owner's explicit opt-in real run (OIA_DESKTOP_REAL_SMOKE) — counts as consent. */
  OIA_DESKTOP_REAL_SMOKE?: string;
}

export function resolveEffectiveMode(input: {
  choice: RuntimeModeChoice;
  /** True once the user acted through the runtime surface (install/login/explicit codex). */
  consent: boolean;
  runtimeState: RuntimeStatus["state"] | null;
  env: DesktopProvidersEnv;
}): "mock" | "codex" {
  const { env } = input;
  if (env.OIA_DESKTOP_SMOKE === "1" || env.OIA_DESKTOP_SHOT === "1") return "mock";
  if (env.OIA_DESKTOP_PROVIDERS === "mock" || env.OIA_DESKTOP_PROVIDERS === "codex") return env.OIA_DESKTOP_PROVIDERS;
  if (input.choice === "auto") {
    const consent = input.consent || env.OIA_DESKTOP_REAL_SMOKE === "1"; // explicit owner run
    return consent && input.runtimeState === "ready" ? "codex" : "mock";
  }
  return input.choice;
}
