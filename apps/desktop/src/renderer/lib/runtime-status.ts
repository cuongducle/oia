import type { RuntimeSnapshot } from "../../shared/bridge.js";

export type StatusTone = "ok" | "warn" | "bad";

/**
 * UI v1.1 R1 — the one-line runtime status the sidebar card shows. Pure so the
 * wording is pinned by a unit test: Trial must never read as "ready" (TP.6 mock
 * labeling), and a broken runtime must say what is missing, not just "error".
 */
export function runtimeStatusLine(snap: RuntimeSnapshot, imageIsMock: boolean): { tone: StatusTone; title: string; detail: string } {
  if (imageIsMock || snap.effective === "mock") {
    return { tone: "warn", title: "Trial mode", detail: "placeholder images" };
  }
  const rt = snap.runtime;
  if (rt.state === "ready") {
    const via = rt.loginMethod === "api-key" ? "API key" : "ChatGPT";
    return { tone: "ok", title: "Codex", detail: `ready · ${via}` };
  }
  if (rt.state === "not_logged_in") return { tone: "bad", title: "Codex", detail: "sign in needed" };
  return { tone: "bad", title: "Codex", detail: "not installed" };
}
