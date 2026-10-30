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
 * - call(cmd): request/response by id (errors re-thrown with name/errorClass intact)
 * - chat events stream back tagged with the originating request id and are routed
 *   to the WebContents that started the chat (mirrors the old direct-sink wiring)
 * - crash observability: 'exit' rejects pending calls and surfaces the code — a
 *   services crash must never leave the UI hanging on a promise
 */

const here = path.dirname(fileURLToPath(import.meta.url));

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

  start(): void {
    if (this.child) return;
    this.child = utilityProcess.fork(path.join(here, "utility.js"), [], {
      serviceName: "oia-services",
      stdio: "inherit",
    });
    this.child.on("message", (msg) => this.onMessage(msg as UtilityResponse | UtilityEvent));
    this.child.on("exit", (code) => {
      this.exitInfo = { code: code ?? -1 };
      this.child = null;
      const err = new Error(`services process exited (code ${this.exitInfo.code})`) as Error & { name: string };
      err.name = "UtilityProcessCrashed";
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      this.chatSenders.clear();
      this.emitEvent({ type: "log", line: `utility process EXITED code=${this.exitInfo.code}` });
    });
  }

  get crashed(): boolean {
    return this.exitInfo !== null;
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

  call(cmd: UtilityCommand, opts: { requestId?: string; sender?: WebContents } = {}): Promise<unknown> {
    if (!this.child || this.exitInfo) {
      const err = new Error("services process unavailable") as Error & { name: string };
      err.name = "UtilityProcessCrashed";
      return Promise.reject(err);
    }
    const rid = randomUUID();
    const req: UtilityRequest = { rid, ...cmd, ...(opts.requestId ? { requestId: opts.requestId } : {}) };
    const routeKey = opts.requestId ?? rid;
    if (opts.sender) this.chatSenders.set(routeKey, opts.sender);
    const child = this.child; // captured — never re-read across the async gap
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(rid, { resolve, reject });
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
