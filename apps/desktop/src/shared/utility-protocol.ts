/**
 * D11 (reorg step 4a) — the wire protocol between the Electron MAIN process and
 * the UTILITY process that owns the service layer (ServiceContext: runChat, task
 * store, projects/templates/sessions, files, NSFW gate, and — later this step —
 * the loopback agent API server).
 *
 * Shape: request/response by id (main → utility → main) + streamed events
 * (utility → main). MAIN validates all renderer input through shared/ipc.ts
 * BEFORE it crosses this wire; the utility trusts only its parent (main).
 * Bytes cross as Uint8Array — parentPort.postMessage is structured-clone.
 */
import type { TaskType } from "@oia/schema";

export type UtilityEnv = Record<string, string | undefined>;

export type UtilityCommand =
  /** Boot (once): build the ServiceContext from dataDir + provider env, start the
   *  loopback agent API (D9) with its discovery file under userDataDir. */
  | { cmd: "init"; dataDir: string; userDataDir: string; env: UtilityEnv }
  /** Provider mode / codex binary changed: cancel in-flight, rebuild the context
   *  (reuses the dataDir/userDataDir from init; restarts the loopback server). */
  | { cmd: "rebuild"; env: UtilityEnv }
  | { cmd: "chatRun"; req: unknown }
  | { cmd: "chatCancel"; jobId: string }
  /** Window closed / app quitting — kill every in-flight generation (TP-D5). */
  | { cmd: "cancelAll" }
  | { cmd: "providerStatus" }
  | { cmd: "projects.create"; input: { name?: string; scene?: unknown; pages?: unknown; width?: number; height?: number } }
  | { cmd: "projects.get"; id: string }
  | { cmd: "projects.list" }
  | { cmd: "projects.save"; id: string; patch: { name?: string; pages?: unknown } }
  | { cmd: "projects.remove"; id: string }
  | { cmd: "templates.list" }
  | { cmd: "templates.create"; input: { name: string; authorName?: string; scene: unknown } }
  | { cmd: "sessions.list" }
  | { cmd: "sessions.get"; id: number }
  | { cmd: "files.put"; name: string; bytes: Uint8Array }
  | { cmd: "files.read"; key: string }
  /** reorg step 4c — the quick-tools task lane (renderer IPC, NOT the loopback API).
   *  Same TaskStore + same G3 metered guard; source "web" mirrors the web tools UI. */
  | { cmd: "tasks.submit"; type: TaskType; params: Record<string, unknown> }
  | { cmd: "tasks.get"; taskId: string }
  | { cmd: "tasks.cancel"; taskId: string }
  /** reorg step 4d — brand kits + API keys (For Agents panel). */
  | { cmd: "brandKits.list" }
  | { cmd: "brandKits.upsert"; input: unknown }
  | { cmd: "brandKits.remove"; id: string }
  | { cmd: "keys.list" }
  | { cmd: "keys.create"; name: string; ttlDays: number | null }
  | { cmd: "keys.revoke"; id: string }
  /** The live loopback port (For Agents shows the base URL; port changes per fork). */
  | { cmd: "loopback.port" };

export type UtilityRequest = UtilityCommand & {
  /** Correlation id (envelope) — the response echoes it. Named `rid` to never
   *  collide with business ids (sessions.get carries its own numeric `id`). */
  rid: string;
  /** For chatRun: which pending request streamed events belong to (event routing). */
  requestId?: string;
};

export type UtilityEvent =
  | { type: "chatEvent"; requestId: string; ev: unknown }
  | { type: "log"; line: string }
  /** D9 — job lifecycle surfaced to the UI (For Agents feed): `lane` separates
   *  loopback agent runs from quick-tools runs (both are metered generations). */
  | { type: "agentJob"; lane: "agent" | "tool"; taskId: string; event: "submitted" | "succeeded" | "failed"; taskType: string };

export type UtilityResponse =
  | { rid: string; ok: true; result: unknown }
  | {
      rid: string;
      ok: false;
      /** Error shape survives the wire: name/errorClass are renderer-mapped contracts. */
      error: { name: string; message: string; errorClass?: string };
    };

/** Serialize a thrown error for the wire (Error → plain object; class info kept). */
export function serializeUtilityError(err: unknown): { name: string; message: string; errorClass?: string } {
  if (err instanceof Error) {
    const errorClass = (err as Error & { errorClass?: string }).errorClass;
    return { name: err.name, message: err.message, ...(typeof errorClass === "string" ? { errorClass } : {}) };
  }
  return { name: "Error", message: String(err) };
}

/** Rebuild the Error on the main side (name/errorClass preserved for the renderer map). */
export function deserializeUtilityError(shape: { name: string; message: string; errorClass?: string }): Error {
  const e = new Error(shape.message) as Error & { name: string; errorClass?: string };
  e.name = shape.name;
  if (shape.errorClass !== undefined) e.errorClass = shape.errorClass;
  return e;
}
