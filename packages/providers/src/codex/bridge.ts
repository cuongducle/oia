import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ProviderDiagnostic } from "../types.js";
import { ProviderError } from "../types.js";
import { CliRuntime, createScratchDir, removeScratchDir, writeTranscript } from "../cli/runtime.js";

/**
 * TP.2/TP.8 — the Codex bridge over the generic CliRuntime. One login, one channel, two uses:
 * text-only planner (`codex exec` + `--output-schema`) and `$imagegen` artwork.
 *
 * Bridge-level invariants on EVERY invocation (Stage-0 design, prompt-injection hardening):
 * - prompt travels via stdin (`codex exec -`) — never argv
 * - `--ignore-user-config` (auth still honored) — a personal config.toml cannot change
 *   planner quality/latency/cost between machines
 * - pinned `-m <model>` and reasoning effort — never inherit the user's default
 * - role-scoped sandbox: `read-only` for the planner, `workspace-write` scoped to the
 *   job scratch directory for the image path (which must write the PNG)
 *
 * Output location (spike S1, 2026-10-29): `-C` does NOT redirect image output; images land
 * at `~/.codex/generated_images/<session-uuid>/exec-<uuid>.png`. The session id comes from
 * `--json` `thread.started` events; the `File:` stdout marker is a cross-check hint only
 * (absent in the S1 run); the shared-tree mtime scan is a provenance-marked last resort.
 */

export interface CodexExecOptions {
  role: "planner" | "image";
  /** The full prompt text — travels via stdin. */
  prompt: string;
  /** Image role only: absolute paths of ASCII-named reference files (`-i`). */
  images?: string[];
  /** Planner only: absolute path of the JSON Schema file (`--output-schema`). */
  schemaFile?: string;
  /** Planner only: absolute path the final message is written to (`-o`). */
  lastMessageFile?: string;
  timeoutMs: number;
  signal?: AbortSignal;
  jobId: string;
}

export interface CodexExecResult {
  threadId: string | null;
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  aborted: boolean;
  durationMs: number;
  /** The role-scoped scratch dir (planner: empty -C dir; image: writable job dir). */
  scratchDir: string;
}

export const CODEX_DEFAULT_MODEL = process.env.CODEX_LLM_MODEL ?? "gpt-6-luna";
export const CODEX_IMAGE_DEFAULT_MODEL = process.env.CODEX_IMAGE_MODEL ?? "gpt-6-luna";
export const CODEX_REASONING_EFFORT = process.env.CODEX_REASONING_EFFORT ?? "low";

/** Parse a `--json` stream for the session id (thread.started) — deterministic, no mtime guessing. */
export function parseThreadId(stdout: string): string | null {
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const evt = JSON.parse(trimmed) as { type?: string; thread_id?: string };
      if (evt.type === "thread.started" && evt.thread_id) return evt.thread_id;
    } catch {
      /* non-JSON line — ignore */
    }
  }
  return null;
}

/**
 * Best-effort `File: [name](path)` stdout hint. Accepts POSIX, `C:\…`, and `C:/…` forms.
 * Format drift is real (absent in the S1 run) — this is a cross-check, never the locator.
 */
export function parseImagePathHint(stdout: string): string | null {
  const posix = stdout.match(/File:\s*\[[^\]]*\]\((\/[^\s)]+\.(?:png|jpg|jpeg|webp))\)/);
  if (posix) return posix[1];
  const winBack = stdout.match(/File:\s*\[[^\]]*\]\(([A-Za-z]:\\[^\s)]+\.(?:png|jpg|jpeg|webp))\)/);
  if (winBack) return winBack[1];
  const winFwd = stdout.match(/File:\s*\[[^\]]*\]\(([A-Za-z]:\/[^\s)]+\.(?:png|jpg|jpeg|webp))\)/);
  if (winFwd) return winFwd[1];
  return null;
}

/**
 * Tolerant standalone path parser used by tests and the fallback scan. Accepts:
 * /abs/path.png · C:\abs\path.png · C:/abs/path.png (case-insensitive drive letter).
 */
export function parseImagePath(text: string): string | null {
  return parseImagePathHint(text);
}

/** Locate the exec-*.png inside a session directory (spike S1's verified layout). */
export async function findSessionImage(threadId: string, rootOverride?: string): Promise<string | null> {
  const root = path.join(rootOverride ?? path.join(homedir(), ".codex", "generated_images"), threadId);
  let files: string[];
  try {
    files = await readdir(root);
  } catch {
    return null;
  }
  let best: { file: string; mtimeMs: number } | null = null;
  for (const f of files.filter((f) => /^exec-.*\.png$/i.test(f))) {
    const file = path.join(root, f);
    const s = await stat(file).catch(() => null);
    if (s && (!best || s.mtimeMs > best.mtimeMs)) best = { file, mtimeMs: s.mtimeMs };
  }
  return best?.file ?? null;
}

/** Last resort: newest image anywhere under generated_images (provenance-marked by the caller). */
export async function newestGeneratedImage(withinMs = 10 * 60_000, rootOverride?: string): Promise<string | null> {
  const root = rootOverride ?? path.join(homedir(), ".codex", "generated_images");
  let dirs: string[];
  try {
    dirs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => path.join(root, d.name));
  } catch {
    return null;
  }
  let best: { file: string; mtimeMs: number } | null = null;
  for (const dir of dirs) {
    const files = await readdir(dir).catch(() => [] as string[]);
    for (const f of files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f))) {
      const file = path.join(dir, f);
      const s = await stat(file).catch(() => null);
      if (s && Date.now() - s.mtimeMs <= withinMs && (!best || s.mtimeMs > best.mtimeMs)) best = { file, mtimeMs: s.mtimeMs };
    }
  }
  return best?.file ?? null;
}

/** Map codex exec failure output to the stable error classes. */
export function classifyCodexFailure(res: { code: number | null; stdout: string; stderr: string; timedOut: boolean; aborted: boolean }): ProviderError {
  const text = `${res.stdout}\n${res.stderr}`;
  if (res.aborted) return new ProviderError("cancelled", "codex run was cancelled", { provider: "codex" });
  if (res.timedOut) return new ProviderError("timeout", "codex run timed out", { provider: "codex" });
  if (/not logged in|login required|stored tokens.*invalid|401/i.test(text)) {
    return new ProviderError("not_logged_in", "codex is not logged in", { provider: "codex", detail: text.slice(0, 300) });
  }
  if (/rate.?limit|too many requests|429/i.test(text)) {
    return new ProviderError("rate_limited", "codex hit a rate limit", { provider: "codex", detail: text.slice(0, 300) });
  }
  if (/usage limit|quota|exceeded your|limit reached/i.test(text)) {
    return new ProviderError("quota_exceeded", "codex quota exhausted", { provider: "codex", detail: text.slice(0, 300) });
  }
  if (/content policy|safety|refus/i.test(text)) {
    return new ProviderError("content_refused", "codex refused the request", { provider: "codex", detail: text.slice(0, 300) });
  }
  if (/network|ENOTFOUND|ECONNREFUSED|fetch failed/i.test(text)) {
    return new ProviderError("network", "codex network failure", { provider: "codex", detail: text.slice(0, 300) });
  }
  return new ProviderError("unknown", `codex exited with code ${res.code}`, { provider: "codex", detail: text.slice(0, 300) });
}

export interface CodexBridgeOptions {
  bin?: string;
  /** Pinned for every invocation (invariant) — planner model. */
  model?: string;
  /** Pinned model for the image path. */
  imageModel?: string;
  reasoningEffort?: string;
  runtime?: CliRuntime;
}

export class CodexBridge {
  readonly runtime: CliRuntime;
  private readonly bin: string;
  private readonly model: string;
  private readonly imageModel: string;
  private readonly effort: string;
  private diagnosticCache: { at: number; diag: ProviderDiagnostic } | null = null;
  private static readonly DIAGNOSTIC_TTL_MS = 60_000; // TP.6: probe cached ~60 s

  constructor(opts: CodexBridgeOptions = {}) {
    this.runtime = opts.runtime ?? new CliRuntime();
    this.bin = opts.bin ?? process.env.CODEX_BIN ?? "codex";
    this.model = opts.model ?? CODEX_DEFAULT_MODEL;
    this.imageModel = opts.imageModel ?? CODEX_IMAGE_DEFAULT_MODEL;
    this.effort = opts.reasoningEffort ?? CODEX_REASONING_EFFORT;
  }

  /** Invariant flag set shared by both roles. */
  private baseArgs(model: string): string[] {
    return [
      "exec",
      "-", // prompt from stdin — user text never enters argv
      "--skip-git-repo-check",
      "--ignore-user-config",
      "--json",
      "-m", model,
      "-c", `model_reasoning_effort="${this.effort}"`,
    ];
  }

  async exec(opts: CodexExecOptions): Promise<CodexExecResult> {
    const scratchDir = await createScratchDir(`codex-${opts.role}`);
    const model = opts.role === "planner" ? this.model : this.imageModel;
    const args = this.baseArgs(model);
    if (opts.role === "planner") {
      // empty scratch dir as working root; the planner agent can never write state
      args.push("--sandbox", "read-only", "-C", scratchDir);
      if (opts.schemaFile) args.push("--output-schema", opts.schemaFile);
      if (opts.lastMessageFile) args.push("-o", opts.lastMessageFile);
    } else {
      // the image path must write the PNG — workspace-write scoped to the job scratch
      args.push("--sandbox", "workspace-write", "-C", scratchDir);
      for (const img of opts.images ?? []) args.push("-i", img);
    }

    const res = await this.runtime.run({
      bin: this.bin,
      args,
      stdin: opts.prompt,
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
      jobId: opts.jobId,
      cwd: scratchDir,
    });
    const out: CodexExecResult = {
      ...res,
      threadId: parseThreadId(res.stdout),
      scratchDir,
    };
    // failed runs clean their own scratch — no orphan dirs from aborted/errored jobs
    if (out.code !== 0 || out.timedOut || out.aborted) await removeScratchDir(scratchDir);
    return out;
  }

  /** Release the scratch dir after a run (planner always; image after bytes are read). */
  async cleanup(result: CodexExecResult): Promise<void> {
    await removeScratchDir(result.scratchDir);
  }

  /**
   * TP.6 — structured diagnostic: binary found / version / login state / last error.
   * Cached ~60 s so every request does not pay the cold `login status` round trip.
   */
  async diagnose(force = false): Promise<ProviderDiagnostic> {
    if (!force && this.diagnosticCache && Date.now() - this.diagnosticCache.at < CodexBridge.DIAGNOSTIC_TTL_MS) {
      return this.diagnosticCache.diag;
    }
    let diag: ProviderDiagnostic;
    try {
      const res = await this.runtime.run({ bin: this.bin, args: ["--version"], timeoutMs: 10_000 });
      if (res.code !== 0 && res.code !== null) {
        diag = { ok: false, errorClass: "provider_missing", binary: this.bin, detail: `--version exited ${res.code}` };
      } else {
        const m = res.stdout.match(/(\d+\.\d+\.\d+[^\s]*)/);
        const login = await this.runtime.run({ bin: this.bin, args: ["login", "status"], timeoutMs: 15_000 });
        const loggedIn = /Logged in/i.test(`${login.stdout}\n${login.stderr}`);
        diag = loggedIn
          ? { ok: true, binary: this.bin, version: m?.[1], loggedIn: true }
          : { ok: false, errorClass: "not_logged_in", binary: this.bin, version: m?.[1], loggedIn: false };
      }
    } catch (err) {
      const pe = ProviderError.from(err, "codex");
      diag = { ok: false, errorClass: pe.errorClass, binary: this.bin, detail: pe.message };
    }
    this.diagnosticCache = { at: Date.now(), diag };
    return diag;
  }

  /** Read the planner's plan.json from the -o file; classify failures. */
  async readPlanFile(file: string, res: CodexExecResult): Promise<string> {
    if (res.code !== 0 || res.timedOut || res.aborted) throw classifyCodexFailure(res);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      await writeTranscript(res.scratchDir.split("/").pop() ?? "unknown", {
        note: "plan.json missing after exec",
        stdoutTail: res.stdout.slice(-300),
      });
      throw new ProviderError("plan_parse_failed", "codex wrote no plan file", { provider: "codex" });
    }
    if (!raw.trim()) throw new ProviderError("plan_parse_failed", "codex plan file is empty", { provider: "codex" });
    return raw;
  }
}
