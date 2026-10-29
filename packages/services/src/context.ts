import path from "node:path";
import {
  TaskStore, LocalFileStore, ApiKeyStore,
  BrandKitStore, TemplateStore, ProjectStore, ChatSessionStore,
  createCancelPublisher,
  makeGeneratePoster, makeImageEdit, makeRemoveBackground, makeGeneratePresentation, makeGenericImageTask,
  type CancelBridge,
} from "@oia/tasks";
import { getLlmProvider, getImageProvider, assertNoMixedMockConfig, type LlmProvider, type ImageProvider } from "@oia/providers";
import { QuotaMeter, meterLlm, meterImage } from "./quota.js";

/**
 * TP-D2 (D1) — the ONE context both shells construct. Everything the chat loop, the
 * editor, and the task API need is built here (stores + metered providers + task store
 * + optional Redis cancel publisher). The web `getRuntime()` is a thin singleton over
 * this; the Electron main process will call it with `userData` as the data dir.
 */
export interface ServiceContext {
  files: LocalFileStore;
  keys: ApiKeyStore;
  brandKits: BrandKitStore;
  templates: TemplateStore;
  projects: ProjectStore;
  chatSessions: ChatSessionStore;
  taskStore: TaskStore;
  chat: { llm: LlmProvider; image: ImageProvider; meter: QuotaMeter };
  /** Cross-process cancel publisher (null when no Redis — the desktop posture). */
  cancelPublisher: CancelBridge | null;
}

export async function createServiceContext(opts: { dataDir?: string; env?: NodeJS.ProcessEnv } = {}): Promise<ServiceContext> {
  const env = opts.env ?? process.env;
  // TP.2/TP.4: a mock provider paired with a real provider never boots silently
  assertNoMixedMockConfig(env);

  const dataDir = opts.dataDir ?? path.join(process.cwd(), ".data");
  const files = new LocalFileStore(path.join(dataDir, "files"));
  await files.hydrate(); // md5 dedupe survives restarts — migrate-on-save reuses existing assets

  const keys = new ApiKeyStore(path.join(dataDir, "api-keys.json"));
  await keys.load();
  const brandKits = new BrandKitStore(path.join(dataDir, "brandkits.json"));
  await brandKits.load();
  const templates = new TemplateStore(path.join(dataDir, "templates.json"));
  await templates.load();
  const projects = new ProjectStore(path.join(dataDir, "projects.json"), files);
  await projects.load();
  const chatSessions = new ChatSessionStore(path.join(dataDir, "chat-sessions.json"), files);
  await chatSessions.load();

  const meter = new QuotaMeter();
  const chat = {
    llm: meterLlm(getLlmProvider(env), meter),
    image: meterImage(getImageProvider(env), meter),
    meter,
  };

  // TP.5: durable task records + cross-process cancel when a worker runs behind Redis
  const taskStore = new TaskStore({
    logFile: path.join(dataDir, "task-log.jsonl"),
    onCancel: async (jobId, taskId) => {
      await ctx?.cancelPublisher?.publish(jobId, taskId);
    },
  });
  let cancelPublisher: CancelBridge | null = null;
  if (env.REDIS_URL) {
    cancelPublisher = await createCancelPublisher({ redisUrl: env.REDIS_URL }).catch((err) => {
      console.error("[services] cancel publisher unavailable (worker cancels will not cross processes)", err);
      return null;
    });
  }

  // task processors registered ONCE here — both shells share them (banner lane: poster/
  // image-edit/reference tasks/presentation + generic image tasks; image-translate is a
  // clear failure, never a hang)
  taskStore.register("generate-poster", makeGeneratePoster({ store: files }));
  taskStore.register("image-edit", makeImageEdit({ store: files }));
  taskStore.register("remove-background", makeRemoveBackground({ store: files }));
  taskStore.register("generate-presentation", makeGeneratePresentation({ store: files }));
  taskStore.register("generate-logo", makeGenericImageTask({ store: files }, { buildPrompt: (p) => `logo design, ${p.prompt ?? ""}, vector style, plain background` }));
  taskStore.register("generate-xhs-images", makeGenericImageTask({ store: files }, { buildPrompt: (p) => `xiaohongshu vertical carousel page about: ${p.prompt ?? ((p.urls as string[]) ?? []).join(", ")}, style ${p.style ?? "clean"}` }));
  taskStore.register("generate-illustrations", makeGenericImageTask({ store: files }, { buildPrompt: (p) => `16:9 editorial illustration about: ${p.prompt ?? ""}, hand-drawn` }));
  taskStore.register("generate-storyboard", makeGenericImageTask({ store: files }, { buildPrompt: (p) => `film storyboard frame: ${p.prompt ?? ""}, sketch style` }));
  taskStore.register("image-translate", async () => {
    throw new Error("image-translate needs the vision (OCR) module — scheduled later (fail clearly, never hang)");
  });

  const ctx: ServiceContext = {
    files, keys, brandKits, templates, projects, chatSessions, taskStore, chat, cancelPublisher,
  };
  return ctx;
}
