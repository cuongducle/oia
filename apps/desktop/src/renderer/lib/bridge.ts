import type { OiaBridge } from "../../shared/bridge.js";

/** The preload exposes the typed bridge on window.oia — one accessor, typed once. */
export const oia = (): OiaBridge => (window as unknown as { oia: OiaBridge }).oia;

/** Map IPC/provider failure names to user-safe English messages (names are stable contracts). */
export function bridgeErrorMessage(e: unknown, fallback: string): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "IpcValidationError") return "Invalid request — please try again.";
  if (name === "ProviderConfigError") return "Provider configuration is invalid (mock mixed with real). See the README.";
  return e instanceof Error && e.message ? e.message : fallback;
}
