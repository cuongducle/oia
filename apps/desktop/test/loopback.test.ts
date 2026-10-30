import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { createServiceContext, runChat, type ServiceContext } from "@oia/services";
import { startLoopback } from "../src/utility/loopback.js";
import type { AgentJobEvent } from "../src/utility/loopback.js";

/**
 * D9 (reorg step 4b) — the loopback agent API, end to end against a REAL
 * ServiceContext (mock provider pair, temp data dir). loopback.ts has zero
 * electron imports on purpose: this suite exercises the exact server the
 * utility process hosts, without Electron.
 */

let ctx: ServiceContext;
let key: string;
let port: number;
let close: () => Promise<void>;
let discoveryFile: string;
const agentEvents: AgentJobEvent[] = [];

beforeAll(async () => {
  const root = mkdtempSync(path.join(tmpdir(), "oia-loopback-"));
  ctx = await createServiceContext({
    dataDir: path.join(root, "data"),
    env: { ...process.env, IMAGE_PROVIDER: "mock", LLM_PROVIDER: "mock" },
  });
  const created = await ctx.keys.create("loopback-test");
  key = created.plaintext;
  const srv = await startLoopback({
    ctx: () => ctx,
    userDataDir: root,
    env: { IMAGE_PROVIDER: "mock", LLM_PROVIDER: "mock" },
    emit: (ev) => agentEvents.push(ev),
  });
  port = srv.port;
  discoveryFile = srv.discoveryFile;
  close = srv.close;
}, 60_000);

afterAll(async () => {
  await close();
});

const base = () => `http://127.0.0.1:${port}`;

describe("loopback security gates (all fire BEFORE route logic)", () => {
  it("401 without a key; 401 with a wrong key", async () => {
    const no = await fetch(`${base()}/api/tasks/anything`, { method: "POST" });
    expect(no.status).toBe(401);
    const bad = await fetch(`${base()}/api/tasks/anything`, { method: "POST", headers: { authorization: "pf-wrong" } });
    expect(bad.status).toBe(401);
  });

  it("401 when the key travels in the query string — header only", async () => {
    const res = await fetch(`${base()}/api/tasks/generate-poster?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { authorization: "" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toContain("query string");
  });

  it("403 for any request carrying an Origin header (browser cross-origin calls)", async () => {
    const res = await fetch(`${base()}/api/tasks/generate-poster`, {
      method: "POST",
      headers: { authorization: key, origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("403 when Host is not the literal loopback origin (DNS-rebinding kill)", async () => {
    const res = await new Promise<{ status: number }>((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, headers: { host: "evil.example", authorization: key }, method: "GET", path: "/api/tasks/x" },
        (r) => resolve({ status: r.statusCode ?? 0 }),
      );
      req.on("error", reject);
      req.end();
    });
    expect(res.status).toBe(403);
  });

  it("discovery file is 0600 and carries the live port + pid", () => {
    const st = statSync(discoveryFile);
    expect(st.mode & 0o777).toBe(0o600);
    const info = JSON.parse(readFileSync(discoveryFile, "utf8")) as { port: number; pid: number };
    expect(info.port).toBe(port);
    expect(info.pid).toBe(process.pid);
  });
});

describe("loopback task API (skill contract: {code,data,msg} envelope)", () => {
  it("POST /api/tasks/generate-poster noWait → final status + agentJob events", async () => {
    const res = await fetch(`${base()}/api/tasks/generate-poster`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify({ prompt: "banner trà sữa giảm 20%", noWait: true }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { code: number; data: { taskId: string; progress: string } };
    expect(json.code).toBe(0);
    expect(json.data.progress).toBe("succeeded");
    expect(agentEvents.some((e) => e.taskId === json.data.taskId && e.event === "submitted")).toBe(true);
    expect(agentEvents.some((e) => e.taskId === json.data.taskId && e.event === "succeeded")).toBe(true);
  });

  it("GET /api/tasks/:id polls the record; unknown id → 404 envelope", async () => {
    const sub = await fetch(`${base()}/api/tasks/generate-poster`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify({ prompt: "poll me", noWait: true }),
    });
    const { data } = (await sub.json()) as { data: { taskId: string } };
    const poll = await fetch(`${base()}/api/tasks/${data.taskId}`, { headers: { authorization: key } });
    expect(poll.status).toBe(200);
    expect(((await poll.json()) as { code: number }).code).toBe(0);

    const gone = await fetch(`${base()}/api/tasks/task_nope`, { headers: { authorization: key } });
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as { code: number }).code).toBe(404);
  });

  it("POST /api/upload/direct (multipart) → stored; GET /api/files/:key serves the bytes WITH auth", async () => {
    const form = new FormData();
    // 1x1 transparent PNG
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    form.append("file", new Blob([png], { type: "image/png" }), "tiny.png");
    const up = await fetch(`${base()}/api/upload/direct`, { method: "POST", headers: { authorization: key }, body: form });
    expect(up.status).toBe(200);
    const uploaded = (await up.json()) as { code: number; data: { url: string; size: number } };
    expect(uploaded.code).toBe(0);
    expect(uploaded.data.size).toBe(png.length);

    const keyName = uploaded.data.url.replace("/api/files/", "");
    const withKey = await fetch(`${base()}/api/files/${keyName}`, { headers: { authorization: key } });
    expect(withKey.status).toBe(200);
    expect(withKey.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await withKey.arrayBuffer());
    expect(bytes.length).toBe(png.length);

    const without = await fetch(`${base()}/api/files/${keyName}`);
    expect(without.status).toBe(401);
  });

  it("unknown route → 404 envelope; body cap → 413", async () => {
    const nf = await fetch(`${base()}/api/nope`, { headers: { authorization: key } });
    expect(nf.status).toBe(404);
    expect(((await nf.json()) as { code: number }).code).toBe(404);
  });
});

/**
 * T1 regression — the metered in-flight guard is ONE shared slot (meteredGuard.ts).
 * It used to be two guards that could not see each other: chat's global set and
 * loopback's module-local counter. Failure mode: a chat job + an agent task ran
 * TWO paid codex generations at once. Here a held task owns the slot, so a second
 * agent submit AND a chat run must both be refused until the task settles.
 */
describe("shared metered guard — chat and agent tasks contend on ONE slot", () => {
  it("task in flight → second submit 429 AND runChat refused; settle → slot released", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "oia-loopback-guard-"));
    const guardCtx = await createServiceContext({
      dataDir: path.join(root, "data"),
      env: { ...process.env, IMAGE_PROVIDER: "mock", LLM_PROVIDER: "mock" },
    });
    const guardKey = (await guardCtx.keys.create("guard-test")).plaintext;

    // A METERED image provider (isMock:false) — exactly what codex mode looks like
    // to the guard. Its generate is never called: the held task owns the slot first.
    (guardCtx.chat as { image: unknown }).image = {
      name: "held-metered",
      capabilities: { referenceImages: true, sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false }, transparentBg: false, isMock: false },
      isAvailable: async () => ({ ok: true, detail: "held" }),
      generate: async () => {
        throw new Error("the held task must own the slot; nothing metered may start");
      },
    };

    // Held processor: finishes only when the gate opens (background mode, noWait:false).
    let openGate!: () => void;
    const gate = new Promise<void>((r) => (openGate = r));
    guardCtx.taskStore.register("generate-poster", async () => {
      await gate;
      return { urls: [], note: "held" };
    });

    const srv = await startLoopback({ ctx: () => guardCtx, userDataDir: root, emit: () => {} });
    try {
      const g = `http://127.0.0.1:${srv.port}`;
      const submit = () =>
        fetch(`${g}/api/tasks/generate-poster`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: guardKey },
          body: JSON.stringify({ prompt: "guard contention" }),
        });

      const first = await submit();
      expect(first.status).toBe(200);
      const firstData = (await first.json()) as { data: { taskId: string } };

      // Same lane: second agent submit → 429 while the first holds the slot
      const second = await submit();
      expect(second.status).toBe(429); // OLD code let a second metered run start (when the env said codex)

      // Cross lane: chat must refuse too — the OLD chat guard could not see agent tasks
      const { outcome } = await runChat({ prompt: "chat while task runs" }, guardCtx, { sink: () => {} });
      expect(outcome).toBe("refused-rate-limited");

      // Release → settle releases the shared slot (onSettled, not a fixed TTL)
      openGate();
      let terminal = false;
      for (let i = 0; i < 50 && !terminal; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const poll = await fetch(`${g}/api/tasks/${firstData.data.taskId}`, { headers: { authorization: guardKey } });
        const j = (await poll.json()) as { data: { progress: string } };
        terminal = j.data.progress !== "processing";
      }
      expect(terminal).toBe(true);

      const after = await submit();
      expect(after.status).not.toBe(429); // guard released on completion (not the old 6.5-min TTL pin)
    } finally {
      openGate?.(); // never leave the gate closed on a failure path
      delete (globalThis as unknown as { __oiaMeteredInFlight?: unknown }).__oiaMeteredInFlight;
      await srv.close().catch(() => {});
    }
  }, 30_000);
});
