import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { taskTypeSchema, submitTaskSchemas, taskStatusSchema, type TaskType, type TaskStatus, type DeconstructText } from "@oia/schema";
import { ProviderError } from "@oia/providers";
import { registerCancelable, releaseCancelable, abortLocal } from "./cancel.js";

/**
 * Task behavior (per the public API reference):
 * - A task belongs to exactly one session; a missing sessionId creates and returns one
 * - progress: processing → succeeded | failed; tasks live 24h, then behave as missing
 * - noWait=false (default): return the taskId immediately; noWait=true: wait for the result
 * - remove-background: output is always .png (transparency preserved)
 * - Tasks producing multiple images return a single ZIP url
 *
 * Stage 0 (TP.4/TP.5, Slice 4):
 * - task records are durable: every transition appends to a JSONL job log (TTL-swept on load)
 *   instead of memory-only (an in-memory Map was wiped on restart)
 * - every record carries jobId / attemptNumber / provider / errorClass; user-initiated retries
 *   create a NEW task linked with retryOf
 * - cancel(taskId): aborts the local AbortController and (when wired) publishes the
 *   cross-process cancel so a worker-process job dies too
 */

export interface SubmitOptions {
  sessionId?: number;
  noWait?: boolean;
  source?: "skill" | "web" | "agent";
  /** G3: a user-initiated retry links to the original task, never an automatic re-run. */
  retryOf?: string;
  /** Called ONCE when the run reaches a terminal state (succeeded|failed) — exact
   *  completion accounting for callers that guard concurrency (loopback agent API).
   *  runToCompletion never rejects, so this ALWAYS fires. */
  onSettled?: (status: TaskStatus) => void;
}
export type TaskHandlerResult = { urls: string[]; note?: string; texts?: DeconstructText[] };

/** Handlers may thread cooperative cancellation into providers (TP.5). */
export interface TaskContext {
  jobId: string;
  signal: AbortSignal;
}
export type TaskHandler = (params: Record<string, unknown>, ctx: TaskContext) => Promise<TaskHandlerResult>;

export interface Clock { now(): number }

export class TaskNotFound extends Error {
  constructor(public taskId: string) {
    super("task not found");
  }
}

export class TaskStore {
  private tasks = new Map<string, { status: TaskStatus; createdAt: number; sessionName?: string }>();
  private sessions = new Map<number, { createdAt: number; taskIds: string[] }>();
  private handlers = new Map<TaskType, TaskHandler>();
  private seqSession = 0;

  constructor(
    private opts: {
      ttlMs?: number;
      clock?: Clock;
      /** JSONL job log — task records survive restarts (swept by TTL on load). */
      logFile?: string;
    } = {},
  ) {
    this.opts.ttlMs ??= 24 * 60 * 60 * 1000; // 24h per the API reference
    this.opts.clock ??= { now: () => Date.now() };
  }

  /** Replay the durable job log (last transition per task wins; TTL-expired rows dropped). */
  async load(): Promise<void> {
    if (!this.opts.logFile) return;
    let raw: string;
    try {
      raw = await readFile(this.opts.logFile, "utf8");
    } catch {
      return; // no log yet
    }
    const now = this.now();
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as { taskId: string; sessionId: number; status: TaskStatus; createdAt: number };
        if (now - rec.createdAt > this.opts.ttlMs!) continue;
        const prev = this.tasks.get(rec.taskId);
        this.tasks.set(rec.taskId, { status: rec.status, createdAt: prev?.createdAt ?? rec.createdAt });
        if (!this.sessions.has(rec.sessionId)) this.sessions.set(rec.sessionId, { createdAt: rec.createdAt, taskIds: [] });
        const sess = this.sessions.get(rec.sessionId)!;
        if (!sess.taskIds.includes(rec.taskId)) sess.taskIds.push(rec.taskId);
      } catch {
        /* malformed line — skip */
      }
    }
    // 4f (reorg): records that were mid-flight when the previous process died must
    // not lie as "processing" forever. load() runs at context build — BEFORE any
    // new submit — so every "processing" record here is stale by construction.
    // B7 rule: the record must not lie; the quota was likely already spent.
    const interrupted: TaskStatus[] = [];
    for (const entry of this.tasks.values()) {
      if (entry.status.progress === "processing") {
        entry.status = { ...entry.status, progress: "failed", taskNote: "interrupted by app restart" };
        interrupted.push(entry.status);
      }
    }
    if (interrupted.length) await Promise.all(interrupted.map((s) => this.persist(s)));
  }

  private async persist(status: TaskStatus): Promise<void> {
    if (!this.opts.logFile) return;
    try {
      await mkdir(path.dirname(this.opts.logFile), { recursive: true });
      await appendFile(this.opts.logFile, `${JSON.stringify({ taskId: status.taskId, sessionId: status.sessionId, status, createdAt: this.now() })}\n`);
    } catch {
      /* the durable log is diagnostics — never fail a task on it */
    }
  }

  register(type: TaskType, handler: TaskHandler) {
    this.handlers.set(type, handler);
  }

  private nextSessionId(): number {
    return ++this.seqSession;
  }

/** Validate params against each task type’s schema. */
  validate(type: TaskType, params: Record<string, unknown>): { ok: true } | { ok: false; msg: string } {
    const schema = (submitTaskSchemas as unknown as Record<string, (typeof submitTaskSchemas)["remove-background"]>)[type];
    if (schema) {
      const parsed = schema.safeParse(params);
      if (!parsed.success) return { ok: false, msg: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    } else if (!taskTypeSchema.safeParse(type).success) {
      return { ok: false, msg: `unknown task type: ${type}` };
    }
    return { ok: true };
  }

  async submit(type: TaskType, params: Record<string, unknown>, opts: SubmitOptions = {}): Promise<TaskStatus> {
    const v = this.validate(type, params);
    if (!v.ok) throw new Error(v.msg);

    // Session chaining rule
    let sessionId = opts.sessionId;
    if (sessionId == null) sessionId = this.nextSessionId();
    if (!this.sessions.has(sessionId)) this.sessions.set(sessionId, { createdAt: this.now(), taskIds: [] });

    const taskId = `task_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const jobId = randomUUID(); // TP.4: correlation id shared by events, logs, and cancels
    const status: TaskStatus = {
      taskId, sessionId, progress: "processing", taskResult: null, taskNote: null, msg: "",
      jobId, attemptNumber: 1, retryOf: opts.retryOf ?? null,
    };
    this.tasks.set(taskId, { status, createdAt: this.now() });
    this.sessions.get(sessionId)!.taskIds.push(taskId);
    await this.persist(status);

    const run = this.runToCompletion(type, params, status).then((s) => {
      opts.onSettled?.(s);
      return s;
    });
    if (opts.noWait) return run; // sync mode: wait for the final result
    void run.catch(() => {}); // async mode: return the taskId immediately, run in the background
    return { ...status };
  }

  private async runToCompletion(type: TaskType, params: Record<string, unknown>, status: TaskStatus): Promise<TaskStatus> {
    const ac = new AbortController();
    registerCancelable(status.jobId!, ac);
    try {
      const handler = this.handlers.get(type);
      if (!handler) throw new Error(`no handler registered for ${type}`);
      const result = await handler(params, { jobId: status.jobId!, signal: ac.signal });
      status.taskResult = { download: this.finalDownload(type, result), ...(result.texts ? { texts: result.texts } : {}) };
      if (result.note) status.taskNote = result.note;
      if (ac.signal.aborted) {
        // B7: the handler finished but was cancelled after completion — the quota was spent,
        // so the result is kept (afterCompletion principle) and the outcome stays honest
        status.progress = "failed";
        status.errorClass = "cancelled";
        status.msg = "cancelled after completion — result kept";
      } else {
        status.progress = "succeeded";
      }
    } catch (err) {
      status.progress = "failed";
      status.msg = err instanceof Error ? err.message : String(err);
      const pe = ProviderError.from(err);
      status.errorClass = pe.errorClass;
      status.provider = pe.provider ?? null;
      status.attemptNumber = 1; // metered jobs run exactly once (G3) — retries are new tasks (retryOf)
    } finally {
      releaseCancelable(status.jobId!);
      await this.persist(status);
    }
    return status;
  }

  /** TP.5: cancel a running task — in-process abort (the registry is shared per process).
   *  B7: this does NOT write a terminal status — the completion path records the cancelled
   *  outcome (a handler that ignores the signal may still finish; the record must not lie). */
  async cancel(taskId: string): Promise<boolean> {
    const entry = this.tasks.get(taskId);
    if (!entry || entry.status.progress !== "processing") return false;
    return abortLocal(entry.status.jobId!);
  }

/** Output rules: remove-background stays .png; multiple urls become one ZIP. */
  private finalDownload(type: TaskType, result: TaskHandlerResult): string {
    let urls = result.urls;
    if (type === "remove-background") urls = urls.map((u) => u.replace(/\.\w+(\?|$)/, ".png$1"));
    if (urls.length === 1) return urls[0];
    const base = urls[0].replace(/\/[^/]*$/, "");
    return `${base}/bundle_${randomUUID().slice(0, 8)}.zip`;
  }

/** 24h TTL: expired tasks count as missing (callers map this to 404). */
  get(taskId: string): TaskStatus {
    const entry = this.tasks.get(taskId);
    if (!entry) throw new TaskNotFound(taskId);
    if (this.now() - entry.createdAt > this.opts.ttlMs!) throw new TaskNotFound(taskId);
    return { ...entry.status, taskResult: entry.status.taskResult ? { ...entry.status.taskResult } : null };
  }

  sessionTasks(sessionId: number): TaskStatus[] {
    return (this.sessions.get(sessionId)?.taskIds ?? [])
      .map((id) => {
        try { return this.get(id); } catch { return null; }
      })
      .filter((x): x is TaskStatus => x !== null);
  }

  private now(): number {
    return this.opts.clock!.now();
  }
}

/** CommonResult envelope (code=0 means success). */
export function ok<T>(data: T) {
  return { code: 0, data, msg: "" };
}
export function fail(msg: string, code = 1) {
  return { code, data: null, msg };
}
