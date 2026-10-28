import {
  TaskStore, LocalFileStore, ApiKeyStore, createQueueBackend,
  makeGeneratePoster, makeImageEdit, makeRemoveBackground, makeGeneratePresentation, makeGenericImageTask,
  BrandKitStore, TemplateStore, extractBrandKit, ProjectStore, ChatSessionStore,
} from "@pixforge/tasks";
import { getLlmProvider } from "@pixforge/providers";
import path from "node:path";

/** Runtime singleton — reused across routes (globalThis guards against hot-reload duplicates). */
interface Rt {
  taskStore: TaskStore;
  files: LocalFileStore;
  keys: ApiKeyStore;
  brandKits: BrandKitStore;
  templates: TemplateStore;
  projects: ProjectStore;
  chatSessions: ChatSessionStore;
}

const g = globalThis as unknown as { __pfRt?: Rt };

export async function getRuntime(): Promise<Rt> {
  if (g.__pfRt) return g.__pfRt;
  const dataDir = process.env.PIXFORGE_DATA_DIR ?? path.join(process.cwd(), ".data");
  const files = new LocalFileStore(path.join(dataDir, "files"));
  const keys = new ApiKeyStore(path.join(dataDir, "api-keys.json"));
  await keys.load();
  const brandKits = new BrandKitStore(path.join(dataDir, "brandkits.json"));
  await brandKits.load();
  const templates = new TemplateStore(path.join(dataDir, "templates.json"));
  await templates.load();
  const projects = new ProjectStore(path.join(dataDir, "projects.json"));
  await projects.load();
  const chatSessions = new ChatSessionStore(path.join(dataDir, "chat-sessions.json"));
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

  g.__pfRt = { taskStore, files, keys, brandKits, templates, projects, chatSessions };
  return g.__pfRt;
}

/** BR-KEY guard: with PIXFORGE_REQUIRE_KEY=1 a valid key is required (authorization header). */
export async function requireApiKey(req: Request): Promise<Response | null> {
  if (process.env.PIXFORGE_REQUIRE_KEY !== "1") return null;
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
