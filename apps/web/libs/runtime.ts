import {
  TaskStore, LocalFileStore, ApiKeyStore, createQueueBackend,
  makeGeneratePoster, makeImageEdit, makeRemoveBackground, makeGeneratePresentation, makeGenericImageTask,
  BrandKitStore, TemplateStore, extractBrandKit, ProjectStore, ChatSessionStore,
} from "@oia/tasks";
import {
  getLlmProvider, getImageProvider, assertNoMixedMockConfig,
  type LlmProvider, type ImageProvider, type ImageGenInput, type ImageGenResult,
  type LlmMessage, type LlmChatOpts, type ProviderDiagnostic, type ProviderCapabilities,
  ProviderError,
} from "@oia/providers";
import type { ErrorClass } from "@oia/schema";
import path from "node:path";

/**
 * TP.6 quota accounting — Oia-local counters (Q3: never spend an agent turn asking Codex).
 * Per-day rollover + per-process session totals; limit-hit parses bump `limitHits`.
 */
export interface QuotaCounters {
  day: string; // YYYY-MM-DD
  planner: number;
  image: number;
  limitHits: number;
}

export interface ProviderStatus {
  image: { name: string; capabilities: ProviderCapabilities; diagnostic: ProviderDiagnostic };
  llm: { name: string; capabilities: ProviderCapabilities; diagnostic: ProviderDiagnostic };
  quota: QuotaCounters & { session: { planner: number; image: number } };
}

class QuotaMeter {
  private today: QuotaCounters = freshDay();
  private session = { planner: 0, image: 0 };
  recordTurn(kind: "planner" | "image") {
    this.rollDay();
    this.today[kind]++;
    this.session[kind]++;
  }
  recordLimitHit() {
    this.rollDay();
    this.today.limitHits++;
  }
  snapshot(): QuotaCounters & { session: { planner: number; image: number } } {
    this.rollDay();
    return { ...this.today, session: { ...this.session } };
  }
  private rollDay() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.today.day !== today) this.today = freshDay();
  }
}
function freshDay(): QuotaCounters {
  return { day: new Date().toISOString().slice(0, 10), planner: 0, image: 0, limitHits: 0 };
}

/** Wrap a provider so every metered turn is counted and limit errors are parsed (TP.6). */
function meterImage(inner: ImageProvider, meter: QuotaMeter): ImageProvider {
  return {
    name: inner.name,
    capabilities: inner.capabilities,
    isAvailable: () => inner.isAvailable(),
    async generate(input: ImageGenInput): Promise<ImageGenResult> {
      meter.recordTurn("image");
      try {
        return await inner.generate(input);
      } catch (err) {
        if (err instanceof ProviderError && err.errorClass === "quota_exceeded") meter.recordLimitHit();
        throw err;
      }
    },
  };
}
function meterLlm(inner: LlmProvider, meter: QuotaMeter): LlmProvider {
  return {
    name: inner.name,
    capabilities: inner.capabilities,
    isAvailable: () => inner.isAvailable(),
    async chat(messages: LlmMessage[], opts?: LlmChatOpts): Promise<string> {
      meter.recordTurn("planner");
      try {
        return await inner.chat(messages, opts);
      } catch (err) {
        if (err instanceof ProviderError && err.errorClass === "quota_exceeded") meter.recordLimitHit();
        throw err;
      }
    },
  };
}

/** Runtime singleton — reused across routes (globalThis guards against hot-reload duplicates). */
interface Rt {
  taskStore: TaskStore;
  files: LocalFileStore;
  keys: ApiKeyStore;
  brandKits: BrandKitStore;
  templates: TemplateStore;
  projects: ProjectStore;
  chatSessions: ChatSessionStore;
  /** Stage 0: shared chat providers (registry-built, mock-guarded, quota-metered). */
  chat: { llm: LlmProvider; image: ImageProvider; meter: QuotaMeter };
}

const g = globalThis as unknown as { __oiaRt?: Rt };

export async function getRuntime(): Promise<Rt> {
  if (g.__oiaRt) return g.__oiaRt;
  // TP.2/TP.4 (Slice 1): a mock provider paired with a real provider never boots silently
  assertNoMixedMockConfig();
  const dataDir = process.env.OIA_DATA_DIR ?? path.join(process.cwd(), ".data");
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

  const taskStore = new TaskStore();
  taskStore.register("generate-poster", makeGeneratePoster({ store: files }));
  taskStore.register("image-edit", makeImageEdit({ store: files }));
  taskStore.register("remove-background", makeRemoveBackground({ store: files }));
  taskStore.register("generate-presentation", makeGeneratePresentation({ store: files }));
// generic image tasks — the prompt is built per type (logo/xhs/illustrations/storyboard)
  taskStore.register("generate-logo", makeGenericImageTask({ store: files }, { buildPrompt: (p) => `logo design, ${p.prompt ?? ""}, vector style, plain background` }));
  taskStore.register("generate-xhs-images", makeGenericImageTask({ store: files }, { buildPrompt: (p) => `xiaohongshu vertical carousel page about: ${p.prompt ?? ((p.urls as string[]) ?? []).join(", ")}, style ${p.style ?? "clean"}` }));
  taskStore.register("generate-illustrations", makeGenericImageTask({ store: files }, { buildPrompt: (p) => `16:9 editorial illustration about: ${p.prompt ?? ""}, hand-drawn` }));
  taskStore.register("generate-storyboard", makeGenericImageTask({ store: files }, { buildPrompt: (p) => `film storyboard frame: ${p.prompt ?? ""}, sketch style` }));
  taskStore.register("image-translate", async () => {
    throw new Error("image-translate needs the vision (OCR) module — scheduled later (BR-PROC: fail clearly, never hang)");
  });

  const meter = new QuotaMeter();
  const chat = {
    llm: meterLlm(getLlmProvider(), meter),
    image: meterImage(getImageProvider(), meter),
    meter,
  };

  g.__oiaRt = { taskStore, files, keys, brandKits, templates, projects, chatSessions, chat };
  return g.__oiaRt;
}

/** TP.6 — health panel snapshot: provider matrix + diagnostics + quota counters. */
export async function providerStatus(): Promise<ProviderStatus> {
  const { chat } = await getRuntime();
  const [imageDiag, llmDiag] = await Promise.all([chat.image.isAvailable(), chat.llm.isAvailable()]);
  return {
    image: { name: chat.image.name, capabilities: chat.image.capabilities, diagnostic: imageDiag },
    llm: { name: chat.llm.name, capabilities: chat.llm.capabilities, diagnostic: llmDiag },
    quota: chat.meter.snapshot(),
  };
}

/** BR-KEY guard: with OIA_REQUIRE_KEY=1 a valid key is required (authorization header). */
export async function requireApiKey(req: Request): Promise<Response | null> {
  if (process.env.OIA_REQUIRE_KEY !== "1") return null;
  const { keys } = await getRuntime();
  const auth = (req.headers.get("authorization") ?? "").trim();
      if (!auth) return unauthorized("missing authorization header");
  const rec = keys.verify(auth);
      if (!rec) return unauthorized("API key is invalid or expired");
  return null;
}
function unauthorized(msg: string): Response {
  return Response.json({ code: 401, data: null, msg }, { status: 401 });
}
