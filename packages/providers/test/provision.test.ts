import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { chmodSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  RuntimeProvisioner,
  resolveCodexBin,
  codexPackageAsset,
  extractAuthUrl,
  parseSum,
  CliRuntime,
  type CliRunOptions,
  type CliRunResult,
  ProviderError,
} from "../src/index.js";
import { readdir } from "node:fs/promises";

/** Shallow walk — test-only replacement for the removed production export. */
async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else out.push(path.relative(root, p));
    }
  }
  await walk(root);
  return out.sort();
}

/** One tiny codex-package tarball + its fetcher (fake GitHub, real tar, real sha256). */
async function buildPackageFixture(): Promise<{ archive: Buffer; sha256: string; asset: string }> {
  const root = path.join(dir, "pkg-src");
  mkdirSync(path.join(root, "bin"), { recursive: true });
  mkdirSync(path.join(root, "codex-path"), { recursive: true });
  writeFileSync(path.join(root, "bin", "codex"), "#!/bin/sh\necho codex-cli 9.9.9\n", { mode: 0o755 });
  writeFileSync(path.join(root, "codex-path", "rg"), "#!/bin/sh\n", { mode: 0o755 });
  writeFileSync(path.join(root, "codex-package.json"), JSON.stringify({ layoutVersion: 1, version: "9.9.9", target: "aarch64-apple-darwin", entrypoint: "bin/codex" }));
  const archive = path.join(dir, "pkg.tar.gz");
  await exec("tar", ["-czf", archive, "-C", root, "."]);
  const buf = await readFile(archive);
  return { archive: buf, sha256: createHash("sha256").update(buf).digest("hex"), asset: "codex-package-aarch64-apple-darwin.tar.gz" };
}

function makeFetcher(fx: { archive: Buffer; sha256: string; asset: string }, opts: { corruptSums?: boolean } = {}): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith("/releases/latest")) {
      return new Response(
        JSON.stringify({
          tag_name: "rust-v9.9.9",
          assets: [
            { name: fx.asset, browser_download_url: "http://fake/pkg.tar.gz", size: fx.archive.length },
            { name: "codex-package_SHA256SUMS", browser_download_url: "http://fake/sums", size: 10 },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    if (u.endsWith("/sums")) {
      const body = opts.corruptSums ? `${"0".repeat(64)}  ${fx.asset}\n` : `${fx.sha256}  ${fx.asset}\n`;
      return new Response(body);
    }
    if (u.endsWith("/pkg.tar.gz")) {
      return new Response(fx.archive, { headers: { "content-length": String(fx.archive.length) } });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

const exec = promisify(execFile);

/**
 * TP-D3 — RuntimeProvisioner tests. Everything subprocess-shaped is faked at the
 * CliRuntime boundary; the login fixture is the REAL stderr captured from codex
 * 0.163.0 on macOS (S6 ground truth), and the install fixture is a real tar.gz
 * built with the system tar so extraction runs the actual code path.
 */

let dir: string;
beforeAll(() => {
  dir = path.join(tmpdir(), `oia-provision-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** CliRuntime double: canned results keyed by args[0]; login flows replay the fixture. */
class FakeRuntime extends CliRuntime {
  public calls: Array<{ bin: string; args: string[] }> = [];
  constructor(
    private readonly behaviour: (opts: CliRunOptions) => Promise<CliRunResult> | CliRunResult | "stderr-replay",
    private readonly lines?: string[],
  ) {
    super();
  }
  override async run(opts: CliRunOptions): Promise<CliRunResult> {
    this.calls.push({ bin: opts.bin, args: opts.args });
    const b = this.behaviour(opts);
    if (b === "stderr-replay") {
      for (const line of this.lines ?? []) opts.onStderrLine?.(line);
      return { stdout: "", stderr: (this.lines ?? []).join("\n"), code: 0, timedOut: false, aborted: false, durationMs: 5 };
    }
    return b;
  }
}

describe("codexPackageAsset (S5 — always the checksummed package variant)", () => {
  it("maps platforms/arches to codex-package-<target>.tar.gz", () => {
    expect(codexPackageAsset("darwin", "arm64")).toBe("codex-package-aarch64-apple-darwin.tar.gz");
    expect(codexPackageAsset("darwin", "x64")).toBe("codex-package-x86_64-apple-darwin.tar.gz");
    expect(codexPackageAsset("win32", "x64")).toBe("codex-package-x86_64-pc-windows-msvc.tar.gz");
    expect(codexPackageAsset("win32", "arm64")).toBe("codex-package-aarch64-pc-windows-msvc.tar.gz");
    expect(codexPackageAsset("linux", "x64")).toBe("codex-package-x86_64-unknown-linux-musl.tar.gz");
  });
});

describe("resolveCodexBin (env → PATH+wellKnown → managed)", () => {
  it("env override wins when the file is executable", async () => {
    const bin = path.join(dir, "env-codex");
    writeFileSync(bin, "#!/bin/sh\n", { mode: 0o755 });
    const det = await resolveCodexBin({ env: { CODEX_BIN: bin, PATH: "" }, platform: "darwin", includeWellKnown: false });
    expect(det).toEqual({ source: "env", bin });
  });
  it("env override pointing nowhere is skipped, not fatal", async () => {
    const det = await resolveCodexBin({ env: { CODEX_BIN: "/nope/codex", PATH: "" }, platform: "darwin", managedDir: path.join(dir, "m1"), includeWellKnown: false });
    expect(det.source).toBeNull();
  });
  it("scans PATH directories for the codex name", async () => {
    const binDir = path.join(dir, "pathbin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(binDir, "codex"), "#!/bin/sh\n", { mode: 0o755 });
    const det = await resolveCodexBin({ env: { PATH: binDir }, platform: "darwin", includeWellKnown: false });
    expect(det.source).toBe("path");
    expect(det.bin).toBe(path.join(binDir, "codex"));
  });
  it("win32 probes .cmd/.exe forms (PATHEXT discipline from TP.8)", async () => {
    const binDir = path.join(dir, "winbin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(binDir, "codex.cmd"), "@echo off\n");
    const det = await resolveCodexBin({ env: { PATH: binDir }, platform: "win32", includeWellKnown: false });
    expect(det.source).toBe("path");
    expect(det.bin?.endsWith("codex.cmd")).toBe(true);
  });
  it("falls back to the managed install layout (current/bin/codex)", async () => {
    const managed = path.join(dir, "managed-root");
    mkdirSync(path.join(managed, "current", "bin"), { recursive: true });
    writeFileSync(path.join(managed, "current", "bin", "codex"), "#!/bin/sh\n", { mode: 0o755 });
    const det = await resolveCodexBin({ env: { PATH: "" }, managedDir: managed, platform: "darwin", includeWellKnown: false });
    expect(det).toEqual({ source: "managed", bin: path.join(managed, "current", "bin", "codex") });
  });
});

describe("status() parsing", () => {
  it("missing → state missing without spawning", async () => {
    const rt = new FakeRuntime(() => ({ stdout: "", stderr: "", code: 0, timedOut: false, aborted: false, durationMs: 1 }));
    const p = new RuntimeProvisioner({ managedDir: path.join(dir, "none"), runtime: rt, env: { PATH: "" }, platform: "darwin", arch: "arm64", includeWellKnown: false });
    const st = await p.status({ force: true });
    expect(st.state).toBe("missing");
    expect(rt.calls.length).toBe(0);
  });
  it("parses version + 'Logged in using ChatGPT'", async () => {
    const binDir = path.join(dir, "st1");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(binDir, "codex"), "#!/bin/sh\n", { mode: 0o755 });
    const rt = new FakeRuntime((o) =>
      o.args[0] === "--version"
        ? { stdout: "codex-cli 0.163.0\n", stderr: "", code: 0, timedOut: false, aborted: false, durationMs: 1 }
        : { stdout: "Logged in using ChatGPT\n", stderr: "", code: 0, timedOut: false, aborted: false, durationMs: 1 },
    );
    const p = new RuntimeProvisioner({ managedDir: path.join(dir, "none"), runtime: rt, env: { PATH: binDir }, platform: "darwin", arch: "arm64", includeWellKnown: false });
    const st = await p.status({ force: true });
    expect(st).toMatchObject({ state: "ready", loggedIn: true, loginMethod: "chatgpt", version: "0.163.0", source: "path", bin: path.join(binDir, "codex") });
  });
  it("'Not logged in' (exit 1) parses as not_logged_in, never as a hard error", async () => {
    const binDir = path.join(dir, "st2");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(binDir, "codex"), "#!/bin/sh\n", { mode: 0o755 });
    const rt = new FakeRuntime((o) =>
      o.args[0] === "--version"
        ? { stdout: "codex-cli 0.166.0\n", stderr: "", code: 0, timedOut: false, aborted: false, durationMs: 1 }
        : { stdout: "", stderr: "Not logged in\n", code: 1, timedOut: false, aborted: false, durationMs: 1 },
    );
    const p = new RuntimeProvisioner({ managedDir: path.join(dir, "none"), runtime: rt, env: { PATH: binDir }, platform: "darwin", arch: "arm64", includeWellKnown: false });
    const st = await p.status({ force: true });
    expect(st.state).toBe("not_logged_in");
    expect(st.loggedIn).toBe(false);
  });
});

describe("login() — S6 wrapper over the REAL captured stderr (fixtures/login-start-stderr.txt)", () => {
  const fixture = () => readFileSync(new URL("./fixtures/login-start-stderr.txt", import.meta.url), "utf8");

  it("extracts the auth URL and reports success via the refreshed status", async () => {
    const binDir = path.join(dir, "lg1");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(binDir, "codex"), "#!/bin/sh\n", { mode: 0o755 });
    const lines = fixture().split("\n").filter((l) => l.trim().length > 0);
    const rt = new FakeRuntime((o) => {
      if (o.args.join(" ") === "login") return "stderr-replay" as const;
      if (o.args[0] === "--version")
        return { stdout: "codex-cli 0.163.0\n", stderr: "", code: 0, timedOut: false, aborted: false, durationMs: 1 };
      return { stdout: "Logged in using ChatGPT\n", stderr: "", code: 0, timedOut: false, aborted: false, durationMs: 1 };
    }, lines);
    const p = new RuntimeProvisioner({ managedDir: path.join(dir, "none"), runtime: rt, env: { PATH: binDir }, platform: "darwin", arch: "arm64", includeWellKnown: false });
    const urls: string[] = [];
    const phases: string[] = [];
    const { ok, status } = await p.login(
      { onAuthUrl: (u) => urls.push(u), onPhase: (ph) => phases.push(ph) },
      { timeoutMs: 5_000 },
    );
    expect(ok).toBe(true);
    expect(status.loggedIn).toBe(true);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/^https:\/\/auth\.openai\.com\/oauth\/authorize\?/);
    expect(urls[0]).toContain("code_challenge"); // PKCE — the real flow, not a hand-built URL
    expect(phases).toContain("starting");
    expect(phases).toContain("url");
  });
  it("an interrupted login (aborted) is a ProviderError — the session-rotation hazard is in the message", async () => {
    const binDir = path.join(dir, "lg2");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(binDir, "codex"), "#!/bin/sh\n", { mode: 0o755 });
    const rt = new FakeRuntime(() => ({
      stdout: "",
      stderr: "Starting local login server on http://localhost:1455.\n",
      code: null,
      timedOut: false,
      aborted: true,
      durationMs: 1,
    }));
    const p = new RuntimeProvisioner({ managedDir: path.join(dir, "none"), runtime: rt, env: { PATH: binDir }, platform: "darwin", arch: "arm64", includeWellKnown: false });
    await expect(p.login({}, { timeoutMs: 1_000 })).rejects.toMatchObject({ name: "ProviderError", errorClass: "cancelled" });
  });
  it("throws provider_missing when nothing is installed", async () => {
    const rt = new FakeRuntime(() => ({ stdout: "", stderr: "", code: 0, timedOut: false, aborted: false, durationMs: 1 }));
    const p = new RuntimeProvisioner({ managedDir: path.join(dir, "none2"), runtime: rt, env: { PATH: "" }, platform: "darwin", arch: "arm64", includeWellKnown: false });
    await expect(p.login()).rejects.toMatchObject({ errorClass: "provider_missing" });
  });
});

describe("install() — fake GitHub, real tar.gz, real checksum discipline", () => {
  it("downloads, verifies, extracts into current/, writes the manifest, reports ready", async () => {
    const fx = await buildPackageFixture();
    const managed = path.join(dir, "m-ok");
    const rt = new CliRuntime();
    const p = new RuntimeProvisioner({
      managedDir: managed,
      runtime: rt,
      fetchImpl: makeFetcher(fx),
      env: { PATH: "" },
      platform: "darwin",
      arch: "arm64",
      apiBase: "http://fake",
      includeWellKnown: false,
    });
    const events: string[] = [];
    const { status, manifest } = await p.install((pr) => events.push(pr.phase));
    expect([...new Set(events)]).toEqual(["resolve", "download", "checksum", "extract", "finalize"]);
    expect(manifest).toMatchObject({ version: "9.9.9", asset: fx.asset, sha256: fx.sha256 });
    const files = await listFiles(managed);
    expect(files).toContain(path.join("current", "bin", "codex"));
    expect(files).toContain(path.join("current", "codex-package.json"));
    expect(files).toContain("managed.json");
    // a managed install must be detected as the runtime source even with an empty PATH
    const det = await resolveCodexBin({ env: { PATH: "" }, managedDir: managed, platform: "darwin", includeWellKnown: false });
    expect(det).toEqual({ source: "managed", bin: path.join(managed, "current", "bin", "codex") });
    // the fake binary answers --version (the fixture script prints codex-cli 9.9.9)
    expect(status.version).toBe("9.9.9");
  });

  it("checksum mismatch aborts and leaves no current/ (never install unverified bytes)", async () => {
    const fx = await buildPackageFixture();
    const managed = path.join(dir, "m-bad");
    const rt = new CliRuntime();
    const p = new RuntimeProvisioner({
      managedDir: managed,
      runtime: rt,
      fetchImpl: makeFetcher(fx, { corruptSums: true }),
      env: { PATH: "" },
      platform: "darwin",
      arch: "arm64",
      apiBase: "http://fake",
      includeWellKnown: false,
    });
    await expect(p.install()).rejects.toMatchObject({ errorClass: "unknown" });
    const files = await listFiles(managed).catch(() => [] as string[]);
    expect(files.filter((f) => f.startsWith("current"))).toHaveLength(0);
    expect(files.some((f) => f.endsWith(".tar.gz"))).toBe(false); // no partial archive left behind
  });

  it("an existing install survives a failed upgrade (atomic swap)", async () => {
    const fx = await buildPackageFixture();
    const managed = path.join(dir, "m-upgrade");
    mkdirSync(path.join(managed, "current", "bin"), { recursive: true });
    writeFileSync(path.join(managed, "current", "bin", "codex"), "#!/bin/sh\necho codex-cli 1.2.3\n", { mode: 0o755 });
    const rt = new CliRuntime();
    const p = new RuntimeProvisioner({
      managedDir: managed,
      runtime: rt,
      fetchImpl: makeFetcher(fx, { corruptSums: true }),
      env: { PATH: "" },
      platform: "darwin",
      arch: "arm64",
      apiBase: "http://fake",
      includeWellKnown: false,
    });
    await expect(p.install()).rejects.toBeInstanceOf(ProviderError);
    const det = await resolveCodexBin({ env: { PATH: "" }, managedDir: managed, platform: "darwin", includeWellKnown: false });
    expect(det.source).toBe("managed"); // old binary still there
  });
});

// ---- D3 hardening: origin check, parseSum format, recovery, serialization, abort ----

describe("extractAuthUrl (strict origin — substring matches are an injection vector)", () => {
  const realUrl = () =>
    "https://auth.openai.com/oauth/authorize?response_type=code&code_challenge=xyz&state=s";
  it("accepts the real auth host", () => {
    expect(extractAuthUrl(`navigate to this URL:\n${realUrl()}`)).toBe(realUrl());
  });
  it("REJECTS lookalikes that merely contain the host elsewhere in the URL", () => {
    expect(extractAuthUrl("https://evil.com/?next=auth.openai.com")).toBeNull();
    expect(extractAuthUrl("https://auth.openai.com.evil.com/oauth")).toBeNull();
    expect(extractAuthUrl("https://evil.com/https://auth.openai.com")).toBeNull();
  });
  it("keeps scanning when an earlier line carries a hostile URL", () => {
    const text = `https://evil.com/?x=auth.openai.com\n${realUrl()}`;
    expect(extractAuthUrl(text)).toBe(realUrl());
  });
});

describe("parseSum (GNU sha256sum line format: hash, space, mode char, name)", () => {
  const h = "a".repeat(64);
  it("parses text-mode lines (space) and binary-mode lines (*)", () => {
    expect(parseSum(`${h}  codex-package-aarch64-apple-darwin.tar.gz\n`, "codex-package-aarch64-apple-darwin.tar.gz")).toBe(h);
    expect(parseSum(`${h} *codex-package-x86_64-pc-windows-msvc.tar.gz`, "codex-package-x86_64-pc-windows-msvc.tar.gz")).toBe(h);
  });
  it("ignores other assets' lines and garbage", () => {
    expect(parseSum(`${h}  other-asset.tar.gz\nnot a sum line`, "codex-package-aarch64-apple-darwin.tar.gz")).toBeNull();
  });
});

describe("codexPackageAsset refuses unmapped platforms instead of guessing musl", () => {
  it("throws capability_unsupported for an untested platform", () => {
    expect(() => codexPackageAsset("freebsd" as NodeJS.Platform, "x64")).toThrowError(/no codex package mapping/);
  });
});

describe("managed swap recovery (the crash window between the two renames)", () => {
  it("detect() restores current/ from .old when a swap was interrupted", async () => {
    const managed = path.join(dir, "m-recover");
    mkdirSync(path.join(managed, ".old", "bin"), { recursive: true });
    writeFileSync(path.join(managed, ".old", "bin", "codex"), "#!/bin/sh\n", { mode: 0o755 });
    const det = await resolveCodexBin({ env: { PATH: "" }, managedDir: managed, platform: "darwin", includeWellKnown: false });
    expect(det).toEqual({ source: "managed", bin: path.join(managed, "current", "bin", "codex") });
    expect(await listFiles(managed)).not.toContain(path.join(".old", "bin", "codex")); // .old consumed
  });
  it("an upgrade REPLACES the old binary (content, not just presence)", async () => {
    const fx = await buildPackageFixture();
    const managed = path.join(dir, "m-upgrade2");
    mkdirSync(path.join(managed, "current", "bin"), { recursive: true });
    writeFileSync(path.join(managed, "current", "bin", "codex"), "#!/bin/sh\necho codex-cli 1.2.3\n", { mode: 0o755 });
    const p = new RuntimeProvisioner({
      managedDir: managed,
      runtime: new CliRuntime(),
      fetchImpl: makeFetcher(fx),
      env: { PATH: "" },
      platform: "darwin",
      arch: "arm64",
      apiBase: "http://fake",
      includeWellKnown: false,
    });
    const { status } = await p.install();
    expect(status.version).toBe("9.9.9"); // the NEW binary answers --version
    const det = await resolveCodexBin({ env: { PATH: "" }, managedDir: managed, platform: "darwin", includeWellKnown: false });
    expect(det.source).toBe("managed");
    const files = await listFiles(managed);
    expect(files).not.toContain(path.join(".old", "bin", "codex")); // .old cleaned up
  });
});

describe("install/login serialization (concurrent IPC must not double-fire)", () => {
  it("two concurrent installs share ONE release resolution", async () => {
    const fx = await buildPackageFixture();
    let latestCalls = 0;
    const counting = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/releases/latest")) latestCalls++;
      return makeFetcher(fx)(url);
    }) as unknown as typeof fetch;
    const managed = path.join(dir, "m-serial");
    const p = new RuntimeProvisioner({
      managedDir: managed,
      runtime: new CliRuntime(),
      fetchImpl: counting,
      env: { PATH: "" },
      platform: "darwin",
      arch: "arm64",
      apiBase: "http://fake",
      includeWellKnown: false,
    });
    const [a, b] = await Promise.all([p.install(), p.install()]);
    expect(latestCalls).toBe(1);
    expect(a.manifest.sha256).toBe(b.manifest.sha256);
  });
  it("install cancellation mid-download leaves no partial archive and no current/", async () => {
    const fx = await buildPackageFixture();
    const ac = new AbortController();
    const slow = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/pkg.tar.gz")) {
        await new Promise((r) => setTimeout(r, 400));
        if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
        return makeFetcher(fx)(url);
      }
      return makeFetcher(fx)(url);
    }) as unknown as typeof fetch;
    const managed = path.join(dir, "m-cancel");
    const p = new RuntimeProvisioner({
      managedDir: managed,
      runtime: new CliRuntime(),
      fetchImpl: slow,
      env: { PATH: "" },
      platform: "darwin",
      arch: "arm64",
      apiBase: "http://fake",
      includeWellKnown: false,
    });
    setTimeout(() => ac.abort(), 100);
    await expect(p.install(undefined, { signal: ac.signal })).rejects.toMatchObject({ errorClass: "cancelled" });
    const files = await listFiles(managed).catch(() => [] as string[]);
    expect(files.some((f) => f.endsWith(".tar.gz"))).toBe(false);
    expect(files.some((f) => f.startsWith("current"))).toBe(false);
  });
});

describe("login timeout is a TIMEOUT, not a cancel", () => {
  it("maps a timed-out login to errorClass timeout", async () => {
    const binDir = path.join(dir, "lg-timeout");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(binDir, "codex"), "#!/bin/sh\n", { mode: 0o755 });
    const rt = new FakeRuntime(() => ({
      stdout: "",
      stderr: "Starting local login server on http://localhost:1455.\n",
      code: null,
      timedOut: true,
      aborted: false,
      durationMs: 1,
    }));
    const p = new RuntimeProvisioner({ managedDir: path.join(dir, "none"), runtime: rt, env: { PATH: binDir }, platform: "darwin", arch: "arm64", includeWellKnown: false });
    await expect(p.login({}, { timeoutMs: 1_000 })).rejects.toMatchObject({ errorClass: "timeout" });
  });
  it("a hostile lookalike URL in the CLI output is never forwarded", async () => {
    const binDir = path.join(dir, "lg-evil");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(binDir, "codex"), "#!/bin/sh\n", { mode: 0o755 });
    const lines = [
      "Starting local login server on http://localhost:1455.",
      "If your browser did not open, navigate to this URL to authenticate:",
      "https://evil.com/?next=auth.openai.com",
      "https://auth.openai.com/oauth/authorize?code_challenge=abc&state=s",
    ];
    const rt = new FakeRuntime((o) => {
      if (o.args.join(" ") === "login") return "stderr-replay" as const;
      if (o.args[0] === "--version")
        return { stdout: "codex-cli 0.163.0\n", stderr: "", code: 0, timedOut: false, aborted: false, durationMs: 1 };
      return { stdout: "Logged in using ChatGPT\n", stderr: "", code: 0, timedOut: false, aborted: false, durationMs: 1 };
    }, lines);
    const p = new RuntimeProvisioner({ managedDir: path.join(dir, "none"), runtime: rt, env: { PATH: binDir }, platform: "darwin", arch: "arm64", includeWellKnown: false });
    const urls: string[] = [];
    await p.login({ onAuthUrl: (u) => urls.push(u) });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/^https:\/\/auth\.openai\.com\//);
  });
});

describe("CliRuntime.onStderrLine flushes the trailing partial line", () => {
  it("delivers a final line without a newline terminator", async () => {
    const scriptDir = path.join(dir, "flush");
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(path.join(scriptDir, "codex"), "#!/bin/sh\nprintf 'line one\\nno trailing newline' >&2\n", { mode: 0o755 });
    const rt = new CliRuntime();
    const lines: string[] = [];
    const res = await rt.run({ bin: path.join(scriptDir, "codex"), args: [], timeoutMs: 5_000, onStderrLine: (l) => lines.push(l) });
    expect(res.code).toBe(0);
    expect(lines).toEqual(["line one", "no trailing newline"]);
  });
});
