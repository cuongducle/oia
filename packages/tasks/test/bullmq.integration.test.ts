import { describe, expect, it } from "vitest";
import net from "node:net";
import { createQueueBackend } from "../src/bullmq.js";
import type { TaskJob } from "../src/queue.js";

/** INTEGRATION: BullMQ + real Redis — runs only when Redis is available (docker compose up redis, or REDIS_URL set). */
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
function parseRedis(url: string): { host: string; port: number; password?: string } {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined };
}
/**
 * Probe with a real PING (not a bare TCP connect): a Redis that answers NOAUTH/ERR
 * (e.g. another project's passworded container on :6379) is NOT usable — soft-skip then.
 */
async function redisUp(timeoutMs = 1500): Promise<boolean> {
  const { host, port, password } = parseRedis(REDIS_URL);
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    let buf = "";
    const done = (ok: boolean) => { clearTimeout(t); s.destroy(); resolve(ok); };
    const t = setTimeout(() => done(false), timeoutMs);
    s.on("connect", () => s.write(password ? `AUTH ${password}\r\nPING\r\n` : "PING\r\n"));
    s.on("data", (d) => {
      buf += d.toString();
      if (buf.includes("+PONG")) done(true);          // usable Redis
      else if (buf.trimStart().startsWith("-")) done(false); // NOAUTH / ERR / DENIED — not usable
    });
    s.on("error", () => done(false));
  });
}

describe("INT-WORKER BullMQ over real Redis", () => {
  it("submit → worker consumes → handler runs (soft-skip without Redis)", async () => {
    if (!(await redisUp())) {
      console.warn("[skip] Redis is not running — start it with: docker compose -f docker/docker-compose.yml up -d redis");
      return;
    }
    const seen: string[] = [];
  // a per-run prefix fully isolates leftover jobs from earlier runs
  // (lesson: "bull" is BullMQ’s DEFAULT prefix — never use it as a test prefix)
    const runPrefix = `int-${Date.now().toString(36)}`;
    const backend = await createQueueBackend(
      { "generate-poster": async (job) => void seen.push(job.taskId) },
      { redisUrl: REDIS_URL, queuePrefix: runPrefix },
    );
    expect(backend.kind).toBe("bullmq");
    const job: TaskJob = { taskId: `task_int_${Date.now()}`, sessionId: 1, type: "generate-poster", params: { prompt: "int" } };
    await backend.submit(job);
  // wait for the worker to consume (createQueueBackend starts the worker)
    for (let i = 0; i < 30 && seen.length === 0; i++) await new Promise((r) => setTimeout(r, 500));
    expect(seen).toEqual([job.taskId]);
    await backend.close();
  }, 45_000);
});
