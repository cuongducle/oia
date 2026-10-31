import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "../src/shared/bridge.js";
import { runtimeStatusLine } from "../src/renderer/lib/runtime-status.js";

/**
 * UI v1.1 R1 — the sidebar status card replaces the runtime panel that used to sit
 * under the Home composer. Its one line must stay honest: Trial never reads as
 * "ready", and a broken runtime names what is missing.
 */

function snap(state: "ready" | "not_logged_in" | "missing", effective: "mock" | "codex", loginMethod: "chatgpt" | "api-key" | null = "chatgpt"): RuntimeSnapshot {
  return { runtime: { state, source: "bundled", bin: "/x/codex", loginMethod }, providersMode: "auto", effective };
}

describe("runtimeStatusLine", () => {
  it("a ready Codex says so, with the login it uses", () => {
    expect(runtimeStatusLine(snap("ready", "codex"), false)).toEqual({ tone: "ok", title: "Codex", detail: "ready · ChatGPT" });
    expect(runtimeStatusLine(snap("ready", "codex", "api-key"), false).detail).toBe("ready · API key");
  });

  it("Trial wins over a ready runtime — placeholder images are never labeled ready", () => {
    expect(runtimeStatusLine(snap("ready", "mock"), true)).toEqual({ tone: "warn", title: "Trial mode", detail: "placeholder images" });
    expect(runtimeStatusLine(snap("ready", "codex"), true).title).toBe("Trial mode"); // provider says mock even if the snapshot lags
  });

  it("a broken runtime names what is missing", () => {
    expect(runtimeStatusLine(snap("not_logged_in", "codex"), false)).toEqual({ tone: "bad", title: "Codex", detail: "sign in needed" });
    expect(runtimeStatusLine(snap("missing", "codex"), false)).toEqual({ tone: "bad", title: "Codex", detail: "not installed" });
  });
});
