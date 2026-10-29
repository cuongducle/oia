import { createHash } from "node:crypto";
import path from "node:path";
import {
  createQueueBackend, LocalFileStore,
  makeGeneratePoster, makeImageEdit, makeRemoveBackground, makeGeneratePresentation, makeGenericImageTask,
  registerCancelable, releaseCancelable, createCancelSubscriber,
} from "@oia/tasks";
import { assertNoMixedMockConfig } from "@oia/providers";

/**
 * Oia worker — shares processors with the web app (packages/tasks) and points the FileStore
 * at the same OIA_DATA_DIR → a separate worker deployment writes results to the right place.
 * - Có REDIS_URL: BullMQ (queue oia-tasks; per-class retry policy — metered jobs attempts=1)
 *   + the TP.5 cancel subscriber (Redis pub/sub `oia:cancel:<id>` aborts in-flight handlers)
 * - No: in-process (demo/CI)
 *
 * Stage 0 (Slice 4): logs carry the jobId; prompt text is redacted by default
 * (sha256 + length only) — transcripts and job logs never leak user copy wholesale.
 */
assertNoMixedMockConfig(); // TP.4: mock/real mix never boots — identical guard to the web app
const dataDir = process.env.OIA_DATA_DIR ?? path.join(process.cwd(), ".data");
const files = new LocalFileStore(path.join(dataDir, "files"));

/** Redact user-authored text (prompts) in logs: keep shape, drop content. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 3 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/prompt|copy|text|content/i.test(k) && typeof v === "string" && v.length > 0) {
      out[k] = { sha256: createHash("sha256").update(v).digest("hex").slice(0, 12), length: v.length };
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

// adapter: queue handlers receive TaskJob, shared processors take (params, ctx) — one thin wrapper.
// TP.5: each in-flight handler gets an AbortController registered under its BullMQ id (= taskId),
// so the web's cross-process cancel reaches it through the Redis subscriber.
const wrap =
  (type: string, fn: (p: Record<string, unknown>, ctx: { jobId: string; signal: AbortSignal }) => Promise<{ urls: string[] }>) =>
  async (job: { taskId: string; params: Record<string, unknown> }) => {
    const ac = new AbortController();
    registerCancelable(job.taskId, ac);
    const t0 = Date.now();
    try {
      const r = await fn(job.params, { jobId: job.taskId, signal: ac.signal });
      console.log(`[worker] jobId=${job.taskId} type=${type} ok ${Date.now() - t0}ms params=${JSON.stringify(redact(job.params))} → ${r.urls[0]}`);
    } catch (err) {
      console.error(`[worker] jobId=${job.taskId} type=${type} FAILED ${Date.now() - t0}ms params=${JSON.stringify(redact(job.params))}`, err instanceof Error ? err.message : err);
      throw err;
    } finally {
      releaseCancelable(job.taskId);
    }
  };

const backend = await createQueueBackend({
  "generate-poster": wrap("generate-poster", makeGeneratePoster({ store: files })),
  "image-edit": wrap("image-edit", makeImageEdit({ store: files })),
  "remove-background": wrap("remove-background", makeRemoveBackground({ store: files })),
  "generate-presentation": wrap("generate-presentation", makeGeneratePresentation({ store: files })),
  "generate-logo": wrap("generate-logo", makeGenericImageTask({ store: files }, { buildPrompt: (p) => `logo design, ${p.prompt ?? ""}` })),
  "generate-xhs-images": wrap("generate-xhs-images", makeGenericImageTask({ store: files }, { buildPrompt: (p) => `xiaohongshu page: ${p.prompt ?? ""}` })),
  "generate-illustrations": wrap("generate-illustrations", makeGenericImageTask({ store: files }, { buildPrompt: (p) => `16:9 illustration: ${p.prompt ?? ""}` })),
  "generate-storyboard": wrap("generate-storyboard", makeGenericImageTask({ store: files }, { buildPrompt: (p) => `storyboard frame: ${p.prompt ?? ""}` })),
});

// TP.5 (Slice 4): consume cross-process cancels — abort matching in-flight handlers here
let cancelSub: Awaited<ReturnType<typeof createCancelSubscriber>> | null = null;
if (backend.kind === "bullmq" && process.env.REDIS_URL) {
  cancelSub = await createCancelSubscriber({ redisUrl: process.env.REDIS_URL }).catch((err) => {
    console.error("[oia-worker] cancel subscriber unavailable — cross-process cancels will not reach this worker", err);
    return null;
  });
}

console.log(`[oia-worker] ready — backend: ${backend.kind} — cancelSubscriber: ${cancelSub ? "on" : "off"} — dataDir: ${dataDir}`);

if (backend.kind === "bullmq") setInterval(() => {}, 1 << 30);

process.on("SIGINT", async () => {
  console.log("[oia-worker] shutting down…");
  await Promise.allSettled([backend.close(), cancelSub?.close()]);
  process.exit(0);
});
