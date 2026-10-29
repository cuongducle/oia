import { spawn } from "cross-spawn";
import kill from "tree-kill";
import { mkdir, mkdtemp, readdir, rm, writeFile, stat } from "node:fs/promises";
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
  /** Streaming stdout lines (e.g. --json events) for incremental parsing. */
  onStdoutLine?: (line: string) => void;
  /** Redaction override for the transcript's stdin record (default: sha256 + length only). */
  env?: NodeJS.ProcessEnv;
}

export interface CliRunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  aborted: boolean;
  durationMs: number;
}

/** Map a finished (or failed) run onto the stable error classes; throws ProviderError. */
export function assertRunOk(res: CliRunResult, provider: string, what: string): void {
  if (res.aborted) {
    throw new ProviderError("cancelled", `${what} was cancelled`, { provider });
  }
  if (res.timedOut) {
    throw new ProviderError("timeout", `${what} timed out after ${Math.round(res.durationMs / 1000)}s`, { provider });
  }
  if (res.code !== 0) {
    throw new ProviderError("unknown", `${what} exited with code ${res.code}`, {
      provider,
      detail: res.stderr.slice(0, 400),
    });
  }
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
    // retention sweep (best-effort)
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

export async function readTranscripts(jobId: string): Promise<string[]> {
  try {
    const { readFile } = await import("node:fs/promises");
    const file = path.join(await transcriptsRoot(), `${jobId}.jsonl`);
    return (await readFile(file, "utf8")).trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Per-job scratch directory under tmp: /oia/<scope>-<uuid> (ASCII only). */
export async function createScratchDir(scope: string): Promise<string> {
  const dir = path.join(tmpdir(), "oia", `${scope}-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function createEmptyDir(parent: string, name: string): Promise<string> {
  const dir = path.join(parent, name);
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

export class CliRuntime {
  /**
   * Spawn `bin args` with stdin prompt support, timeout and abort ⇒ process-tree kill.
   * Never throws for process-level outcomes — inspect the result or use assertRunOk.
   * Throws ProviderError("provider_missing") only when the binary cannot be spawned (ENOENT).
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
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let aborted = false;
      let settled = false;

      const finish = (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
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
        if (child.pid) kill(child.pid, "SIGKILL");
      }, opts.timeoutMs);

      const onAbort = () => {
        aborted = true;
        if (child.pid) kill(child.pid, "SIGKILL");
      };
      opts.signal?.addEventListener("abort", onAbort, { once: true });

      child.stdout?.on("data", (d: Buffer) => {
        const chunk = d.toString();
        stdout += chunk;
        if (opts.onStdoutLine) {
          for (const line of chunk.split("\n")) if (line.trim()) opts.onStdoutLine(line);
        }
      });
      child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
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

  /** Cheap version probe — resolves when the binary exists and exits 0/1 with --version output. */
  async version(bin: string, timeoutMs = 10_000): Promise<{ ok: boolean; version?: string; detail?: string }> {
    try {
      const res = await this.run({ bin, args: ["--version"], timeoutMs });
      const m = res.stdout.match(/(\d+\.\d+\.\d+[^\s]*)/);
      return { ok: res.code === 0 || res.code === 1, version: m?.[1] };
    } catch (err) {
      if (err instanceof ProviderError && err.errorClass === "provider_missing") return { ok: false, detail: err.message };
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Convenience mkdtemp for tests and scratch subdirectories. */
export async function mkTmpDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}
