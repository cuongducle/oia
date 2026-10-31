import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "../src/shared/bridge.js";
import { runtimeStatusLine } from "../src/renderer/lib/runtime-status.js";
import { costHintText, stepsFromTimeline } from "../src/renderer/lib/run-steps.js";

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

/**
 * UI v1.1 R3 — the progress line and cost hint shared by every metered flow. The
 * agent's internal role names must never reach a seller, and the cost hint must
 * not show a price in Trial (nothing is billed) except the multi-page contract
 * label C1 pins.
 */
describe("stepsFromTimeline", () => {
  it("maps agent roles to seller words and runs only the first unfinished step", () => {
    const steps = stepsFromTimeline([
      { content: "Designer Agent", done: true },
      { content: "Image Generator", done: false },
      { content: "Manager Agent", done: false },
    ]);
    expect(steps).toEqual([
      { label: "Planning", state: "done" },
      { label: "Painting", state: "running" },
      { label: "Composing", state: "pending" },
    ]);
  });

  it("an unknown role passes through instead of vanishing", () => {
    expect(stepsFromTimeline([{ content: "Layout Checker", done: false }])).toEqual([{ label: "Layout Checker", state: "running" }]);
  });
});

describe("costHintText", () => {
  it("multi-page keeps C1's contract label, Trial or not", () => {
    expect(costHintText({ images: 1, pages: 2, isMock: true })).toBe("2 pages ≈ 2 images");
    expect(costHintText({ images: 1, pages: 3, isMock: false })).toBe("3 pages ≈ 3 images");
  });

  it("a single paid image shows its cost; Trial shows none", () => {
    expect(costHintText({ images: 1, isMock: false })).toBe("≈ 1 image");
    expect(costHintText({ images: 1, reads: 1, isMock: false })).toBe("≈ 1 image + 1 read");
    expect(costHintText({ images: 1, pages: 1, isMock: true })).toBeNull();
  });
});
