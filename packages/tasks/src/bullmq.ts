import { Queue, Worker, type Processor } from "bullmq";
import type { TaskType } from "@oia/schema";
import type { TaskJob } from "./queue.js";

/**
 * BR-W: worker queue.
 * - With REDIS_URL set → BullMQ (queue "oia-tasks"); job name = task type
 * - Without Redis → InProcessQueue (dev/CI need no docker)
 * - Job payloads keep the TaskJob shape — the two backends are interchangeable
 */
/**
 * BullMQ queue names must not contain ":" (BullMQ 6 forbids it; ":" separates the Redis key namespace).
 * This only shows up with real Redis; in-process runs never catch it.
 */
export const QUEUE_NAME = "oia-tasks";

export function buildJobName(type: TaskType): string {
  return `task:${type}`;
}

export function splitJobName(name: string): TaskType {
  const type = name.replace(/^task:/, "");
  return type as TaskType;
}

export interface QueueBackend {
  readonly kind: "bullmq" | "inprocess";
  submit(job: TaskJob): Promise<void>;
  close(): Promise<void>;
}

/** Standard factory: picks the backend from the environment. */
export async function createQueueBackend(
  handlers: Partial<Record<TaskType, (job: TaskJob) => Promise<void>>>,
  opts: { redisUrl?: string; connection?: unknown; queuePrefix?: string } = {},
): Promise<QueueBackend> {
  const redisUrl = opts.redisUrl ?? process.env.REDIS_URL;
  if (redisUrl) {
    const url = new URL(redisUrl);
    const connection = (opts.connection as object) ?? {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
    };
// A dedicated prefix isolates deployments/tests sharing one Redis (prevents
// parallel runs from stealing each other’s jobs — found via a full pnpm test)
    const prefix = opts.queuePrefix ?? process.env.OIA_QUEUE_PREFIX ?? "bull";
    const queue = new Queue(QUEUE_NAME, { connection: connection as never, prefix });
    const dispatch: Processor = async (bullJob) => {
      const job = bullJob.data as TaskJob;
      const handler = handlers[job.type];
      if (!handler) throw new Error(`no handler for ${job.type}`);
      await handler(job);
    };
    const worker = new Worker(QUEUE_NAME, dispatch, { connection: connection as never, prefix });
    return {
      kind: "bullmq",
      async submit(job) {
        await queue.add(buildJobName(job.type), job, {
          jobId: job.taskId,
          attempts: 3,
          backoff: { type: "exponential", delay: 3000 },
        });
      },
      async close() {
        await Promise.all([queue.close(), worker.close()]);
      },
    };
  }
  // in-process fallback
  const { InProcessQueue } = await import("./queue.js");
  const inproc = new InProcessQueue();
  for (const [type, handler] of Object.entries(handlers)) {
    inproc.on(type as TaskType, handler as (job: TaskJob) => Promise<void>);
  }
  return {
    kind: "inprocess",
    async submit(job) {
      await inproc.submit(job);
    },
    async close() {},
  };
}
