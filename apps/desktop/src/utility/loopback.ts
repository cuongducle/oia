import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { chmod, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { ServiceContext } from "@oia/services";
import { checkNsfw } from "@oia/providers";
import { taskTypeSchema, type TaskType } from "@oia/schema";

/**
 * D9 (reorg step 4b) — the loopback agent API, served from the UTILITY process.
 *
 * Security posture (all checks BEFORE any route logic):
 * 1. Bind 127.0.0.1 only; Host header must be exactly `127.0.0.1:<port>` — kills
 *    DNS-rebinding (an attacker page on evil.com resolving to 127.0.0.1 sends its
 *    own Host and dies here).
 * 2. Any request carrying an Origin header is rejected — browsers always send it
 *    on cross-origin fetches; curl/agents never do. No CORS headers are EVER set.
 * 3. The API key rides the Authorization header ONLY (raw key, same as the web
 *    API the skills already speak). A key in the query string is an explicit 401.
 * 4. Body cap 50 MB (Content-Length precheck + accumulated-chunk guard).
 *
 * Operational posture:
 * - Random port + discovery file `<userData>/agent-api.json` (mode 0600): agents
 *   read the port from disk instead of guessing; removed on close.
 * - Per-key rate limit (token bucket) + at most ONE in-flight generation per
 *   agent when the image provider is codex (quota guard). Fire-and-forget tasks
 *   (noWait=false) fall back to a TTL guard — TaskStore gives no completion hook
 *   for that mode.
 * - Agent jobs are surfaced to the UI as `agentJob` events.
 *
 * The wire shape mirrors the web task API exactly ({code,data,msg} envelope,
 * same routes) so the 15 skills work unchanged with OIA_BASE_URL swapped.
 */

const MAX_BODY_BYTES = 50 * 1024 * 1024;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_SUBMITS = 20;
const NO_WAIT_TTL_MS = 6.5 * 60 * 1000; // planner 120s + image 300s + margin

export interface AgentJobEvent {
  type: "agentJob";
  taskId: string;
  event: "submitted" | "succeeded" | "failed";
  taskType: string;
}

interface LoopbackDeps {
  ctx: () => ServiceContext;
  userDataDir: string;
  env: Record<string, string | undefined>;
  emit: (ev: AgentJobEvent) => void;
}

function json(res: ServerResponse, status: number, code: number, data: unknown, msg: string): void {
  const body = JSON.stringify({ code, data, msg });
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

/** Read the body with a hard cap; returns null when the client oversize. */
async function readBody(req: IncomingMessage): Promise<Buffer | null> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > MAX_BODY_BYTES) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/** Minimal multipart/form-data parser: the FIRST file part wins (name + bytes). */
function parseMultipart(body: Buffer, contentType: string): { name: string; bytes: Uint8Array } | null {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = m?.[1] ?? m?.[2];
  if (!boundary) return null;
  const delim = Buffer.from(`--${boundary}`);
  let pos = body.indexOf(delim);
  while (pos !== -1) {
    const headStart = pos + delim.length;
    const headEnd = body.indexOf("\r\n\r\n", headStart);
    if (headEnd === -1) return null;
    const headers = body.subarray(headStart, headEnd).toString("utf8");
    const next = body.indexOf(delim, headEnd + 4);
    if (next === -1) return null;
    const data = body.subarray(headEnd + 4, next - 2); // -2: trailing \r\n
    if (/content-disposition:/i.test(headers) && /filename="/i.test(headers)) {
      const name = /filename="([^"]+)"/i.exec(headers)?.[1] ?? "upload.png";
      return { name, bytes: new Uint8Array(data) };
    }
    pos = next;
  }
  return null;
}

export async function startLoopback(deps: LoopbackDeps): Promise<{ port: number; discoveryFile: string; close: () => Promise<void> }> {
  const { ctx, emit } = deps;
  const imageProvider = (deps.env.IMAGE_PROVIDER ?? "mock").toLowerCase();
  const codexGuard = imageProvider === "codex";

  // --- per-key rate limiting + in-flight guard --------------------------------
  const submitsPerKey = new Map<string, number[]>();
  let agentInFlight = 0;
  const inFlightTTLs = new Set<ReturnType<typeof setTimeout>>();

  function rateLimited(key: string): boolean {
    const now = Date.now();
    const recent = (submitsPerKey.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_MAX_SUBMITS) return true;
    recent.push(now);
    submitsPerKey.set(key, recent);
    return false;
  }

  function settle(taskId: string, ok: boolean, type: string): void {
    agentInFlight = Math.max(0, agentInFlight - 1);
    emit({ type: "agentJob", taskId, event: ok ? "succeeded" : "failed", taskType: type });
  }

  const server: Server = createServer(async (req, res) => {
    try {
      // Gate 1 — Host must be the literal loopback origin (DNS-rebinding kill).
      const expectedHost = `127.0.0.1:${port}`;
      if (req.headers.host !== expectedHost) return json(res, 403, 403, null, "forbidden host");

      // Gate 2 — no browser origins, ever.
      if (req.headers.origin !== undefined) return json(res, 403, 403, null, "browser origins are not allowed");

      // Gate 3 — key via Authorization header only.
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.searchParams.has("key") || url.searchParams.has("access_token") || url.searchParams.has("apiKey")) {
        return json(res, 401, 401, null, "api key must not travel in the query string");
      }
      const auth = (req.headers.authorization ?? "").trim();
      if (!auth) return json(res, 401, 401, null, "missing authorization header");
      const keyRecord = ctx().keys.verify(auth);
      if (!keyRecord) return json(res, 401, 401, null, "API key is invalid or expired");

      const segments = url.pathname.split("/").filter(Boolean); // ["api", ...]

      // ---- GET /api/files/:key — authed bytes for agents (oia:// is Electron-only).
      //      Keys contain path segments (uploads/20261030/xxx.png) — take the REST.
      if (req.method === "GET" && segments[0] === "api" && segments[1] === "files" && segments.length >= 3) {
        const key = decodeURIComponent(segments.slice(2).join("/"));
        const bytes = await ctx().files.read(key);
        const ext = key.split(".").pop() ?? "";
        res.writeHead(200, {
          "content-type": ctx().files.contentType(ext),
          "content-length": String(bytes.length),
          "cache-control": "private, max-age=3600",
        });
        res.end(Buffer.from(bytes));
        return;
      }

      // ---- POST /api/tasks/:type — submit (skill contract: source "skill"/"agent")
      if (req.method === "POST" && segments[0] === "api" && segments[1] === "tasks" && segments.length === 3) {
        const type = segments[2];
        if (type === "cancel") {
          const body = JSON.parse((await readBody(req))?.toString("utf8") ?? "{}") as { taskId?: string };
          if (!body.taskId) return json(res, 400, 1, null, "taskId is required");
          const cancelled = await ctx().taskStore.cancel(body.taskId);
          return json(res, 200, 0, { taskId: body.taskId, cancelled }, "");
        }
        const parsedType = taskTypeSchema.safeParse(type);
        if (!parsedType.success) return json(res, 404, 404, null, "unknown task type");

        if (rateLimited(keyRecord.id)) return json(res, 429, 429, null, "rate limit: too many submissions, retry later");
        if (codexGuard && agentInFlight >= 1) {
          return json(res, 429, 429, null, "a generation is already running (codex serializes); poll and retry");
        }

        const raw = await readBody(req);
        if (raw === null) return json(res, 413, 413, null, "body too large");
        const body = JSON.parse(raw.toString("utf8") || "{}") as Record<string, unknown>;

        agentInFlight += 1;
        let t: { taskId: string; progress: string };
        try {
          // EXACT web-route semantics: noWait:true awaits completion (sync mode),
          // otherwise returns the snapshot and runs in the background.
          t = (await ctx().taskStore.submit(parsedType.data as TaskType, body, {
            sessionId: typeof body.sessionId === "number" ? body.sessionId : undefined,
            noWait: body.noWait === true,
            source: "agent",
          })) as { taskId: string; progress: string };
        } catch (err) {
          agentInFlight = Math.max(0, agentInFlight - 1);
          return json(res, 400, 1, null, err instanceof Error ? err.message : "submit failed");
        }
        emit({ type: "agentJob", taskId: t.taskId, event: "submitted", taskType: type });

        if (body.noWait === true) {
          // sync mode: submit already awaited the FINAL status — settle now
          settle(t.taskId, t.progress === "succeeded", type);
        } else {
          // fire-and-forget: TTL guard until TaskStore exposes a completion hook
          const timer = setTimeout(() => {
            inFlightTTLs.delete(timer);
            agentInFlight = Math.max(0, agentInFlight - 1);
          }, NO_WAIT_TTL_MS);
          inFlightTTLs.add(timer);
        }
        return json(res, 200, 0, t, "");
      }

      // ---- GET /api/tasks/:id — poll
      if (req.method === "GET" && segments[0] === "api" && segments[1] === "tasks" && segments.length === 3) {
        try {
          return json(res, 200, 0, ctx().taskStore.get(segments[2]), "");
        } catch (err) {
          // TaskNotFound crosses the bundle boundary as a plain Error — its message
          // ("task not found") + taskId property are the stable contract (24h TTL).
          const e = err as Error & { taskId?: string };
          if (e instanceof Error && e.message === "task not found" && e.taskId === segments[2]) {
            return json(res, 404, 404, null, "task not found");
          }
          throw err;
        }
      }

      // ---- POST /api/upload/direct — multipart file → FileStore (NSFW-gated)
      if (req.method === "POST" && segments[0] === "api" && segments[1] === "upload" && segments[2] === "direct") {
        const raw = await readBody(req);
        if (raw === null) return json(res, 413, 413, null, "body too large");
        const file = parseMultipart(raw, req.headers["content-type"] ?? "");
        if (!file) return json(res, 400, 1, null, "file required (multipart form-data)");
        const nsfw = await checkNsfw(file.bytes, file.name);
        if (!nsfw.allowed) return json(res, 400, 1, null, nsfw.error);
        const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
        const saved = await ctx().files.put(file.bytes, ext);
        return json(res, 200, 0, { url: saved.url, size: file.bytes.length }, "");
      }

      return json(res, 404, 404, null, "not found");
    } catch (err) {
      return json(res, 500, 1, null, err instanceof Error ? err.message : String(err));
    }
  });

  // random free port on loopback ONLY
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address() === null ? 0 : (server.address() as { port: number }).port));
  });

  // discovery file — agents read the port from here (OIA_BASE_URL stays optional)
  const discoveryFile = path.join(deps.userDataDir, "agent-api.json");
  const discovery = { port, pid: process.pid, createdAt: Date.now(), nonce: randomUUID() };
  await writeFile(discoveryFile, JSON.stringify(discovery, null, 2), { encoding: "utf8", mode: 0o600 });
  await chmod(discoveryFile, 0o600).catch(() => {}); // belt & braces: mode can be masked by umask

  const close = async (): Promise<void> => {
    for (const t of inFlightTTLs) clearTimeout(t);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await unlink(discoveryFile).catch(() => {});
  };

  return { port, discoveryFile, close };
}
