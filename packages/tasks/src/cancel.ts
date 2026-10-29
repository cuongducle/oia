/**
 * TP.5 (Slice 4) — the cross-process cancel contract.
 *
 * The chat SSE path cancels in-process (libs/job-controllers.ts on the web side).
 * Task-API jobs MOVE to the worker when REDIS_URL is set — cancelling those needs a
 * cross-process signal: a Redis pub/sub channel `oia:cancel:<jobId>`. The contract and
 * the worker-side consumption ship here; every process also keeps a local registry so
 * in-process cancels never touch Redis.
 *
 * Test-covered, validation-unexercised: no Stage-0 session runs the worker (design note).
 */

export const CANCEL_CHANNEL_PREFIX = "oia:cancel:";
export const CANCEL_PATTERN = `${CANCEL_CHANNEL_PREFIX}*`;

/** Per-process jobId → AbortController registry (same shape as the web chat registry). */
const g = globalThis as unknown as { __oiaTaskControllers?: Map<string, AbortController> };

export function localControllers(): Map<string, AbortController> {
  g.__oiaTaskControllers ??= new Map();
  return g.__oiaTaskControllers;
}

export function registerCancelable(jobId: string, ac: AbortController): void {
  localControllers().set(jobId, ac);
}

export function releaseCancelable(jobId: string): void {
  localControllers().delete(jobId);
}

/** Abort a job in THIS process. Returns false for unknown/finished jobs (idempotent). */
export function abortLocal(jobId: string): boolean {
  const ac = localControllers().get(jobId);
  if (!ac || ac.signal.aborted) return false;
  ac.abort("task-cancel");
  return true;
}

export interface CancelBridge {
  /** Publish a cancel so OTHER processes (the worker) abort their in-flight job (by every id it may be known under). */
  publish(...ids: string[]): Promise<void>;
  /** Stop the subscriber connection (worker shutdown). */
  close(): Promise<void>;
}

/** Minimal structural type — avoids importing ioredis types at compile time. */
interface RedisLike {
  publish(channel: string, msg: string): Promise<number>;
  psubscribe(pattern: string): Promise<unknown>;
  on(event: string, cb: (...args: never[]) => void): unknown;
  quit(): Promise<unknown>;
}

type RedisCtor = new (opts: Record<string, unknown>) => RedisLike;

async function redisCtor(): Promise<RedisCtor> {
  const mod = (await import("ioredis")) as unknown as { default: RedisCtor };
  return mod.default;
}

/**
 * Worker side: subscribe to `oia:cancel:*` and abort matching local jobs.
 * Lazy-imports ioredis (already in the tree via bullmq; absent in in-process dev/CI).
 */
export async function createCancelSubscriber(
  opts: { redisUrl?: string; connection?: unknown } = {},
): Promise<CancelBridge> {
  const url = new URL(opts.redisUrl ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
  const connection = (opts.connection as Record<string, unknown>) ?? {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    lazyConnect: false,
    maxRetriesPerRequest: null,
  };
  const Redis = await redisCtor();
  const sub = new Redis(connection);
  await sub.psubscribe(CANCEL_PATTERN);
  sub.on("pmessage", (_pattern: string, channel: string) => {
    const jobId = channel.slice(CANCEL_CHANNEL_PREFIX.length);
    abortLocal(jobId);
  });
  return {
    async publish() {
      /* subscriber-side bridge never publishes */
    },
    async close() {
      await sub.quit().catch(() => {});
    },
  };
}

/** Web side: publish-only bridge (its own jobs cancel locally; the worker's via Redis). */
export async function createCancelPublisher(opts: { redisUrl?: string; connection?: unknown } = {}): Promise<CancelBridge> {
  const url = new URL(opts.redisUrl ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
  const connection = (opts.connection as Record<string, unknown>) ?? {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: null,
  };
  const Redis = await redisCtor();
  const pub = new Redis(connection);
  return {
    async publish(...ids: string[]) {
      await Promise.all(ids.map((id) => pub.publish(CANCEL_CHANNEL_PREFIX + id, "1").catch(() => {})));
    },
    async close() {
      await pub.quit().catch(() => {});
    },
  };
}
