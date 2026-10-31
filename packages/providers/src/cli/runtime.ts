import { spawn } from "cross-spawn";
import kill from "tree-kill";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { ProviderError } from "../types.js";

/**
 * TP.8 — generic CliRuntime: provider-agnostic process management for any external
 * CLI tool (Codex today; rembg is an existing candidate consumer).
 *
 * Disciplines (bridge-level invariants, Stage 0 design):
 * - argument-array spawn; user text NEVER enters argv (BatBadBut / CVE-2024-27980)
 * - timeout ⇒ process-tree termination (tree-kill; POSIX groups via detached)
 * - AbortSignal ⇒ same process-tree kill, result flagged `aborted`
 * - per-job scratch directories (ASCII UUID names)
 * - transcript capture with prompt/image content redacted by default (hashes only, 24 h retention)
 *
 * Knows nothing about Codex — the Codex bridge sits on top (codex/bridge.ts).
 * Output is collected whole and returned on close; no streaming line API
 * (a chunk boundary can split a JSON line — parse from the completed stdout).
 */

export interface CliRunOptions {
  bin: string;
  args: string[];
  /** Prompt text travels via stdin — never argv. */
  stdin?: string;
  cwd?: string;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Correlation id for transcripts (the shared jobId). */
  jobId?: string;
  env?: NodeJS.ProcessEnv;
  /**
   * TP-D3/S6 — incremental stderr OBSERVATION for interactive child flows (the codex
   * login server prints its auth URL before the process exits). Observability only:
   * result parsing still happens on the completed stdout/stderr, never on these lines
   * (a chunk boundary can split a line — the runtime buffers and splits on \n here).
   */
  onStderrLine?: (line: string) => void;
}

export interface CliRunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  aborted: boolean;
  durationMs: number;
}

const TRANSCRIPT_TTL_MS = 24 * 60 * 60 * 1000;

async function transcriptsRoot(): Promise<string> {
  const root = path.join(tmpdir(), "oia", "transcripts");
  await mkdir(root, { recursive: true });
  return root;
}

/** Content redaction: keep the shape, drop the bytes (sha256 + length only). */
function redact(text: string | undefined): { sha256: string; length: number } | null {
  if (text === undefined) return null;
  return { sha256: createHash("sha256").update(text).digest("hex").slice(0, 16), length: text.length };
}

/** Transcript ring: one JSON line per run, swept for >24 h on write. */
export async function writeTranscript(jobId: string, entry: Record<string, unknown>): Promise<void> {
  try {
    const root = await transcriptsRoot();
    for (const f of await readdir(root)) {
      const file = path.join(root, f);
      const s = await stat(file).catch(() => null);
      if (s && Date.now() - s.mtimeMs > TRANSCRIPT_TTL_MS) await rm(file, { force: true });
    }
    await writeFile(path.join(root, `${jobId}.jsonl`), `${JSON.stringify({ t: Date.now(), ...entry })}\n`, { flag: "a" });
  } catch {
    /* transcripts are diagnostics — never fail a run on them */
  }
}

/** Per-job scratch directory under tmp: /oia/<scope>-<uuid> (ASCII only). */
export async function createScratchDir(scope: string): Promise<string> {
  const dir = path.join(tmpdir(), "oia", `${scope}-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function removeScratchDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

/** ASCII UUID filename helper (reference files never carry user text in their names). */
export function asciiUuid(): string {
  return randomUUID();
}

/**
 * Kill a process and all its descendants. Windows runs `taskkill /T /F` itself
 * (what tree-kill does) but with windowsHide — tree-kill's exec() flashes a console
 * window from a GUI app on every cancel. POSIX keeps tree-kill (process groups).
 */
export function killTree(pid: number): void {
  if (process.platform === "win32") {
    const tk = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    tk.on("error", () => {}); // the root already exited — nothing left to kill
    return;
  }
  kill(pid, "SIGKILL");
}

export class CliRuntime {
  /**
   * Spawn `bin args` with stdin prompt support, timeout and abort ⇒ process-tree kill.
   * Never throws for process-level outcomes — inspect the result (timedOut/aborted/code)
   * and map to error classes at the bridge level. Throws ProviderError("provider_missing")
   * only when the binary cannot be spawned (ENOENT).
   */
  run(opts: CliRunOptions): Promise<CliRunResult> {
    const started = Date.now();
    return new Promise<CliRunResult>((resolve, reject) => {
      // POSIX: detached process group so the whole tree dies together;
      // Windows: tree-kill falls back to `taskkill /T /F` on the root PID.
      const detached = process.platform !== "win32";
      const child = spawn(opts.bin, opts.args, {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        detached,
        // a GUI app spawning a console binary (codex.exe, the cmd.exe behind a .cmd shim)
        // flashes a console window on every call unless it is hidden
        windowsHide: true,
      });
      // decode per stream, not per chunk: a chunk boundary can split a multi-byte UTF-8
      // character, and Vietnamese copy is exactly where that happens
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      let stdout = "";
      let stderr = "";
      let stderrTailBuf = ""; // buffered partial line for onStderrLine (flushed in finish)
      let timedOut = false;
      let aborted = false;
      let settled = false;

      const finish = (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        // flush any trailing partial line (a final stderr line without \n must not be lost)
        if (opts.onStderrLine && stderrTailBuf.trim()) opts.onStderrLine(stderrTailBuf);
        const res: CliRunResult = { stdout, stderr, code, timedOut, aborted, durationMs: Date.now() - started };
        void writeTranscript(opts.jobId ?? "no-job", {
          bin: opts.bin,
          args: opts.args,
          stdin: redact(opts.stdin),
          code: res.code,
          timedOut,
          aborted,
          durationMs: res.durationMs,
          stderr: stderr.slice(0, 500),
        });
        resolve(res);
      };

      const timer = setTimeout(() => {
        timedOut = true;
        if (child.pid) killTree(child.pid);
      }, opts.timeoutMs);

      const onAbort = () => {
        aborted = true;
        if (child.pid) killTree(child.pid);
      };
      opts.signal?.addEventListener("abort", onAbort, { once: true });

      // NOTE: stdout grows unboundedly in memory; a runaway binary could balloon it.
      // Codex exec output is small (events + prose) — accepted risk, documented here.
      child.stdout?.on("data", (d: string) => (stdout += d));
      child.stderr?.on("data", (d: string) => {
        stderr += d;
        if (!opts.onStderrLine) return;
        stderrTailBuf += d;
        const lines = stderrTailBuf.split("\n");
        stderrTailBuf = lines.pop() ?? ""; // keep the partial tail until its \n arrives
        for (const line of lines) if (line.trim()) opts.onStderrLine(line);
      });
      child.stdin?.on("error", () => {}); // EPIPE when the child exits early — close below decides
      if (opts.stdin !== undefined) {
        child.stdin?.write(opts.stdin);
      }
      child.stdin?.end();
      child.on("error", (err: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        if (err.code === "ENOENT") {
          reject(new ProviderError("provider_missing", `binary not found: ${opts.bin}`, { detail: err.message }));
        } else {
          reject(new ProviderError("unknown", `failed to run ${opts.bin}: ${err.message}`));
        }
      });
      child.on("close", (code: number | null) => finish(code));
    });
  }
}
