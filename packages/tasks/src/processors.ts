import type { FileStore } from "./storage.js";
import { getImageProvider, getLlmProvider } from "@pixforge/providers";

/**
 * M3 processors: (TaskJob) → {urls[], note?} stored in TaskStore.
 * BR-PROC: processors resolve public URLs (via FileStore); huge data URLs are never returned.
 */

export interface ProcCtx { store: FileStore }

/** generate-poster: image provider → file.png → URL (scene JSON is assembled by the agent/web layer). */
export function makeGeneratePoster(ctx: ProcCtx) {
  return async (params: Record<string, unknown>) => {
    const prompt = String(params.prompt ?? "");
    const size = String(params.size ?? "1360x2048").split("x").map(Number);
    const img = await getImageProvider().generate({ prompt, width: size[0], height: size[1] });
    const bytes = await fetchBytes(img.url);
    const saved = await ctx.store.put(bytes, "png");
    return { urls: [saved.url] };
  };
}

/** image-edit (inpaint): reference[0] is the source image + prompt; used when the provider supports references. */
export function makeImageEdit(ctx: ProcCtx) {
  return async (params: Record<string, unknown>) => {
    const refs = (params.reference as string[]) ?? [];
    const prompt = String(params.prompt ?? "");
    if (!refs.length || !prompt) throw new Error("image-edit requires reference[] + prompt");
    const img = await getImageProvider().generate({ prompt, width: 1024, height: 1024, referenceImages: refs });
    const bytes = await fetchBytes(img.url);
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
      const p = spawn("rembg", ["i"], {});
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

/** Generic image tasks (logo/xhs/illustrations/storyboard) — type-specific buildPrompt → provider → file. */
export function makeGenericImageTask(ctx: ProcCtx, opts: { buildPrompt: (p: Record<string, unknown>) => string }) {
  return async (params: Record<string, unknown>) => {
    const prompt = opts.buildPrompt(params);
    const img = await getImageProvider().generate({ prompt, width: 1024, height: 1365 });
    const bytes = await fetchBytes(img.url);
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
  return async (params: Record<string, unknown>) => {
    const n = Math.min(Number(params.n ?? 5), opts.maxSlidesPerRun ?? 8);
    const lang = String(params.language ?? "en");
    const plan = await getLlmProvider().chat([
      { role: "system", content: `You are a presentation planner. Reply JSON {title, slides:[{title, bullets[], imagePrompt}]}. Language: ${lang}. Produce exactly ${n} slides.` },
      { role: "user", content: String(params.prompt ?? "topic") },
    ], { json: true });
    const outline = parseOutline(plan, n);

    const pptxMod = await import("pptxgenjs");
    const PptxGenJS = (pptxMod as unknown as { default: new () => PptxT }).default;
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "PXF", width: 13.333, height: 7.5 });
    pptx.layout = "PXF";

    for (const s of outline.slides) {
      const slide = pptx.addSlide();
      const img = await getImageProvider().generate({ prompt: s.imagePrompt, width: 1024, height: 1365 });
      const bytes = await fetchBytes(img.url);
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

async function fetchBytes(url: string): Promise<Uint8Array> {
  if (url.startsWith("data:")) {
    const b64 = url.split(",")[1] ?? "";
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
