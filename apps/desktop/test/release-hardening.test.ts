import { describe, it, expect } from "vitest";
import { smokeModeFromEnv, appMenuTemplate, resolveUserDataOverride } from "../src/main/releaseGate.js";
import path from "node:path";

/**
 * F2: the release shell must not carry dev affordances. Pinned as pure functions
 * (no Electron runtime): what a packaged build may do is decided HERE, the main
 * process only obeys.
 */

const allFlags: NodeJS.ProcessEnv = {
  OIA_DESKTOP_SMOKE: "1",
  OIA_DESKTOP_CRASH_SMOKE: "1",
  OIA_DESKTOP_REAL_SMOKE: "1",
  OIA_DESKTOP_SHOT: "1",
  OIA_DESKTOP_SHOT_BUSY: "1",
  OIA_DESKTOP_SI_SMOKE: "1",
};

describe("F2 smoke/test modes are dev-build only", () => {
  it("a PACKAGED build ignores every OIA_DESKTOP_* flag, even all of them at once", () => {
    expect(smokeModeFromEnv(allFlags, true)).toBeNull(); // REAL_SMOKE bills quota; never reachable in release
  });
  it("an unpackaged build (CI, dev) still enters each mode", () => {
    expect(smokeModeFromEnv({ OIA_DESKTOP_SMOKE: "1" }, false)).toBe("smoke");
    expect(smokeModeFromEnv({ OIA_DESKTOP_CRASH_SMOKE: "1" }, false)).toBe("crash");
    expect(smokeModeFromEnv({ OIA_DESKTOP_REAL_SMOKE: "1" }, false)).toBe("real");
    expect(smokeModeFromEnv({ OIA_DESKTOP_SHOT: "1" }, false)).toBe("shot");
    expect(smokeModeFromEnv({ OIA_DESKTOP_SHOT_BUSY: "1" }, false)).toBe("shot-busy");
    expect(smokeModeFromEnv({ OIA_DESKTOP_SI_SMOKE: "1" }, false)).toBe("si");
  });
  it("no flags → normal app", () => {
    expect(smokeModeFromEnv({}, false)).toBeNull();
  });
  it("flags set to anything but \"1\" are inert", () => {
    expect(smokeModeFromEnv({ OIA_DESKTOP_SMOKE: "yes" }, false)).toBeNull();
  });
  it("REAL wins when the pnpm smoke script's OIA_DESKTOP_SMOKE=1 coexists with an outer OIA_DESKTOP_REAL_SMOKE=1 (2026-11-07 false-record lesson)", () => {
    expect(smokeModeFromEnv({ OIA_DESKTOP_SMOKE: "1", OIA_DESKTOP_REAL_SMOKE: "1" }, false)).toBe("real");
  });
});

describe("SG-2 packaged-smoke mode", () => {
  const psEnv = { OIA_DESKTOP_PACKAGED_SMOKE: "1", OIA_USER_DATA_DIR: "/tmp/oia-ps" };
  it("is the ONLY mode a packaged build may enter, and only with BOTH the flag and an override dir", () => {
    expect(smokeModeFromEnv(psEnv, true)).toBe("packaged-smoke");
    expect(smokeModeFromEnv({ OIA_DESKTOP_PACKAGED_SMOKE: "1" }, true)).toBeNull(); // no override dir: refuse, never the real profile
    expect(smokeModeFromEnv({ OIA_USER_DATA_DIR: "/tmp/x" }, true)).toBeNull(); // the dir alone is a NORMAL packaged run
  });
  it("a packaged build still ignores every other flag (REAL included), even next to packaged-smoke", () => {
    expect(smokeModeFromEnv(allFlags, true)).toBeNull();
    expect(smokeModeFromEnv({ ...allFlags, ...psEnv }, true)).toBe("packaged-smoke");
  });
  it("a dev build can run it too (the script is testable unpackaged)", () => {
    expect(smokeModeFromEnv(psEnv, false)).toBe("packaged-smoke");
  });
  it("REAL still wins over packaged-smoke on dev builds (2026-11-07 lesson: a mock mode must never swallow an outer REAL flag)", () => {
    expect(smokeModeFromEnv({ ...psEnv, OIA_DESKTOP_REAL_SMOKE: "1" }, false)).toBe("real");
  });
});

describe("SG-2 OIA_USER_DATA_DIR validation (pure rules)", () => {
  const def = path.resolve("/Users/seller/Library/Application Support/Oia");
  const ok = (dir: string) => resolveUserDataOverride({ OIA_USER_DATA_DIR: dir }, def);
  it("accepts an absolute dir outside the default profile", () => {
    expect(ok("/tmp/oia-packaged-smoke")).toEqual({ dir: "/tmp/oia-packaged-smoke" });
  });
  it("rejects relative paths", () => {
    expect(ok("relative/dir")).toMatchObject({ error: expect.stringContaining("absolute") });
  });
  it("rejects the default profile dir itself and anything inside it", () => {
    expect(ok(def)).toMatchObject({ error: expect.stringContaining("default profile") });
    expect(ok(path.join(def, "smoke"))).toMatchObject({ error: expect.stringContaining("inside the default profile") });
  });
  it("rejects empty values", () => {
    expect(ok("")).toMatchObject({ error: expect.stringContaining("empty") });
    expect(ok("   ")).toMatchObject({ error: expect.stringContaining("empty") });
  });
});

describe("F2 menu, no DevTools or Reload in the release View menu", () => {
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
