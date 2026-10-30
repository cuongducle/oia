import { access, chmod, constants, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { homedir } from "node:os";
import path from "node:path";
import { ProviderError } from "../types.js";
import { CliRuntime } from "./runtime.js";

/**
 * TP-D3 — RuntimeProvisioner: zero-terminal Codex runtime management.
 *
 * Spike findings baked into this code (2026-10-30, live-verified):
 * - S5: openai/codex is Apache-2.0; official releases ship `codex-package-<target>.tar.gz`
 *   (self-contained: bin/codex + codex-path/rg + codex-resources + codex-package.json)
 *   and a `codex-package_SHA256SUMS` asset covering exactly those names. The plain
 *   `codex-<target>.tar.gz` assets have NO published checksum → we always install the
 *   checksummed `codex-package-*` variant. Verified end to end on darwin-arm64
 *   (166 MB download, sha256 matched the published sums line).
 * - S6: `codex login` prints its auth URL to STDERR while still running
 *   ("Starting local login server on http://localhost:1455." + the auth URL), opens the
 *   browser itself, exits 0 on success. HAZARD (live-verified): the flow rotates/clears
 *   the saved session at START — killing `codex login` mid-flow leaves the user logged
 *   out. Cancel is therefore an explicit, warned action — never a cleanup side effect.
 *
 * Detection order (Q4, revised D12): CODEX_BIN env → BUNDLED binary shipped with the
 * app (resources/codex — the pair this build was tested with) → PATH (+ well-known
 * dirs: GUI apps do not inherit the shell PATH) → managed install at
 * <managedDir>/current/bin/codex.
 * Guided download is an explicit user action from the runtime panel — never automatic.
 *
 * Swap discipline (D3 hardening): staging extract → rename current→.old → rename
 * staging→current, with (a) a locked-binary precheck BEFORE anything is moved,
 * (b) best-effort restore on the second rename's failure, and (c) detect()-time
 * recovery when a crash fell into the window between the two renames (.old exists,
 * current missing). "Atomic" is a lie for two renames on a directory — this is the
 * honest version: bounded window + recovery.
 */

export type RuntimeSource = "env" | "bundled" | "path" | "managed";
export type RuntimeState = "ready" | "not_logged_in" | "missing";
export type LoginMethod = "chatgpt" | "api-key";

export interface RuntimeDetection {
  source: RuntimeSource | null;
  bin: string | null;
}

export interface RuntimeStatus {
  state: RuntimeState;
  source: RuntimeSource | null;
  bin: string | null;
  version?: string;
  loggedIn?: boolean;
  loginMethod?: LoginMethod | null;
  detail?: string;
}

export type InstallPhase = "resolve" | "download" | "checksum" | "extract" | "finalize";
export interface InstallProgress {
  phase: InstallPhase;
  /** 0..100 when the phase reports one (download only). */
  pct?: number;
  detail?: string;
}

export interface ManagedManifest {
  version: string;
  target: string;
  asset: string;
  installedAt: string;
  sha256: string;
}

export interface LoginHandlers {
  /** The auth URL as printed by the CLI — origin-checked against the allowlist. */
  onAuthUrl?: (url: string) => void;
  onPhase?: (phase: "starting" | "url" | "exchanging", detail?: string) => void;
}

const GH_REPO = "openai/codex";
const SUMS_ASSET = "codex-package_SHA256SUMS";
/** Strict-origin allowlist for URLs we will hand to the system browser. */
const AUTH_HOSTS = new Set(["auth.openai.com", "chatgpt.com"]);
const STATUS_CACHE_MS = 30_000;

/** The checksummed distribution package for a platform/arch (S5). */
export function codexPackageAsset(platform: NodeJS.Platform, arch: string): string {
  if (platform === "darwin") {
    return `codex-package-${arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin.tar.gz`;
  }
  if (platform === "win32") {
    return `codex-package-${arch === "arm64" ? "aarch64" : "x86_64"}-pc-windows-msvc.tar.gz`;
  }
  if (platform === "linux") {
    return `codex-package-${arch === "arm64" ? "aarch64" : "x86_64"}-unknown-linux-musl.tar.gz`;
  }
  // never silently map an untested platform to a musl target (a wrong binary fails
  // much later and far away from the choice that caused it)
  throw new ProviderError("capability_unsupported", `no codex package mapping for platform ${String(platform)}`);
}

/**
 * Extract an auth URL from CLI output with a STRICT host check. Substring matching
 * (`url.includes("auth.openai.com")`) would let `https://evil.com/?x=auth.openai.com`
 * through — this parses the URL and compares the hostname exactly.
 */
export function extractAuthUrl(text: string): string | null {
  for (const m of text.matchAll(/https?:\/\/\S+/g)) {
    try {
      if (AUTH_HOSTS.has(new URL(m[0]).hostname)) return m[0];
    } catch {
      /* not a parseable URL — keep scanning */
    }
  }
  return null;
}

/** GUI processes do not inherit the interactive shell PATH — probe the usual suspects too. */
function wellKnownBinDirs(platform: NodeJS.Platform): string[] {
  if (platform === "win32") return [];
  const home = homedir();
  return ["/opt/homebrew/bin", "/usr/local/bin", path.join(home, ".local/bin"), path.join(home, ".volta/bin")];
}

async function canExecute(file: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    await access(file, platform === "win32" ? constants.F_OK : constants.F_OK | constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export interface DetectOptions {
  env?: NodeJS.ProcessEnv;
  /** D12 — codex shipped INSIDE the app package (read-only; same layout as a managed
   *  install: <bundledDir>/current/bin/codex). Beats PATH: the bundled pair is the one
   *  this build was tested against (the OpenAI-SDK philosophy). */
  bundledDir?: string;
  managedDir?: string;
  platform?: NodeJS.Platform;
  extraPaths?: string[];
  /** Probe well-known install dirs (GUI apps miss the shell PATH). Default true. */
  includeWellKnown?: boolean;
}

/**
 * Pure binary resolution, no subprocesses. Order: env override → bundled (D12) →
 * PATH scan (with well-known dirs + extras) → managed install. Returns { source: null }
 * when absent. Recovers an interrupted managed swap (.old present, current missing)
 * best-effort.
 */
export async function resolveCodexBin(opts: DetectOptions = {}): Promise<RuntimeDetection> {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const isWin = platform === "win32";
  const names = isWin ? ["codex.cmd", "codex.exe", "codex.bat"] : ["codex"];

  if (env.CODEX_BIN) {
    if (await canExecute(env.CODEX_BIN, platform)) return { source: "env", bin: env.CODEX_BIN };
  }

  if (opts.bundledDir) {
    const bundled = path.join(opts.bundledDir, "current", "bin", isWin ? "codex.exe" : "codex");
    if (await canExecute(bundled, platform)) return { source: "bundled", bin: bundled };
  }

  const pathVar = env.PATH ?? "";
  const dirs = [
    ...pathVar.split(isWin ? ";" : ":").filter(Boolean),
    ...(opts.includeWellKnown === false ? [] : wellKnownBinDirs(platform)),
    ...(opts.extraPaths ?? []),
  ];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (await canExecute(candidate, platform)) return { source: "path", bin: candidate };
    }
  }

  if (opts.managedDir) {
    await recoverManagedSwap(opts.managedDir).catch(() => {}); // best-effort, never blocks detection
    const managed = managedBin(opts.managedDir, platform);
    if (await canExecute(managed, platform)) return { source: "managed", bin: managed };
  }
  return { source: null, bin: null };
}

function managedBin(managedDir: string, platform: NodeJS.Platform): string {
  return path.join(managedDir, "current", "bin", platform === "win32" ? "codex.exe" : "codex");
}

/** Crash-window recovery: a swap interrupted between the two renames left .old behind. */
async function recoverManagedSwap(managedDir: string): Promise<void> {
  const current = path.join(managedDir, "current");
  const old = path.join(managedDir, ".old");
  const hasCurrent = await stat(current).catch(() => null);
  const hasOld = await stat(old).catch(() => null);
  if (!hasCurrent && hasOld?.isDirectory()) {
    await rename(old, current);
  }
}

export interface ProvisionerOptions {
  /** Root for the managed install (Electron userData/codex on the desktop). */
  managedDir: string;
  /** D12 — codex shipped inside the app package; probed before PATH (see DetectOptions). */
  bundledDir?: string;
  env?: NodeJS.ProcessEnv;
  runtime?: CliRuntime;
  fetchImpl?: typeof fetch;
  platform?: NodeJS.Platform;
  arch?: string;
  extraPaths?: string[];
  /** Test override for the GitHub API base. */
  apiBase?: string;
  includeWellKnown?: boolean;
}

export class RuntimeProvisioner {
  private readonly runtime: CliRuntime;
  private readonly fetchImpl: typeof fetch;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly apiBase: string;
  private readonly opts: ProvisionerOptions;
  private statusCache: { at: number; status: RuntimeStatus } | null = null;
  private statusInFlight: Promise<RuntimeStatus> | null = null;
  private installInFlight: Promise<{ status: RuntimeStatus; manifest: ManagedManifest }> | null = null;
  private loginInFlight: Promise<{ ok: boolean; status: RuntimeStatus; detail?: string }> | null = null;

  constructor(opts: ProvisionerOptions) {
    this.opts = opts;
    this.runtime = opts.runtime ?? new CliRuntime();
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.platform = opts.platform ?? process.platform;
    this.arch = opts.arch ?? process.arch;
    this.apiBase = opts.apiBase ?? "https://api.github.com";
  }

  detect(): Promise<RuntimeDetection> {
    return resolveCodexBin({
      env: this.opts.env,
      bundledDir: this.opts.bundledDir,
      managedDir: this.opts.managedDir,
      platform: this.platform,
      extraPaths: this.opts.extraPaths,
      includeWellKnown: this.opts.includeWellKnown,
    });
  }

  /** Health + version + login state in one probe (cached ~30 s; force to re-probe). */
  async status(opts: { force?: boolean } = {}): Promise<RuntimeStatus> {
    if (!opts.force && this.statusCache && Date.now() - this.statusCache.at < STATUS_CACHE_MS) {
      return this.statusCache.status;
    }
    // in-flight dedup: concurrent callers share one probe, not N subprocess spawns
    this.statusInFlight ??= this.probeStatus().finally(() => {
      this.statusInFlight = null;
    });
    return this.statusInFlight;
  }

  private async probeStatus(): Promise<RuntimeStatus> {
    const det = await this.detect();
    if (!det.bin) {
      const status: RuntimeStatus = { state: "missing", source: null, bin: null };
      this.statusCache = { at: Date.now(), status };
      return status;
    }
    let version: string | undefined;
    try {
      const res = await this.runtime.run({ bin: det.bin, args: ["--version"], timeoutMs: 10_000 });
      version = res.stdout.match(/(\d+\.\d+\.\d+[^\s]*)/)?.[1];
    } catch {
      /* binary exists but would not run — surfaced via login probe below */
    }
    const login = await this.probeLogin(det.bin);
    const status: RuntimeStatus = {
      state: login.loggedIn ? "ready" : "not_logged_in",
      source: det.source,
      bin: det.bin,
      version,
      loggedIn: login.loggedIn,
      loginMethod: login.method,
      detail: login.detail,
    };
    this.statusCache = { at: Date.now(), status };
    return status;
  }

  private async probeLogin(bin: string): Promise<{ loggedIn: boolean; method?: LoginMethod; detail?: string }> {
    try {
      const res = await this.runtime.run({ bin, args: ["login", "status"], timeoutMs: 15_000 });
      const text = `${res.stdout}\n${res.stderr}`;
      if (/using ChatGPT/i.test(text)) return { loggedIn: true, method: "chatgpt" };
      if (/using API key/i.test(text)) return { loggedIn: true, method: "api-key" };
      return { loggedIn: false, detail: text.trim().split("\n")[0] || undefined };
    } catch (err) {
      return { loggedIn: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * S6 — the in-app `codex login` wrapper. The CLI opens the browser itself and prints
   * the auth URL to stderr; we forward it (origin-checked — see extractAuthUrl) and
   * wait for the process to finish. Default timeout is generous (5 min) on purpose: the
   * session is already rotated when this flow starts, so killing it early only loses
   * more. Concurrent calls share the in-flight flow (two `codex login` processes would
   * race each other's session rotation).
   */
  login(
    handlers: LoginHandlers = {},
    opts: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<{ ok: boolean; status: RuntimeStatus; detail?: string }> {
    this.loginInFlight ??= this.doLogin(handlers, opts).finally(() => {
      this.loginInFlight = null;
    });
    return this.loginInFlight;
  }

  private async doLogin(
    handlers: LoginHandlers,
    opts: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<{ ok: boolean; status: RuntimeStatus; detail?: string }> {
    const det = await this.detect();
    if (!det.bin) throw new ProviderError("provider_missing", "codex binary not found — install first");
    let urlSent = false;
    const res = await this.runtime.run({
      bin: det.bin,
      args: ["login"],
      timeoutMs: opts.timeoutMs ?? 5 * 60_000,
      signal: opts.signal,
      jobId: `codex-login-${randomUUID().slice(0, 8)}`,
      onStderrLine: (line) => {
        if (/starting local login server/i.test(line)) handlers.onPhase?.("starting", line.trim());
        const url = extractAuthUrl(line);
        if (url && !urlSent) {
          urlSent = true;
          handlers.onPhase?.("url");
          handlers.onAuthUrl?.(url);
        }
      },
    });
    const status = await this.status({ force: true });
    if (res.aborted) {
      // the session was rotated at flow START — an interrupted login means logged out
      throw new ProviderError("cancelled", "codex login was interrupted — the previous session was already rotated; log in again", {
        detail: res.stderr.slice(0, 300),
      });
    }
    if (res.timedOut) {
      throw new ProviderError("timeout", "codex login timed out after 5 minutes", { detail: res.stderr.slice(0, 300) });
    }
    return {
      ok: res.code === 0 && status.loggedIn === true,
      status,
      detail: res.code === 0 ? undefined : res.stderr.trim().split("\n").slice(-1)[0] || undefined,
    };
  }

  async logout(): Promise<RuntimeStatus> {
    const det = await this.detect();
    if (!det.bin) throw new ProviderError("provider_missing", "codex binary not found");
    const res = await this.runtime.run({ bin: det.bin, args: ["logout"], timeoutMs: 30_000 });
    if (res.code !== 0 && !/not logged in/i.test(res.stderr)) {
      throw new ProviderError("unknown", `codex logout exited ${res.code}`, { detail: res.stderr.slice(0, 300) });
    }
    return this.status({ force: true });
  }

  /**
   * S5 — guided download of the official checksummed package into the managed dir.
   * Layout kept intact (bin/ + codex-path/ + codex-resources/) so relative lookups
   * inside the package keep working. Download (abortable mid-flight) → sha256 against
   * the published sums (streamed — a 166 MB archive never sits whole in the heap) →
   * tar extract (bsdtar ships with Win10+, GNU tar everywhere else) → recoverable
   * swap of `current/`. Concurrent calls share one install. On any failure the
   * previous install survives (locked-binary precheck + best-effort restore + detect-
   * time recovery from `.old`).
   */
  install(
    onProgress?: (p: InstallProgress) => void,
    opts: { signal?: AbortSignal; tag?: string } = {},
  ): Promise<{ status: RuntimeStatus; manifest: ManagedManifest }> {
    this.installInFlight ??= this.doInstall(onProgress, opts).finally(() => {
      this.installInFlight = null;
    });
    return this.installInFlight;
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new ProviderError("cancelled", "install cancelled");
  }

  private async doInstall(
    onProgress?: (p: InstallProgress) => void,
    opts: { signal?: AbortSignal; tag?: string } = {},
  ): Promise<{ status: RuntimeStatus; manifest: ManagedManifest }> {
    const asset = codexPackageAsset(this.platform, this.arch);
    onProgress?.({ phase: "resolve" });
    // D12: an explicit tag pins the release (bundle fetch); default stays rolling
    // latest for the in-app guided install.
    const rel = await this.resolveRelease(opts.tag ?? "latest", opts.signal);
    const assetMeta = rel.assets[asset];
    const sumsMeta = rel.assets[SUMS_ASSET];
    if (!assetMeta || !sumsMeta) {
      throw new ProviderError("unknown", `release ${rel.tag} has no ${asset} or ${SUMS_ASSET} asset`);
    }
    this.throwIfAborted(opts.signal);

    onProgress?.({ phase: "download", pct: 0 });
    const sumsText = await this.downloadText(sumsMeta.url, opts.signal);
    const expected = parseSum(sumsText, asset);
    if (!expected) {
      throw new ProviderError("unknown", `${SUMS_ASSET} has no entry for ${asset}`);
    }

    const tmpRoot = path.join(this.opts.managedDir, ".install");
    await rm(tmpRoot, { recursive: true, force: true });
    await mkdir(tmpRoot, { recursive: true });
    const archive = path.join(tmpRoot, "package.tar.gz");
    try {
      await this.downloadFile(
        assetMeta.url,
        archive,
        assetMeta.size,
        (received, total) =>
          onProgress?.({ phase: "download", pct: total ? Math.floor((received / total) * 100) : undefined }),
        opts.signal,
      );
      this.throwIfAborted(opts.signal);

      onProgress?.({ phase: "checksum" });
      const actual = await sha256File(archive);
      if (actual !== expected) {
        throw new ProviderError("unknown", `checksum mismatch for ${asset}: expected ${expected}, got ${actual}`, {
          detail: { reason: "checksum_mismatch", asset },
        });
      }
      this.throwIfAborted(opts.signal);

      onProgress?.({ phase: "extract" });
      const staging = path.join(tmpRoot, "pkg");
      await mkdir(staging, { recursive: true });
      // bsdtar (Windows 10+, macOS) and GNU tar both handle tar.gz; Windows ships no unzip
      const ex = await this.runtime.run({
        bin: "tar",
        args: ["-xzf", archive, "-C", staging],
        timeoutMs: 5 * 60_000,
        signal: opts.signal,
        jobId: "codex-install-extract",
      });
      if (ex.code !== 0) {
        throw new ProviderError("unknown", `tar extract exited ${ex.code}`, { detail: ex.stderr.slice(0, 300) });
      }
      this.throwIfAborted(opts.signal);

      onProgress?.({ phase: "finalize" });
      const pkg = await readPackageManifest(staging); // codex-package.json (version, entrypoint)
      const entry = pkg?.entrypoint ?? "bin/codex";
      const entryAbs = path.join(staging, entry);
      if (!(await stat(entryAbs).catch(() => null))) {
        throw new ProviderError("unknown", `package layout unexpected: no ${entry}`);
      }
      await this.swapCurrent(staging);
      if (this.platform !== "win32") await chmod(managedBin(this.opts.managedDir, this.platform), 0o755).catch(() => {});

      const manifest: ManagedManifest = {
        version: pkg?.version ?? rel.tag.replace(/^rust-v/, ""),
        target: asset.replace(/^codex-package-/, "").replace(/\.tar\.gz$/, ""),
        asset,
        installedAt: new Date().toISOString(),
        sha256: expected,
      };
      await writeFile(path.join(this.opts.managedDir, "managed.json"), JSON.stringify(manifest, null, 2), "utf8");
      const status = await this.status({ force: true });
      return { status, manifest };
    } catch (err) {
      // ENOSPC and friends deserve a name, not a raw syscall string
      if (err instanceof Error && /ENOSPC/i.test(err.message)) {
        throw new ProviderError("unknown", "not enough disk space to install codex (needs ~1 GB free)", {
          detail: { reason: "disk_full" },
        });
      }
      throw err;
    } finally {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Recoverable swap: precheck for a locked current/ FIRST (nothing moved yet if the
   * binary is in use), then current→.old, staging→current, drop .old. If the second
   * rename fails we try to restore .old immediately; if THAT also fails (crash window),
   * detect() recovers from .old on the next call.
   */
  private async swapCurrent(staging: string): Promise<void> {
    const managedDir = this.opts.managedDir;
    const current = path.join(managedDir, "current");
    const old = path.join(managedDir, ".old");
    await rm(old, { recursive: true, force: true });
    await recoverManagedSwap(managedDir); // never stack swaps on an unrecovered one
    const hasCurrent = await stat(current).catch(() => null);
    if (hasCurrent) {
      try {
        await rename(current, old);
      } catch (err) {
        // EBUSY/EPERM: a codex process is running off current/ — abort with current intact
        throw new ProviderError("unknown", "the installed codex is busy (a job may be running) — close it and retry", {
          detail: { reason: "binary_busy", cause: err instanceof Error ? err.message : String(err) },
        });
      }
    }
    try {
      await rename(staging, current);
    } catch (err) {
      await rename(old, current).catch(() => {}); // best-effort restore; detect() recovers otherwise
      throw new ProviderError("unknown", `failed to finalize the codex install: ${err instanceof Error ? err.message : String(err)}`);
    }
    await rm(old, { recursive: true, force: true });
  }

  /** Latest release: { tag, assets: name → { url, size } } (unauthenticated API — a one-shot install is within rate limits). */
  /** "latest" or an explicit release tag (D12 bundle pinning). */
  private async resolveRelease(ref: string, signal?: AbortSignal): Promise<{ tag: string; assets: Record<string, { url: string; size: number }> }> {
    const endpoint = ref === "latest" ? "releases/latest" : `releases/tags/${encodeURIComponent(ref)}`;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.apiBase}/repos/${GH_REPO}/${endpoint}`, {
        headers: { accept: "application/vnd.github+json" },
        signal,
      });
    } catch (err) {
      throw new ProviderError("network", `cannot reach the release API: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.status === 403 || res.status === 429) {
      throw new ProviderError("rate_limited", "GitHub API rate limit hit — wait a minute and retry the install", {
        detail: { reason: "github_rate_limited" },
      });
    }
    if (res.status === 404) {
      throw new ProviderError("unknown", `codex release "${ref}" not found`, { detail: { reason: "release_not_found", ref } });
    }
    if (!res.ok) throw new ProviderError("network", `GitHub API ${res.status} for ${endpoint}`);
    const json = (await res.json()) as {
      tag_name?: string;
      assets?: Array<{ name: string; browser_download_url: string; size: number }>;
    };
    if (!json.tag_name || !json.assets?.length) throw new ProviderError("unknown", "release payload had no tag/assets");
    const assets: Record<string, { url: string; size: number }> = {};
    for (const a of json.assets) assets[a.name] = { url: a.browser_download_url, size: a.size };
    return { tag: json.tag_name, assets };
  }

  private async downloadText(url: string, signal?: AbortSignal): Promise<string> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { signal });
    } catch (err) {
      throw new ProviderError("network", `download failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) throw new ProviderError("network", `download failed ${res.status}: ${url}`);
    return res.text();
  }

  private async downloadFile(
    url: string,
    dest: string,
    total: number,
    onBytes: (received: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { signal });
    } catch (err) {
      if (signal?.aborted) throw new ProviderError("cancelled", "install cancelled during download");
      throw new ProviderError("network", `download failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok || !res.body) throw new ProviderError("network", `download failed ${res.status}: ${url}`);
    const len = Number(res.headers.get("content-length") ?? total);
    let received = 0;
    let lastTick = 0;
    const source = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
    const onData = (chunk: Buffer): void => {
      received += chunk.length;
      if (Date.now() - lastTick > 200) {
        lastTick = Date.now();
        onBytes(received, len);
      }
    };
    source.on("data", onData);
    const onAbort = (): void => {
      source.destroy(new ProviderError("cancelled", "install cancelled during download"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      await pipeline(source, createWriteStream(dest));
      onBytes(received, len);
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
    const s = await stat(dest);
    if (len && s.size !== len) {
      throw new ProviderError("network", `truncated download: ${s.size}/${len} bytes for ${path.basename(dest)}`);
    }
  }
}

/**
 * GNU sha256sum line format: `<64 hex> <mode><name>` where mode is ' ' (text) or
 * '*' (binary). The mode is exactly one character between the space and the name.
 */
export function parseSum(sums: string, asset: string): string | null {
  for (const line of sums.split("\n")) {
    const m = line.trim().match(/^([0-9a-f]{64}) ([ *])(.+)$/);
    if (m && m[3].trim() === asset) return m[1];
  }
  return null;
}

/** Streaming sha256 — the ~166 MB archive is hashed in chunks, never held whole. */
async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function readPackageManifest(dir: string): Promise<{ version?: string; entrypoint?: string } | null> {
  try {
    const raw = await readFile(path.join(dir, "codex-package.json"), "utf8");
    return JSON.parse(raw) as { version?: string; entrypoint?: string };
  } catch {
    return null;
  }
}
