import path from "node:path";
import {
  TaskStore, LocalFileStore, ApiKeyStore,
  BrandKitStore, TemplateStore, ProjectStore, ChatSessionStore,
  makeGeneratePoster, makeImageEdit, makeRemoveBackground, makeGeneratePresentation, makeGenericImageTask,
} from "@oia/tasks";
import { getLlmProvider, getImageProvider, assertNoMixedMockConfig, ProviderError, type LlmProvider, type ImageProvider } from "@oia/providers";
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
}

/** Thrown when the provider configuration pair is invalid (mixed mock/real). Named class
 *  so shells can map it to a localized message instead of string-matching. */
export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

/** Hard rule 6 — a budget knob that fails to parse must NEVER silently mean "unlimited". */
function parseDailyLimit(env: NodeJS.ProcessEnv, name: string): number | undefined {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return undefined; // unset = unlimited (today's behavior)
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new ProviderConfigError(`${name} must be a non-negative integer (got "${raw}") — refusing to boot rather than guessing an unlimited budget`);
  }
  return n;
}

export async function createServiceContext(opts: { dataDir?: string; env?: NodeJS.ProcessEnv } = {}): Promise<ServiceContext> {
  const env = opts.env ?? process.env;
  // TP.2/TP.4: a mock provider paired with a real provider never boots silently
  try {
    assertNoMixedMockConfig(env);
  } catch (err) {
    throw new ProviderConfigError(err instanceof Error ? err.message : "invalid provider configuration");
  }

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

  const meter = new QuotaMeter({
    imageDailyLimit: parseDailyLimit(env, "OIA_DAILY_IMAGE_LIMIT"),
    llmDailyLimit: parseDailyLimit(env, "OIA_DAILY_LLM_LIMIT"),
  });
  const chat = {
    llm: meterLlm(getLlmProvider(env), meter),
    image: meterImage(getImageProvider(env), meter),
    meter,
  };

  // TP.5: durable task records — cancel is in-process only (worker deployment removed, reorg step 3)
  const taskStore = new TaskStore({
    logFile: path.join(dataDir, "task-log.jsonl"),
  });

  // task processors registered ONCE here — both shells share them (banner lane: poster/
  // image-edit/reference tasks/presentation + generic image tasks; image-translate is a
  // clear failure, never a hang). Providers come from `chat` (env-configured + metered):
  // tasks must burn the SAME quota ledger as chat, never a bare registry lookup.
  const procCtx = { store: files, image: chat.image, llm: chat.llm };
  taskStore.register("generate-poster", makeGeneratePoster(procCtx));
  taskStore.register("image-edit", makeImageEdit(procCtx));
  taskStore.register("remove-background", makeRemoveBackground(procCtx));
  taskStore.register("generate-presentation", makeGeneratePresentation(procCtx));
  taskStore.register("generate-logo", makeGenericImageTask(procCtx, { buildPrompt: (p) => `logo design, ${p.prompt ?? ""}, vector style, plain background` }));
  taskStore.register("generate-xhs-images", makeGenericImageTask(procCtx, { buildPrompt: (p) => `xiaohongshu vertical carousel page about: ${p.prompt ?? ((p.urls as string[]) ?? []).join(", ")}, style ${p.style ?? "clean"}` }));
  taskStore.register("generate-illustrations", makeGenericImageTask(procCtx, { buildPrompt: (p) => `16:9 editorial illustration about: ${p.prompt ?? ""}, hand-drawn` }));
  taskStore.register("generate-storyboard", makeGenericImageTask(procCtx, { buildPrompt: (p) => `film storyboard frame: ${p.prompt ?? ""}, sketch style` }));
  taskStore.register("image-translate", async () => {
    throw new ProviderError("capability_unsupported", "image-translate needs the vision (OCR) module — scheduled later", { provider: "oia" });
  });

  const ctx: ServiceContext = {
    files, keys, brandKits, templates, projects, chatSessions, taskStore, chat,
  };
  return ctx;
}
