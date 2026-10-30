import { describe, it, expect } from "vitest";
import { smokeModeFromEnv, appMenuTemplate } from "../src/main/releaseGate.js";

/**
 * F2 — the release shell must not carry dev affordances. Pinned as pure functions
 * (no Electron runtime): what a packaged build may do is decided HERE, the main
 * process only obeys.
 */

const allFlags: NodeJS.ProcessEnv = {
  OIA_DESKTOP_SMOKE: "1",
  OIA_DESKTOP_CRASH_SMOKE: "1",
  OIA_DESKTOP_REAL_SMOKE: "1",
  OIA_DESKTOP_SHOT: "1",
  OIA_DESKTOP_SI_SMOKE: "1",
};

describe("F2 smoke/test modes are dev-build only", () => {
  it("a PACKAGED build ignores every OIA_DESKTOP_* flag — even all of them at once", () => {
    expect(smokeModeFromEnv(allFlags, true)).toBeNull(); // REAL_SMOKE bills quota; never reachable in release
  });
  it("an unpackaged build (CI, dev) still enters each mode", () => {
    expect(smokeModeFromEnv({ OIA_DESKTOP_SMOKE: "1" }, false)).toBe("smoke");
    expect(smokeModeFromEnv({ OIA_DESKTOP_CRASH_SMOKE: "1" }, false)).toBe("crash");
    expect(smokeModeFromEnv({ OIA_DESKTOP_REAL_SMOKE: "1" }, false)).toBe("real");
    expect(smokeModeFromEnv({ OIA_DESKTOP_SHOT: "1" }, false)).toBe("shot");
    expect(smokeModeFromEnv({ OIA_DESKTOP_SI_SMOKE: "1" }, false)).toBe("si");
  });
  it("no flags → normal app", () => {
    expect(smokeModeFromEnv({}, false)).toBeNull();
  });
  it("flags set to anything but \"1\" are inert", () => {
    expect(smokeModeFromEnv({ OIA_DESKTOP_SMOKE: "yes" }, false)).toBeNull();
  });
});

describe("F2 menu — no DevTools or Reload in the release View menu", () => {
  const roles = (tpl: ReturnType<typeof appMenuTemplate>): string =>
    JSON.stringify(tpl);

  it("the PROD template has no toggleDevTools and no reload anywhere", () => {
    const flat = roles(appMenuTemplate(true, false));
    expect(flat).not.toContain("toggleDevTools"); // the viewMenu role shipped exactly this
    expect(flat).not.toContain("reload");
    expect(flat).toContain("zoomIn"); // sellers keep zoom
    expect(flat).toContain("appMenu"); // mac keeps the app menu
  });
  it("the DEV template keeps reload + devtools (electron-vite dev / unpackaged runs)", () => {
    const flat = roles(appMenuTemplate(false, true));
    expect(flat).toContain("toggleDevTools");
    expect(flat).toContain("reload");
    expect(flat).not.toContain("appMenu"); // non-mac
  });
});
