import { describe, expect, it } from "vitest";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";

/**
 * Multi-process integration: spawns the real worker (dist/index.js) and submits a job
 * from this process over real Redis → the worker consumes it → a mock processor renders a PNG →
 * the FileStore writes into the shared data dir → the test reads the bytes and checks the PNG magic.
 */
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

/** Probe with a real PING (not a bare TCP connect): a Redis answering NOAUTH/ERR
 *  (another project's passworded container on :6379) is NOT usable — soft-skip then. */
async function redisUp(): Promise<boolean> {
  const u = new URL(REDIS_URL);
  return new Promise((resolve) => {
    const s = net.connect({ host: u.hostname, port: Number(u.port || 6379) });
    let buf = "";
    const done = (ok: boolean) => { clearTimeout(t); s.destroy(); resolve(ok); };
    const t = setTimeout(() => done(false), 1500);
    s.on("connect", () => s.write(u.password ? `AUTH ${u.password}\r\nPING\r\n` : "PING\r\n"));
    s.on("data", (d) => {
      buf += d.toString();
      if (buf.includes("+PONG")) done(true);
      else if (buf.trimStart().startsWith("-")) done(false);
    });
    s.on("error", () => done(false));
  });
}

async function waitForFile(root: string, timeoutMs = 40_000): Promise<string | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const dir = path.join(root, "files", "uploads");
    try {
      for (const day of await readdir(dir)) {
        const files = await readdir(path.join(dir, day)).catch(() => []);
        for (const f of files) if (f.endsWith(".png")) return path.join(dir, day, f);
      }
  } catch { /* not built yet */ }
    await new Promise((r) => setTimeout(r, 800));
  }
  return null;
}

  describe("INT-WORKER-E2E real worker process ← Redis ← submitter", () => {
    it("submit → a separate worker process writes a PNG into the shared FileStore", async () => {
    if (!(await redisUp())) {
      console.warn("[skip] Redis is not running — REDIS_URL=" + REDIS_URL);
      return;
    }
    // build worker
    execSync("npx tsc -p tsconfig.json", { cwd: process.cwd(), stdio: "pipe" });

    const dataDir = mkdtempSync(path.join(tmpdir(), "pf-worker-e2e-"));
    let child: ChildProcess | undefined;
    try {
      child = spawn("node", ["dist/index.js"], {
        cwd: process.cwd(),
        env: { ...process.env, REDIS_URL, OIA_DATA_DIR: dataDir, IMAGE_PROVIDER: "mock", LLM_PROVIDER: "mock", OIA_QUEUE_PREFIX: "e2e" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let ready = false;
      child.stdout!.on("data", (d) => { if (String(d).includes("ready")) ready = true; });
      child.stderr!.on("data", (d) => console.error("[worker-stderr]", String(d).slice(0, 300)));

      // wait for the worker to be ready
      for (let i = 0; i < 40 && !ready; i++) await new Promise((r) => setTimeout(r, 500));
      expect(ready).toBe(true);

      // submit from the TEST process (plain queue, no competing worker here)
      const { Queue } = await import("bullmq");
      const u = new URL(REDIS_URL);
      const queue = new Queue("oia-tasks", {
        connection: { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined } as never,
        prefix: "e2e", // matches the child worker’s OIA_QUEUE_PREFIX — isolated from other tests
      });
      await queue.add("task:generate-poster", {
        taskId: `task_e2e_${Date.now()}`,
        sessionId: 1,
        type: "generate-poster",
        params: { prompt: "worker e2e pastel poster" },
      }, { jobId: `e2e_${Date.now()}` });
      await queue.close();

      // the worker processes it → a PNG appears in the shared dataDir
      const file = await waitForFile(dataDir);
      expect(file, "the worker must write the PNG into the shared FileStore").not.toBeNull();
      const bytes = new Uint8Array(await readFile(file!));
      expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]); // PNG magic — mock provider offline
    } finally {
      child?.kill("SIGINT");
      await new Promise((r) => setTimeout(r, 500));
    }
  }, 90_000);
});
