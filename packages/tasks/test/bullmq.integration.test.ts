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
async function redisUp(timeoutMs = 600): Promise<boolean> {
  const { host, port } = parseRedis(REDIS_URL);
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const t = setTimeout(() => { s.destroy(); resolve(false); }, timeoutMs);
    s.on("connect", () => { clearTimeout(t); s.destroy(); resolve(true); });
    s.on("error", () => { clearTimeout(t); resolve(false); });
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
