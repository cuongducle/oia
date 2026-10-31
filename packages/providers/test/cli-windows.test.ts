import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CliRuntime, envValue, resolveCodexBin } from "../src/index.js";

/**
 * T5 — the CliRuntime paths Windows users hit first. Platform-neutral cases run
 * everywhere; the .cmd shim case runs only on win32 (CI `desktop-smoke-windows`
 * runs this suite on a real Windows runner).
 */

const root = mkdtempSync(path.join(tmpdir(), "oia-t5-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A dir name a Vietnamese seller's machine really has: diacritics + spaces. */
const unicodeDir = path.join(root, "Nguyễn Văn Ánh", "thư mục ảnh");
mkdirSync(unicodeDir, { recursive: true });

/** Echo helper: prints argv[2] on line 1, then stdin verbatim. */
const echoScript = path.join(unicodeDir, "echo.cjs");
writeFileSync(
  echoScript,
  `let s = ""; process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => process.stdout.write(process.argv[2] + "\\n" + s));`,
);

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("envValue — Windows names it `Path`", () => {
  it("finds PATH case-insensitively on a plain object copy", () => {
    expect(envValue({ Path: "C:\\bin" }, "PATH")).toBe("C:\\bin");
    expect(envValue({ PATH: "/usr/bin" }, "PATH")).toBe("/usr/bin");
    expect(envValue({}, "PATH")).toBeUndefined();
  });

  it("resolveCodexBin scans `Path` (a copied env object, win32 rules)", async () => {
    const bin = path.join(root, "pathcase");
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, "codex.cmd"), "@echo off\r\n");
    const det = await resolveCodexBin({ env: { Path: bin }, platform: "win32", includeWellKnown: false });
    expect(det).toEqual({ source: "path", bin: path.join(bin, "codex.cmd") });
  });

  it("probes %APPDATA%\\npm (npm -g shim dir) when PATH misses it", async () => {
    const appData = path.join(root, "AppData", "Roaming");
    mkdirSync(path.join(appData, "npm"), { recursive: true });
    writeFileSync(path.join(appData, "npm", "codex.cmd"), "@echo off\r\n");
    const det = await resolveCodexBin({ env: { Path: "", APPDATA: appData }, platform: "win32" });
    expect(det).toEqual({ source: "path", bin: path.join(appData, "npm", "codex.cmd") });
  });
});

describe("CliRuntime — Unicode paths and UTF-8 streams", () => {
  const rt = new CliRuntime();

  it("passes a diacritic + space path through argv and Vietnamese copy through stdin intact", async () => {
    const copy = "banner trà sữa giảm 20% ngày 8/11 — Ưu đãi đặc biệt";
    const res = await rt.run({
      bin: process.execPath,
      args: [echoScript, unicodeDir],
      stdin: copy,
      cwd: unicodeDir,
      timeoutMs: 20_000,
    });
    expect(res.code).toBe(0);
    expect(res.stdout).toBe(`${unicodeDir}\n${copy}`);
  });

  it("never splits a multi-byte character across chunks (large Vietnamese output)", async () => {
    // ~600 KB of 3-byte UTF-8 chars: certain to cross many pipe-chunk boundaries
    const big = path.join(root, "big.cjs");
    writeFileSync(big, `process.stdout.write("ễ".repeat(200000));`);
    const res = await rt.run({ bin: process.execPath, args: [big], timeoutMs: 20_000 });
    expect(res.stdout.length).toBe(200_000);
    expect(res.stdout).not.toContain("\uFFFD"); // no replacement chars from a split sequence
  });
});

describe("CliRuntime — cancel kills the whole tree", () => {
  it("aborting the root also kills its grandchild (no orphan keeps burning quota)", async () => {
    const pidFile = path.join(root, "grandchild.pid");
    const parent = path.join(root, "parent.cjs");
    const child = path.join(root, "child.cjs");
    writeFileSync(child, `require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`);
    writeFileSync(
      parent,
      `require("child_process").spawn(process.execPath, [${JSON.stringify(child)}], { stdio: "ignore" }); setInterval(() => {}, 1000);`,
    );
    const ac = new AbortController();
    const run = new CliRuntime().run({ bin: process.execPath, args: [parent], timeoutMs: 30_000, signal: ac.signal });
    for (let i = 0; i < 100 && !existsSync(pidFile); i++) await new Promise((r) => setTimeout(r, 100));
    const grandchild = Number(readFileSync(pidFile, "utf8"));
    expect(isAlive(grandchild)).toBe(true);

    ac.abort();
    const res = await run;
    expect(res.aborted).toBe(true);
    let dead = false;
    for (let i = 0; i < 50 && !dead; i++) {
      dead = !isAlive(grandchild);
      if (!dead) await new Promise((r) => setTimeout(r, 100));
    }
    expect(dead).toBe(true);
  });
});

describe.runIf(process.platform === "win32")("CliRuntime — npm .cmd shim (win32 only)", () => {
  it("spawns a .cmd shim like `codex.cmd` with flag args and a Vietnamese stdin prompt", async () => {
    const shim = path.join(unicodeDir, "codex.cmd");
    writeFileSync(shim, `@echo off\r\n"${process.execPath}" "%~dp0echo.cjs" %*\r\n`);
    const copy = "giảm 20% ngày 8/11";
    const res = await new CliRuntime().run({ bin: shim, args: ["exec"], stdin: copy, timeoutMs: 20_000 });
    expect(res.code).toBe(0);
    expect(res.stdout).toBe(`exec\n${copy}`);
  });
});
