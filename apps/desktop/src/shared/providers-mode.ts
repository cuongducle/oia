import type { RuntimeStatus } from "@oia/providers";
import type { RuntimeModeChoice } from "./ipc.js";

/**
 * TP-D3 — the provider-mode resolver, pure and testable (no Electron imports).
 *
 * Consent rule (the quota-honesty fix): "auto" only ever selects codex when consent
 * is granted AND the runtime is ready (binary found + logged in). D13 (owner) moved
 * the DEFAULT of that consent to GRANTED — zero-config real mode was the ask — so
 * the protection that remains is the runtime itself: no codex binary or no live
 * login still means mock, whatever consent says. CI (smoke/shot) is pinned mock
 * regardless; an explicit env pin wins over everything else.
 */

export interface DesktopProvidersEnv {
  OIA_DESKTOP_SMOKE?: string;
  OIA_DESKTOP_SHOT?: string;
  OIA_DESKTOP_PROVIDERS?: string;
  /** Owner's explicit opt-in real run (OIA_DESKTOP_REAL_SMOKE) — counts as consent. */
  OIA_DESKTOP_REAL_SMOKE?: string;
}

/** The persisted runtime settings (settings.json in userData) — TP-D3/D13. */
export interface ProvidersSettings {
  providers: RuntimeModeChoice;
  codexConsent: boolean;
}

/**
 * D13 (owner, 2026-11-06): a FRESH install defaults to auto + CONSENT GRANTED —
 * a machine already running codex CLI with a live ChatGPT session goes real on
 * first launch (zero-config was the owner's ask; the quota risk is accepted and
 * recorded in the plan doc). Absent/invalid data means the DEFAULTS; an explicit
 * `codexConsent: false` is still honored (a deliberate opt-out stays an opt-out).
 * Protection that REMAINS regardless: no codex binary or no login → mock
 * (resolveEffectiveMode gates on runtimeState === "ready").
 */
export function normalizeProvidersSettings(raw: unknown): ProvidersSettings {
  const r = (raw ?? {}) as Partial<ProvidersSettings>;
  const providers =
    r.providers === "mock" || r.providers === "codex" || r.providers === "auto" ? r.providers : "auto";
  return { providers, codexConsent: r.codexConsent !== false };
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

/**
 * T3 — the SINGLE place the utility's service env is assembled. Pure: builds a
 * NEW object, never mutates the base (main used to set-then-restore
 * process.env.CODEX_BIN, leaking global state to every other consumer).
 */
export function buildServiceEnv(
  base: Record<string, string | undefined>,
  mode: "mock" | "codex",
  codexBin?: string | null,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...base, IMAGE_PROVIDER: mode, LLM_PROVIDER: mode };
  if (mode === "codex" && codexBin) env.CODEX_BIN = codexBin;
  return env;
}
