import type { RuntimeStatus } from "@oia/providers";
import type { RuntimeModeChoice } from "../shared/ipc.js";

/**
 * TP-D3 — the pure view-model for the Codex runtime panel. UI copy is ENGLISH by
 * owner decision Q11 (Vietnamese stays content/font level only — banner text, Be
 * Vietnam Pro). Kept DOM-free so the action matrix per runtime state and the error
 * mapping are testable without Electron.
 */

export type RuntimeAction = "install" | "login" | "logout" | "enableReal";

export interface RuntimeViewModel {
  badge: "ok" | "warn" | "err";
  /** Short status line for the panel header. */
  headline: string;
  /** Version · login method · source — the diagnostics surface (TP.6 posture). */
  detail: string;
  actions: RuntimeAction[];
}

export function runtimeViewModel(
  runtime: RuntimeStatus,
  _providersMode: RuntimeModeChoice,
  effective: "mock" | "codex",
): RuntimeViewModel {
  const sourceLabel =
    runtime.source === "bundled"
      ? "bundled with the app"
      : runtime.source === "path"
        ? "found on this machine"
        : runtime.source === "managed"
          ? "installed by the app"
          : runtime.source === "env"
            ? "environment override"
            : "";
  if (runtime.state === "missing") {
    return {
      badge: "err",
      headline: "Codex is not installed — needed for real banners",
      // no byte count: it drifts per platform/release; the checksum promise is the contract
      detail: "The app will download the official Codex package and verify its checksum before installing.",
      actions: ["install"],
    };
  }
  if (runtime.state === "not_logged_in") {
    // enableReal deliberately NOT offered here: switching to codex before login just
    // sets the user up for not_logged_in failures on their next banner
    return {
      badge: "warn",
      headline: "Codex is installed but not signed in",
      detail: [runtime.version ? `codex ${runtime.version}` : null, sourceLabel].filter(Boolean).join(" · "),
      actions: ["login"],
    };
  }
  // ready
  const loginLabel = runtime.loginMethod === "api-key" ? "API key" : "ChatGPT";
  const actions: RuntimeAction[] = ["logout"];
  if (effective === "mock") actions.push("enableReal");
  return {
    badge: "ok",
    headline: "Codex is ready",
    detail: [runtime.version ? `codex ${runtime.version}` : null, loginLabel, sourceLabel].filter(Boolean).join(" · "),
    actions,
  };
}

/** Install phases → progress text (a big download must feel alive). */
export function installPhaseText(phase: string, pct?: number): string {
  switch (phase) {
    case "resolve":
      return "Finding the latest release…";
    case "download":
      return pct !== undefined ? `Downloading Codex… ${pct}%` : "Downloading Codex…";
    case "checksum":
      return "Verifying checksum…";
    case "extract":
      return "Extracting…";
    case "finalize":
      return "Finishing up…";
    default:
      return "Installing…";
  }
}

/**
 * Error mapping for runtime ops (Q11: English UI copy). Main sends ProviderErrors
 * across IPC as name="RuntimeProviderError" + message=<errorClass>; anything unmapped
 * keeps a short original tail instead of a raw dump.
 */
export function runtimeErrorText(err: unknown): string {
  const e = err as { name?: string; message?: string };
  const isRuntime = e?.name === "RuntimeProviderError";
  const code = isRuntime ? (e.message ?? "") : "";
  if (code === "provider_missing") return "Codex was not found on this machine — click “Install Codex” first.";
  if (code === "network") return "Network error while downloading Codex — check your connection and retry.";
  if (code === "rate_limited") return "GitHub is rate-limiting requests — wait about a minute and retry.";
  if (code === "timeout") return "Timed out — please try again.";
  if (code === "cancelled") return "Cancelled. Note: cancelling a sign-in mid-flow may sign you out — if that happened, sign in again.";
  if (code === "checksum_mismatch" || /checksum/i.test(e?.message ?? "")) return "Download failed the checksum check — nothing was installed. Please retry.";
  if (code === "capability_unsupported") return "This platform is not supported for the Codex install yet.";
  if (e?.name === "IpcValidationError") return "Invalid request.";
  const detail = e?.message ? ` (${e.message.slice(0, 120)})` : "";
  return `Something went wrong${detail}`;
}
