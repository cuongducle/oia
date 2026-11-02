import type { FileStore } from "./storage.js";
import { ProviderError } from "@oia/providers";
import type { ImageProvider, LlmProvider } from "@oia/providers";
import type { TaskContext } from "./store.js";
import {
  DECONSTRUCT_READ_PROMPT,
  DECONSTRUCT_INPAINT_PROMPT,
  DECONSTRUCT_JSON_SCHEMA,
  deconstructReadSchema,
  type DeconstructRead,
} from "@oia/schema";

/**
 * M3 processors: (TaskJob) → {urls[], note?} stored in TaskStore.
 * BR-PROC: processors resolve public URLs (via FileStore); huge data URLs are never returned.
 *
 * Providers are INJECTED via ProcCtx — the env-configured, quota-metered instances
 * built by createServiceContext. Processors used to call getImageProvider() bare,
 * which read the utility process's process.env (never set with IMAGE_PROVIDER —
 * main sends it via the init RPC): every agent task silently ran MockImageProvider
 * and skipped the QuotaMeter, even in codex mode.
 */

export interface ProcCtx {
  store: FileStore;
  image: ImageProvider;
  llm: LlmProvider;
}

/** generate-poster: image provider → file.png → URL (scene JSON is assembled by the agent/web layer). */
export function makeGeneratePoster(ctx: ProcCtx) {
  return async (params: Record<string, unknown>, tctx: TaskContext) => {
    const prompt = String(params.prompt ?? "");
    const size = String(params.size ?? "1360x2048").split("x").map(Number);
    const img = await ctx.image.generate({ prompt, width: size[0], height: size[1], signal: tctx.signal });
    const bytes = await fetchBytes(img.url, ctx.store);
    const saved = await ctx.store.put(bytes, "png");
    return { urls: [saved.url] };
  };
}

/** image-edit (inpaint): reference[0] is the source image + prompt; used when the provider supports references. */
export function makeImageEdit(ctx: ProcCtx) {
  return async (params: Record<string, unknown>, tctx: TaskContext) => {
    const refs = (params.reference as string[]) ?? [];
    const prompt = String(params.prompt ?? "");
    if (!refs.length || !prompt) throw new Error("image-edit requires reference[] + prompt");
    // TP.11 (no-silent-fallback): reference-capable tasks check provider capabilities before accepting refs
    if (!ctx.image.capabilities.referenceImages) {
      throw new ProviderError("capability_unsupported", `provider ${ctx.image.name} does not accept reference images`, { provider: ctx.image.name });
    }
    const img = await ctx.image.generate({ prompt, width: 1024, height: 1024, referenceImages: refs, signal: tctx.signal });
    const bytes = await fetchBytes(img.url, ctx.store);
    const saved = await ctx.store.put(bytes, "png");
    return { urls: [saved.url] };
  };
}

/** remove-background: uses the `rembg` CLI when installed (self-hosted, offline); otherwise a clear error. */
export function makeRemoveBackground(ctx: ProcCtx) {
  return async (params: Record<string, unknown>) => {
    const fileUrl = String(params.fileUrl ?? "");
    if (!fileUrl) throw new Error("remove-background requires fileUrl");
    const { spawn } = await import("node:child_process");
    const src = await ctx.store.read(fileUrl.replace(/^\/api\/files\//, "")).catch(() => null);
    if (!src) throw new Error("fileUrl is invalid or has not been uploaded");
    const out = await new Promise<Uint8Array>((resolve, reject) => {
      const p = spawn("rembg", ["i"], { windowsHide: true });
      const chunks: Buffer[] = [];
      p.stdout.on("data", (c) => chunks.push(c));
      p.stderr.on("data", (c) => process.stderr.write(c));
    p.on("error", (e) => reject(new Error("rembg is not installed — run: pip install rembg (BR-RBG)")));
      p.on("close", (code) => (code === 0 ? resolve(new Uint8Array(Buffer.concat(chunks))) : reject(new Error(`rembg exit ${code}`))));
      p.stdin.end(Buffer.from(src));
    });
    const saved = await ctx.store.put(out, "png"); // BR-11: always .png to keep transparency
    return { urls: [saved.url] };
  };
}

/** PNG IHDR size probe — 4 lines, no dependency; non-PNG returns null and the
 * caller falls back to a square (boxes are fractions, so positions stay honest). */
function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null; // "IHDR"
  return { width: new DataView(bytes.buffer, bytes.byteOffset).getUint32(16), height: new DataView(bytes.buffer, bytes.byteOffset).getUint32(20) };
}

/** B1 deconstruct (deconstruct-import.md): vision read (1 LLM turn) → inpaint
 * (1 image). The order is a G2 invariant: a malformed read fails BEFORE any
 * image is generated — a doomed job never burns the seller's quota. */
export function makeDeconstruct(ctx: ProcCtx) {
  return async (params: Record<string, unknown>, tctx: TaskContext) => {
    const fileUrl = String(params.fileUrl ?? "");
    if (!fileUrl) throw new Error("deconstruct requires fileUrl");
    const src = await ctx.store.read(fileUrl.replace(/^\/api\/files\//, "")).catch(() => null);
    if (!src) throw new Error("fileUrl is invalid or has not been uploaded");

    if (typeof ctx.llm.readImage !== "function" || !ctx.llm.capabilities.referenceImages) {
      throw new ProviderError("capability_unsupported", `provider ${ctx.llm.name} cannot read images`, { provider: ctx.llm.name });
    }
    const raw = await ctx.llm.readImage(DECONSTRUCT_READ_PROMPT, src, DECONSTRUCT_JSON_SCHEMA, {
      signal: tctx.signal,
      ...(tctx.jobId ? { jobId: `read-${tctx.jobId}` } : {}),
    });
    let read: DeconstructRead;
    try {
      read = deconstructReadSchema.parse(JSON.parse(raw));
    } catch {
      throw new ProviderError("plan_parse_failed", "vision read returned malformed JSON", { provider: ctx.llm.name, detail: String(raw).slice(0, 200) });
    }

    if (!ctx.image.capabilities.referenceImages) {
      throw new ProviderError("capability_unsupported", `provider ${ctx.image.name} does not accept reference images`, { provider: ctx.image.name });
    }
    const size = pngSize(src) ?? { width: 1024, height: 1024 };
    const img = await ctx.image.generate({
      prompt: DECONSTRUCT_INPAINT_PROMPT,
      width: size.width,
      height: size.height,
      referenceImages: [fileUrl],
      signal: tctx.signal,
    });
    const bytes = await fetchBytes(img.url, ctx.store);
    const saved = await ctx.store.put(bytes, "png");
    return { urls: [saved.url], texts: read.texts };
  };
}

/** Generic image tasks (logo/xhs/illustrations/storyboard) — type-specific buildPrompt → provider → file. */
export function makeGenericImageTask(ctx: ProcCtx, opts: { buildPrompt: (p: Record<string, unknown>) => string }) {
  return async (params: Record<string, unknown>, tctx: TaskContext) => {
    const prompt = opts.buildPrompt(params);
    const img = await ctx.image.generate({ prompt, width: 1024, height: 1365, signal: tctx.signal });
    const bytes = await fetchBytes(img.url, ctx.store);
    const saved = await ctx.store.put(bytes, "png");
    return { urls: [saved.url] };
  };
}

/** generate-presentation: LLM outline → slide images → PPTX (pptxgenjs on node). */
export interface SlideOutline { title: string; slides: { title: string; bullets: string[]; imagePrompt: string }[] }

export function parseOutline(raw: string, maxSlides = 30): SlideOutline {
  const data = JSON.parse(raw) as Partial<SlideOutline> & { imagePrompt?: string; copy?: string };
  if (Array.isArray(data.slides) && data.slides.length) {
    return { title: data.title ?? "Presentation", slides: data.slides.slice(0, maxSlides) };
  }
    // demo/mock plan (no slides[]) → one slide from imagePrompt/copy so the pipeline still runs
  return {
    title: data.title ?? "Presentation",
    slides: [{ title: data.title ?? "Slide 1", bullets: data.copy ? [data.copy] : [], imagePrompt: data.imagePrompt ?? "clean minimal slide" }],
  };
}

export function makeGeneratePresentation(ctx: ProcCtx, opts: { maxSlidesPerRun?: number } = {}) {
  return async (params: Record<string, unknown>, tctx: TaskContext) => {
    const n = Math.min(Number(params.n ?? 5), opts.maxSlidesPerRun ?? 8);
    const lang = String(params.language ?? "en");
    const plan = await ctx.llm.chat([
      { role: "system", content: `You are a presentation planner. Reply JSON {title, slides:[{title, bullets[], imagePrompt}]}. Language: ${lang}. Produce exactly ${n} slides.` },
      { role: "user", content: String(params.prompt ?? "topic") },
    ], { json: true, signal: tctx.signal });
    const outline = parseOutline(plan, n);

    const pptxMod = await import("pptxgenjs");
    const PptxGenJS = (pptxMod as unknown as { default: new () => PptxT }).default;
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "PXF", width: 13.333, height: 7.5 });
    pptx.layout = "PXF";

    for (const s of outline.slides) {
      const slide = pptx.addSlide();
      const img = await ctx.image.generate({ prompt: s.imagePrompt, width: 1024, height: 1365, signal: tctx.signal });
      const bytes = await fetchBytes(img.url, ctx.store);
      await ctx.store.put(bytes, "png");
      slide.addImage({ data: `image/png;base64,${Buffer.from(bytes).toString("base64")}`, x: 0.4, y: 0.4, w: 3.4, h: 4.5 });
      slide.addText(s.title, { x: 4.2, y: 0.5, fontSize: 28, bold: true });
      slide.addText(s.bullets.map((b) => ({ text: b, options: { bullet: true } })), { x: 4.2, y: 1.6, fontSize: 16 });
    }
    const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    const saved = await ctx.store.put(new Uint8Array(buf), "pptx");
    return { urls: [saved.url], note: `slides: ${outline.slides.length}` };
  };
}

interface PptxT {
  defineLayout(o: { name: string; width: number; height: number }): void;
  layout: string;
  addSlide(): { addImage(o: unknown): unknown; addText(t: unknown, o?: unknown): unknown };
  write(o: { outputType: string }): Promise<unknown>;
}

/** data: | http(s) | same-origin asset ref (/api/files/<key>) — resolved through the store when present. */
async function fetchBytes(url: string, store?: FileStore): Promise<Uint8Array> {
  if (url.startsWith("data:")) {
    const b64 = url.split(",")[1] ?? "";
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  // TP.7: scenes reference assets as /api/files/<key> — same-origin browser URLs that
  // Node fetch cannot resolve; read the bytes from the file store instead
  if (store && url.startsWith("/api/files/")) {
    return store.read(url.replace(/^\/api\/files\//, ""));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
