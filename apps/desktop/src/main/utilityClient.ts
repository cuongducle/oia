import { utilityProcess, type UtilityProcess, type WebContents } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IPC } from "../shared/channels.js";
import {
  type UtilityCommand,
  type UtilityRequest,
  type UtilityResponse,
  type UtilityEvent,
  deserializeUtilityError,
} from "../shared/utility-protocol.js";

/**
 * D11 (reorg step 4a) — the main-side handle to the services utility process.
 * - call(cmd): request/response by rid, with a PER-COMMAND TIMEOUT — a wedged
 *   utility must fail fast (UtilityTimeout), never hang a handler forever.
 * - crash recovery: `generation` bumps on every fork. Main stores the generation
 *   its context was built with; a mismatch means "fork again + re-init" — one
 *   services crash can never brick the app until restart (the bug this fixed).
 * - chat events stream back tagged with the originating request id and are routed
 *   to the WebContents that started the chat.
 * - 'exit' rejects pending calls (UtilityProcessCrashed) and logs the code — a
 *   services crash must never leave the UI hanging on a promise.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/** Per-command timeouts: chatRun must outlive the codex budget (480s + margin);
 *  init/rebuild run provider probes; everything else is store/file work. */
const TIMEOUT_MS: Record<string, number> = {
  chatRun: 12 * 60_000,
  init: 120_000,
  rebuild: 120_000,
};
const DEFAULT_TIMEOUT_MS = 30_000;

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

export class UtilityClient {
  private child: UtilityProcess | null = null;
  private pending = new Map<string, Pending>();
  /** requestId → the renderer that started the chat (chat events route back to it). */
  private chatSenders = new Map<string, WebContents>();
  private eventListeners: ((ev: UtilityEvent) => void)[] = [];
  private exitInfo: { code: number } | null = null;
  /** Bumps on every fork — main keys its context cache on this (crash recovery). */
  private generation = 0;

  /** Fork if needed. After a crash (exitInfo set) a fresh fork RESETS the crash
   *  state — callers re-init through their generation check. */
  start(): void {
    if (this.child && this.exitInfo === null) return; // alive and healthy
    this.exitInfo = null;
    this.generation += 1;
    this.child = utilityProcess.fork(path.join(here, "utility.js"), [], {
      serviceName: "oia-services",
      stdio: "inherit",
    });
    const child = this.child;
    const forkGen = this.generation; // this exit belongs to THIS fork only
    child.on("message", (msg) => this.onMessage(msg as UtilityResponse | UtilityEvent));
    child.on("exit", (code) => {
      if (this.generation !== forkGen) return; // a NEWER fork owns the client now
      this.exitInfo = { code: code ?? -1 };
      this.child = null;
      const err = new Error(`services process exited (code ${this.exitInfo.code})`) as Error & { name: string };
      err.name = "UtilityProcessCrashed";
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      this.chatSenders.clear();
      this.emitEvent({ type: "log", line: `utility process EXITED code=${this.exitInfo.code} (generation ${this.generation})` });
    });
  }

  get crashed(): boolean {
    return this.exitInfo !== null;
  }

  /** The fork counter — compare with the generation your context was built on. */
  get gen(): number {
    return this.generation;
  }

  onUtilityEvent(fn: (ev: UtilityEvent) => void): () => void {
    this.eventListeners.push(fn);
    return () => {
      this.eventListeners = this.eventListeners.filter((f) => f !== fn);
    };
  }

  private emitEvent(ev: UtilityEvent): void {
    for (const fn of this.eventListeners) fn(ev);
  }

  private onMessage(msg: UtilityResponse | UtilityEvent): void {
    if ("type" in msg) {
      // streamed event
      if (msg.type === "chatEvent") {
        const sender = this.chatSenders.get(msg.requestId);
        if (sender && !sender.isDestroyed()) sender.send(IPC.chatEvent, msg.ev);
        this.emitEvent(msg); // smoke + diagnostics observers always see frames, sender or not
        return;
      }
      if (msg.type === "log") console.log(`[utility] ${msg.line}`);
      this.emitEvent(msg);
      return;
    }
    const p = this.pending.get(msg.rid);
    if (!p) return;
    this.pending.delete(msg.rid);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(deserializeUtilityError(msg.error));
  }

  call(cmd: UtilityCommand, opts: { requestId?: string; sender?: WebContents; timeoutMs?: number } = {}): Promise<unknown> {
    if (!this.child || this.exitInfo) {
      const err = new Error("services process unavailable") as Error & { name: string };
      err.name = "UtilityProcessCrashed";
      return Promise.reject(err);
    }
    const rid = randomUUID();
    const req: UtilityRequest = { rid, ...cmd, ...(opts.requestId ? { requestId: opts.requestId } : {}) };
    const routeKey = opts.requestId ?? rid;
    if (opts.sender) this.chatSenders.set(routeKey, opts.sender);
    const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS[cmd.cmd] ?? DEFAULT_TIMEOUT_MS;
    const child = this.child; // captured — never re-read across the async gap
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid); // the late response (if any) is dropped on the floor
        const err = new Error(`services rpc timed out after ${timeoutMs}ms (cmd=${cmd.cmd})`) as Error & { name: string };
        err.name = "UtilityTimeout";
        reject(err);
      }, timeoutMs);
      this.pending.set(rid, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      child.postMessage(req);
    }).finally(() => {
      this.chatSenders.delete(routeKey); // chat done (or failed) — stop routing its events
    });
  }

  /** Hard stop (app quit): kill in-flight CLI children with the process tree. */
  kill(): void {
    this.child?.kill();
    this.child = null;
  }
}

/** Process-wide singleton — main forks exactly one services utility process. */
export const utility = new UtilityClient();
