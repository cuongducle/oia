import {
  createServiceContext,
  runChat,
  cancelJob,
  jobControllers,
  providerStatusSnapshot,
  type ServiceContext,
} from "@oia/services";
import { checkNsfw } from "@oia/providers";
import { TaskNotFound, importWebData } from "@oia/tasks";
import { startLoopback } from "./loopback.js";
import { createGuardedSubmitter } from "./guardedTaskSubmit.js";
import { seedSampleProjects } from "./seedSamples.js";
import { unlinkSync } from "node:fs";
import {
  type UtilityRequest,
  type UtilityResponse,
  type UtilityEvent,
  serializeUtilityError,
} from "../shared/utility-protocol.js";

/**
 * D11 (reorg step 4a) — the Oia services utility process.
 *
 * Everything that talks to providers, stores, or files lives HERE, one crash
 * boundary away from the window: ServiceContext (runChat + task store +
 * projects/templates/sessions + LocalFileStore), the NSFW upload gate, and —
 * later in step 4b — the loopback agent API server. The MAIN process owns
 * windows, dialogs, the oia:// protocol, and the codex runtime controller; it
 * validates renderer input BEFORE it crosses this wire, so this process trusts
 * only its parent.
 *
 * Contract: shared/utility-protocol.ts (request/response by id + streamed events).
 */

let ctx: ServiceContext | null = null;
let dataDir = "";
let userDataDir = "";
/** T3 — the env the CURRENT context was built from (NSFW mode etc. ride it). */
let serviceEnv: Record<string, string | undefined> = {};
let loopback: { port: number; discoveryFile: string; close: () => Promise<void> } | null = null;
/** The renderer quick-tools task lane (guarded submit for tasks.submit). */
let toolLane: ReturnType<typeof createGuardedSubmitter> | null = null;
let discoveryCleanup: string | null = null; // ONE module-level exit listener — never per-rebuild

// Registered ONCE: a hard exit (kill, crash) still removes the discovery file so
// agents are not pointed at a dead port (they also pid-check on read).
process.on("exit", () => {
  if (!discoveryCleanup) return;
  try {
    unlinkSync(discoveryCleanup);
  } catch {
    /* already gone */
  }
});

// SIGTERM (main quitting / kill): abort every in-flight job FIRST — aborting the
// controllers makes CliRuntime kill its DETACHED codex trees — then exit. Without
// this, a hard kill orphans quota-burning children that outlive the app.
process.on("SIGTERM", () => {
  cancelAll();
  setTimeout(() => process.exit(0), 1500).unref();
});

async function startServices(env: Record<string, string | undefined>): Promise<void> {
  if (loopback) await loopback.close().catch(() => {});
  loopback = null;
  toolLane?.dispose();
  ctx = await createServiceContext({ dataDir, env });
  // reorg step 4c — the quick-tools renderer lane: SAME TaskStore + SAME G3 metered
  // guard as the loopback, attributed to source "web" (the web tools UI contract).
  // Its lifecycle frames stream to the UI too (lane "tool") — a metered generation
  // must stay visible even after the Tools view closes (hard rule 6).
  const live = ctx;
  toolLane = createGuardedSubmitter({
    ctx: () => live,
    lane: "tool",
    source: "web",
    idPrefix: "tool",
    onJobEvent: (ev) => post({ type: "agentJob", ...ev }),
  });
  loopback = await startLoopback({
    ctx: () => requireCtx(),
    userDataDir,
    env,
    emit: (ev) => post(ev),
  });
  discoveryCleanup = loopback.discoveryFile;
  log(`loopback agent API on 127.0.0.1:${loopback.port} (discovery: ${loopback.discoveryFile})`);
  // First run: curated sample projects (marker file makes this a no-op from boot 2 on)
  const seeded = await seedSampleProjects({ dataDir, projects: ctx.projects });
  if (seeded) log(`seeded ${seeded} sample projects`);
}

function post(message: UtilityResponse | UtilityEvent): void {
  process.parentPort.postMessage(message);
}

function log(line: string): void {
  post({ type: "log", line });
}

function requireCtx(): ServiceContext {
  if (!ctx) throw new Error("service context not initialized — main must send init first");
  return ctx;
}

function cancelAll(): void {
  for (const [jobId, ac] of jobControllers()) {
    if (!ac.signal.aborted) ac.abort("shutdown");
    cancelJob(jobId);
  }
}

async function dispatch(req: UtilityRequest): Promise<unknown> {
  switch (req.cmd) {
    case "init": {
      cancelAll();
      dataDir = req.dataDir;
      userDataDir = req.userDataDir;
      serviceEnv = req.env;
      await startServices(req.env);
      log(`ctx ready (dataDir=${dataDir})`);
      return null;
    }
    case "rebuild": {
      cancelAll(); // never mix contexts mid-job
      await startServices(req.env);
      log("ctx rebuilt");
      return null;
    }
    case "cancelAll":
      cancelAll();
      return null;

    case "chatRun": {
      const c = requireCtx();
      const requestId = req.requestId ?? req.rid;
      const { outcome, jobId } = await runChat(req.req as Parameters<typeof runChat>[0], c, {
        sink: (ev) => post({ type: "chatEvent", requestId, ev }),
      });
      return { outcome, jobId };
    }
    case "chatCancel":
      return cancelJob(req.jobId);

    case "providerStatus":
      return providerStatusSnapshot(requireCtx());

    case "projects.create":
      return requireCtx().projects.create(req.input);
    case "projects.get":
      return requireCtx().projects.get(req.id) ?? null;
    case "projects.list":
      return requireCtx().projects.recent(50);
    case "projects.save":
      return requireCtx().projects.saveScene(req.id, req.patch);
    case "projects.remove":
      return requireCtx().projects.remove(req.id);

    case "templates.list":
      return requireCtx().templates.list({ page: 1, pageSize: 100 }).items;
    case "templates.create":
      return requireCtx().templates.publish(req.input);

    case "sessions.list":
      return requireCtx()
        .chatSessions.recent(20)
        .map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt }));
    case "sessions.get": {
      const s = requireCtx().chatSessions.get(req.id);
      return s ? { id: s.id, name: s.name, messages: s.messages } : null;
    }

    case "files.put": {
      // same moderation gate as the web upload route (env-gated, off by default)
      const nsfw = await checkNsfw(req.bytes, req.name, serviceEnv);
      if (!nsfw.allowed) throw new Error("image not allowed");
      const ext = req.name.split(".").pop()!.toLowerCase();
      const saved = await requireCtx().files.put(req.bytes, ext);
      return { url: saved.url, size: req.bytes.length };
    }
    case "files.read":
      return await requireCtx().files.read(req.key);

    // ---- reorg step 4c: quick-tools task lane (renderer IPC) ----
    case "tasks.submit": {
      if (!toolLane) throw new Error("service context not initialized");
      return toolLane.submit(req.type, req.params);
    }
    case "tasks.get":
      try {
        return requireCtx().taskStore.get(req.taskId);
      } catch (err) {
        // unknown/expired (24h TTL) → null on this wire (the loopback keeps its 404)
        if (err instanceof TaskNotFound) return null;
        throw err;
      }
    case "tasks.cancel":
      return requireCtx().taskStore.cancel(req.taskId);

    // ---- reorg step 4d: brand kits + For Agents ----
    case "brandKits.list":
      return requireCtx().brandKits.list();
    case "brandKits.upsert":
      return requireCtx().brandKits.upsert(req.input);
    case "brandKits.remove":
      return requireCtx().brandKits.remove(req.id);
    case "keys.list":
      return requireCtx().keys.list();
    case "keys.create":
      return requireCtx().keys.create(req.name, req.ttlDays);
    case "keys.revoke":
      return requireCtx().keys.revoke(req.id);
    case "loopback.port":
      return loopback ? loopback.port : null;

    // ---- reorg step 5: web `.data` import ----
    case "data.importWeb": {
      const c = requireCtx();
      return importWebData({ sourceDir: req.sourceDir, target: { files: c.files, projects: c.projects, chatSessions: c.chatSessions, brandKits: c.brandKits, templates: c.templates } });
    }
  }
}

process.parentPort.on("message", (e) => {
  const req = e.data as UtilityRequest;
  dispatch(req).then(
    (result) => post({ rid: req.rid, ok: true, result }),
    (err) => post({ rid: req.rid, ok: false, error: serializeUtilityError(err) }),
  );
});

log("utility process up");
