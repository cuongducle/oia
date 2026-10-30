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

export type UtilityEnv = Record<string, string | undefined>;

export type UtilityCommand =
  /** Boot (once): build the ServiceContext from dataDir + provider env. */
  | { cmd: "init"; dataDir: string; env: UtilityEnv }
  /** Provider mode / codex binary changed: cancel in-flight, rebuild the context. */
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
  | { cmd: "files.read"; key: string };

export type UtilityRequest = UtilityCommand & {
  /** Correlation id (envelope) — the response echoes it. Named `rid` to never
   *  collide with business ids (sessions.get carries its own numeric `id`). */
  rid: string;
  /** For chatRun: which pending request streamed events belong to (event routing). */
  requestId?: string;
};

export type UtilityEvent =
  | { type: "chatEvent"; requestId: string; ev: unknown }
  | { type: "log"; line: string };

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
