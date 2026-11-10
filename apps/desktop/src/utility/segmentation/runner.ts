/**
 * The SAM sidecar client (segmentation-process-plan.md, option A).
 *
 * WHY: ONNX Runtime's GB-scale aligned allocations SIGTRAP inside any
 * Electron-linked process on macOS (Chromium's PartitionAlloc malloc-zone
 * shim). The oia-segment-runner binary is a plain native process with a real
 * malloc; this client speaks its JSON-lines protocol (base64 LE f32/i64
 * payloads) over stdio. A runner crash is an ERROR, never a process death:
 * the next call respawns it (the crash that motivated this architecture
 * killed the whole utility process instead).
 *
 * Electron-free (node:child_process only) so vitest can drive a fake runner
 * through the real spawn/pipe machinery.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";

export interface SegmentRuntime {
  runnerPath: string;
  ortLibPath: string;
}

export type RunnerRequest =
  | { op: "ping" }
  | { op: "vision"; models_dir: string; key: string; pixels: { dims: number[]; data: string } }
  | { op: "text"; models_dir: string; input_ids: number[]; attn: number[] }
  | { op: "decode"; models_dir: string; vision_key: string; text_features: { dims: number[]; data: string }; attn: number[] };

export type RunnerResponse =
  | { op: "pong" }
  | { op: "vision"; key: string }
  | { op: "text"; text_features: { dims: number[]; dtype: string; data: string } }
  | { op: "decode"; masks: { dims: number[]; dtype: string; data: string }; boxes: { dims: number[]; dtype: string; data: string }; logits: { dims: number[]; dtype: string; data: string } }
  | { op: "error"; message: string };

/** Where the sidecar lives: packaged = <resources>/segment/<plat>, dev = <app>/resources/segment/<plat>. */
export function resolveSegmentRuntime(segmentDir: string): SegmentRuntime | null {
  const exe = process.platform === "win32" ? "oia-segment-runner.exe" : "oia-segment-runner";
  const ort = process.platform === "win32" ? "onnxruntime.dll" : "libonnxruntime.1.dylib";
  const runnerPath = `${segmentDir}/${exe}`;
  const ortLibPath = `${segmentDir}/${ort}`;
  return existsSync(runnerPath) && existsSync(ortLibPath) ? { runnerPath, ortLibPath } : null;
}

/** LE f32 <-> base64 (mac arm64 + win x64 are little-endian; pinned platforms). */
export function f32ToB64(arr: Float32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString("base64");
}

/** base64 LE f32 -> Float32Array (readFloatLE: alignment-proof for any Buffer) */
export function b64ToF32(b64: string): Float32Array {
  const buf = Buffer.from(b64, "base64");
  const out = new Float32Array(buf.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

export class SegmentRunner {
  private child: ChildProcess | null = null;
  private gen = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private crashMessage: string | null = null;

  constructor(private readonly runtime: SegmentRuntime, private readonly timeoutMs = 20 * 60_000) {}

  /** Bumps on every spawn; callers key caches on it (a restart empties the runner's vision cache). */
  get generation(): number {
    return this.gen;
  }

  private start(): ChildProcess {
    const child = spawn(this.runtime.runnerPath, [], {
      stdio: ["pipe", "pipe", "inherit"], // stderr = runner logs, forwarded
      env: { ...process.env, ORT_DYLIB_PATH: this.runtime.ortLibPath },
    });
    this.gen += 1;
    this.crashMessage = null;
    this.child = child;
    return child;
  }

  private die(why: string): void {
    this.child?.kill();
    this.child = null;
    this.crashMessage = why;
  }

  /** One request/response over the pipe. Sequential by design: the runner is a
   *  single-threaded loop, a queued second request would interleave lines. */
  request(req: RunnerRequest): Promise<RunnerResponse> {
    const run = this.queue.then(() => this.rawRequest(req));
    this.queue = run.catch(() => {}); // keep the chain alive after errors
    return run;
  }

  private rawRequest(req: RunnerRequest): Promise<RunnerResponse> {
    if (!this.child) this.start();
    const child = this.child!;
    return new Promise<RunnerResponse>((resolve, reject) => {
      let buf = "";
      const onExit = (code: number | null) => {
        cleanup();
        this.child = null;
        this.crashMessage = `segment runner exited (code ${code ?? "signal"})`;
        reject(new Error(this.crashMessage));
      };
      const onData = (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        const nl = buf.indexOf("\n");
        if (nl === -1) return;
        const line = buf.slice(0, nl);
        cleanup();
        try {
          const resp = JSON.parse(line) as RunnerResponse;
          if (resp.op === "error") reject(new Error(`segment runner: ${resp.message}`));
          else resolve(resp);
        } catch (err) {
          this.die(`segment runner sent a non-JSON line: ${line.slice(0, 80)}`);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      const timer = setTimeout(() => {
        this.die(`segment runner timed out after ${this.timeoutMs}ms`);
        cleanup();
        reject(new Error(this.crashMessage!));
      }, this.timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        child.off("exit", onExit);
      };
      child.once("exit", onExit);
      child.stdout?.on("data", onData);
      try {
        child.stdin?.write(`${JSON.stringify(req)}\n`);
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** Kill the child (cancel/app teardown). The runner also self-exits on stdin EOF. */
  kill(): void {
    this.child?.kill();
    this.child = null;
  }

  get lastCrash(): string | null {
    return this.crashMessage;
  }
}
