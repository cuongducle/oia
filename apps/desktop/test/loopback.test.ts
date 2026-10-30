import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, statSync, readFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServiceContext, runChat, type ServiceContext } from "@oia/services";
import { startLoopback } from "../src/utility/loopback.js";
import type { AgentJobEvent } from "../src/utility/loopback.js";

const execFileAsync = promisify(execFile);

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

  it("discovery file is private (POSIX 0600 / Windows user-only ACL) and carries the live port + pid", async () => {
    // fs mode is a NO-OP on Windows (stat always reports 0666) — what 0600 MEANS
    // there is an ACL without inheritance and with only the current user, so the
    // gate asserts exactly that instead of mode bits it can never observe.
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("icacls", [discoveryFile]);
      const me = userInfo();
      const whoami = me.domain ? `${me.domain}\\${me.username}` : me.username;
      expect(stdout).toContain(whoami); // the owner keeps access
      expect(stdout.toLowerCase()).not.toContain("builtin\\users"); // no broad local group
      expect(stdout.toLowerCase()).not.toContain("everyone"); // no world ACE
    } else {
      const st = statSync(discoveryFile);
      expect(st.mode & 0o777).toBe(0o600);
    }
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
      return { urls: ["/api/files/res-held.png"], note: "held" };
    });

    const srv = await startLoopback({ ctx: () => guardCtx, userDataDir: root, env: {}, emit: () => {} });
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

/** Readiness-review hardening: client errors are 400s, 500s never leak internals, uploads share the IPC image allowlist. */
describe("loopback error hygiene (T1 follow-ups)", () => {
  it("a malformed JSON body is a 400 with a stable message — not a leaked 500", async () => {
    const res = await fetch(`${base()}/api/tasks/generate-poster`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe("request body is not valid JSON");
  });

  it("upload/direct accepts ONLY image extensions — same allowlist as the IPC path", async () => {
    const boundary = "oia-test-boundary";
    const part = `--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="payload.exe"\r\n\r\nMZ\x00\x00\r\n--${boundary}--\r\n`;
    const res = await fetch(`${base()}/api/upload/direct`, {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}`, authorization: key },
      body: part,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toContain("unsupported image type");
  });

  it("file GETs: an invalid key is a 400, a missing file is a 404 — client errors, never leaked 500s", async () => {
    // absolute key → the store refuses the shape itself → 400
    const absKey = await fetch(`${base()}/api/files/%2Fetc%2Fpasswd`, { headers: { authorization: key } });
    expect(absKey.status).toBe(400);
    expect(((await absKey.json()) as { msg: string }).msg).toBe("invalid file key");

    // traversal is SANITIZED (leading ../ stripped) → becomes a path under the store
    // root that does not exist → 404, never a filesystem walk outside the root
    const traversal = await fetch(`${base()}/api/files/..%2F..%2Fetc%2Fpasswd`, { headers: { authorization: key } });
    expect(traversal.status).toBe(404);

    const missing = await fetch(`${base()}/api/files/uploads/20260101/nope-${Date.now()}.png`, { headers: { authorization: key } });
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { msg: string }).msg).toBe("file not found");
  });
});

/**
 * Regression of THIS round's own T1 fix — the track-AFTER-submit guard had two
 * defects, both reproduced here:
 * 1. noWait:true pinned the slot (onSettled released a never-tracked id, then the
 *    late track held it until the fallback TTL — and the TTL then emitted a
 *    spurious "failed" after a success, B7 violation);
 * 2. TOCTOU: concurrent submits each passed the busy check before any tracked.
 * The reservation is now made synchronously before the submit await.
 */
describe("guard reservation — synchronous, exactly-once", () => {
  const meteredCaps = () => ({
    referenceImages: true,
    sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
    transparentBg: false,
    isMock: false as const,
  });

  async function guardCtx() {
    const root = mkdtempSync(path.join(tmpdir(), "oia-loopback-res-"));
    const gctx = await createServiceContext({
      dataDir: path.join(root, "data"),
      env: { ...process.env, IMAGE_PROVIDER: "mock", LLM_PROVIDER: "mock" },
    });
    // metered (isMock:false) image provider — what codex mode looks like to the guard
    (gctx.chat as { image: unknown }).image = {
      name: "metered-probe",
      capabilities: meteredCaps(),
      isAvailable: async () => ({ ok: true, detail: "probe" }),
      generate: async () => { throw new Error("nothing metered may actually start in these tests"); },
    };
    return { root, gctx, key: (await gctx.keys.create("res-test")).plaintext };
  }

  it("noWait:true — slot free right after completion; NO spurious 'failed' after a success", async () => {
    const { root, gctx, key } = await guardCtx();
    const events: AgentJobEvent[] = [];
    gctx.taskStore.register("generate-poster", async () => {
      await new Promise<void>((r) => setTimeout(r, 25)); // brief, deliberate
      return { urls: ["/api/files/res-sync.png"], note: "sync-mode" };
    });
    const srv = await startLoopback({
      ctx: () => gctx,
      userDataDir: root,
      env: {},
      emit: (ev) => events.push(ev),
      fallbackTtlMs: 150, // if the bug existed, the spurious "failed" lands here — observable
    });
    try {
      const g = `http://127.0.0.1:${srv.port}`;
      const submit = (body: Record<string, unknown>) =>
        fetch(`${g}/api/tasks/generate-poster`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: key },
          body: JSON.stringify(body),
        });

      const first = await submit({ prompt: "sync mode", noWait: true });
      expect(first.status).toBe(200);
      expect(((await first.json()) as { data: { progress: string } }).data.progress).toBe("succeeded");

      // BROKEN code: the late track still holds the slot → 429 here (the 15-min pin)
      const second = await submit({ prompt: "immediately after" });
      expect(second.status).toBe(200); // FIXED code: the reservation was released at settle

      await new Promise((r) => setTimeout(r, 400)); // past fallbackTtlMs
      const failed = events.filter((e) => e.event === "failed");
      expect(failed).toHaveLength(0); // BROKEN code: TTL fired a "failed" after a success
      expect(events.some((e) => e.event === "succeeded")).toBe(true);
    } finally {
      delete (globalThis as unknown as { __oiaMeteredInFlight?: unknown }).__oiaMeteredInFlight;
      await srv.close().catch(() => {});
    }
  }, 30_000);

  it("concurrent submits — exactly ONE wins the slot (no TOCTOU window)", async () => {
    const { root, gctx, key } = await guardCtx();
    let openGate!: () => void;
    const gate = new Promise<void>((r) => (openGate = r));
    gctx.taskStore.register("generate-poster", async () => {
      await gate;
      return { urls: ["/api/files/res-held.png"], note: "held" };
    });
    const srv = await startLoopback({ ctx: () => gctx, userDataDir: root, env: {}, emit: () => {} });
    try {
      const g = `http://127.0.0.1:${srv.port}`;
      const shot = () =>
        fetch(`${g}/api/tasks/generate-poster`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: key },
          body: JSON.stringify({ prompt: "race" }),
        }).then((r) => r.status);
      const codes = await Promise.all([shot(), shot(), shot(), shot(), shot()]);
      expect(codes.filter((c) => c === 200)).toHaveLength(1); // BROKEN code: several 200s — two paid runs at once
      expect(codes.filter((c) => c === 429)).toHaveLength(4);
      openGate();
    } finally {
      openGate?.();
      delete (globalThis as unknown as { __oiaMeteredInFlight?: unknown }).__oiaMeteredInFlight;
      await srv.close().catch(() => {});
    }
  }, 30_000);

  it("a submit that fails validation releases its reservation (no leak on the error path)", async () => {
    const { root, gctx, key } = await guardCtx();
    gctx.taskStore.register("generate-poster", async () => ({ urls: ["/api/files/res-fast.png"], note: "fast" }));
    const srv = await startLoopback({ ctx: () => gctx, userDataDir: root, env: {}, emit: () => {} });
    try {
      const g = `http://127.0.0.1:${srv.port}`;
      // image-edit requires reference[] + prompt — TaskStore.validate throws → 400
      const bad = await fetch(`${g}/api/tasks/image-edit`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: key },
        body: JSON.stringify({}),
      });
      expect(bad.status).toBe(400);
      const next = await fetch(`${g}/api/tasks/generate-poster`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: key },
        body: JSON.stringify({ prompt: "after a failed submit" }),
      });
      expect(next.status).toBe(200); // a leaked reservation would 429 here
    } finally {
      delete (globalThis as unknown as { __oiaMeteredInFlight?: unknown }).__oiaMeteredInFlight;
      await srv.close().catch(() => {});
    }
  }, 30_000);
});
