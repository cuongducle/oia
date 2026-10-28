import path from "node:path";
import {
  createQueueBackend, LocalFileStore,
  makeGeneratePoster, makeImageEdit, makeRemoveBackground, makeGeneratePresentation, makeGenericImageTask,
} from "@pixforge/tasks";

/**
 * PixForge worker — shares processors with the web app (packages/tasks) and points the FileStore
 * at the same PIXFORGE_DATA_DIR → a separate worker deployment writes results to the right place.
 * - Có REDIS_URL: BullMQ (queue pixforge-tasks, 3 attempts backoff exp)
 * - No: in-process (demo/CI)
 */
const dataDir = process.env.PIXFORGE_DATA_DIR ?? path.join(process.cwd(), ".data");
const files = new LocalFileStore(path.join(dataDir, "files"));

// adapter: queue handlers receive TaskJob, shared processors take params — one thin wrapper
const wrap = (fn: (p: Record<string, unknown>) => Promise<{ urls: string[] }>) =>
  async (job: { params: Record<string, unknown> }) => {
    const r = await fn(job.params);
    console.log(`[worker] ${JSON.stringify(job).slice(0, 60)}… → ${r.urls[0]}`);
  };

const backend = await createQueueBackend({
  "generate-poster": wrap(makeGeneratePoster({ store: files })),
  "image-edit": wrap(makeImageEdit({ store: files })),
  "remove-background": wrap(makeRemoveBackground({ store: files })),
  "generate-presentation": wrap(makeGeneratePresentation({ store: files })),
  "generate-logo": wrap(makeGenericImageTask({ store: files }, { buildPrompt: (p) => `logo design, ${p.prompt ?? ""}` })),
  "generate-xhs-images": wrap(makeGenericImageTask({ store: files }, { buildPrompt: (p) => `xiaohongshu page: ${p.prompt ?? ""}` })),
  "generate-illustrations": wrap(makeGenericImageTask({ store: files }, { buildPrompt: (p) => `16:9 illustration: ${p.prompt ?? ""}` })),
  "generate-storyboard": wrap(makeGenericImageTask({ store: files }, { buildPrompt: (p) => `storyboard frame: ${p.prompt ?? ""}` })),
});
console.log(`[pixforge-worker] ready — backend: ${backend.kind} — dataDir: ${dataDir}`);

if (backend.kind === "bullmq") setInterval(() => {}, 1 << 30);

process.on("SIGINT", async () => {
  console.log("[pixforge-worker] shutting down…");
  await backend.close();
  process.exit(0);
});
