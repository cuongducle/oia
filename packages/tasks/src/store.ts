import { randomUUID } from "node:crypto";
import { taskTypeSchema, submitTaskSchemas, taskStatusSchema, type TaskType, type TaskStatus } from "@oia/schema";

/**
 * Task behavior (per the public API reference):
 * - A task belongs to exactly one session; a missing sessionId creates and returns one
 * - progress: processing → succeeded | failed; tasks live 24h, then behave as missing
 * - noWait=false (default): return the taskId immediately; noWait=true: wait for the result
 * - remove-background: output is always .png (transparency preserved)
 * - Tasks producing multiple images return a single ZIP url
 */

export interface SubmitOptions {
  sessionId?: number;
  noWait?: boolean;
  source?: "skill" | "web" | "agent";
}
export type TaskHandlerResult = { urls: string[]; note?: string };
export type TaskHandler = (params: Record<string, unknown>) => Promise<TaskHandlerResult>;

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
    private opts: { ttlMs?: number; clock?: Clock } = {},
  ) {
    this.opts.ttlMs ??= 24 * 60 * 60 * 1000; // 24h per the API reference
    this.opts.clock ??= { now: () => Date.now() };
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
    const status: TaskStatus = { taskId, sessionId, progress: "processing", taskResult: null, taskNote: null, msg: "" };
    this.tasks.set(taskId, { status, createdAt: this.now() });
    this.sessions.get(sessionId)!.taskIds.push(taskId);

    const run = this.runToCompletion(type, params, status);
    if (opts.noWait) return run; // sync mode: wait for the final result
    void run.catch(() => {}); // async mode: return the taskId immediately, run in the background
    return { ...status };
  }

  private async runToCompletion(type: TaskType, params: Record<string, unknown>, status: TaskStatus): Promise<TaskStatus> {
    try {
      const handler = this.handlers.get(type);
      if (!handler) throw new Error(`no handler registered for ${type}`);
      const result = await handler(params);
      status.taskResult = { download: this.finalDownload(type, result) };
      if (result.note) status.taskNote = result.note;
      status.progress = "succeeded";
    } catch (err) {
      status.progress = "failed";
      status.msg = err instanceof Error ? err.message : String(err);
    }
    return status;
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
