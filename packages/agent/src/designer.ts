import { randomUUID } from "node:crypto";
import type { ChatEvent, SceneCanvas, FabricObject, PlanBlock, GenerationMode } from "@oia/schema";
import { parsePlannerPlan, normalizeBlocks } from "@oia/schema";
import type { ImageProvider, LlmProvider } from "@oia/providers";
import { ProviderError } from "@oia/providers";
import { placeBlocks, fitCoverWithZones } from "./copy-zones.js";

export interface DesignerAgentDeps {
  llm: LlmProvider;
  image: ImageProvider;
}
export interface DesignerAgentInput {
  prompt: string;
  language?: string; // "en" | "zh" | ... — detected from the prompt by default
  width?: number;
  height?: number;
  /** BR-BK5: brand kit applied to chat — guidance goes to the planner; brandId rides on every SSE event. */
  brandGuidance?: string;
  brandId?: number;
  /** BR-CTRL: composer controls — attach reference images ("Add to chat" inpainting). */
  referenceImages?: string[];
  /** Auto pages: page count (Auto lets the planner decide; a fixed N is 1..9). */
  pages?: number;
  /** Outline mode: emit the outline (title + bullets) BEFORE generating. */
  outlineMode?: boolean;
  /** Selected skill (e.g. "Presentation Maker") — structure hint for the planner. */
  skill?: string;
  /** TP.3 — generation mode. Poster (baked text, fidelity guard) stays the default for skills/templates; the Home banner flow sends "clean-plate". */
  mode?: GenerationMode;
  /** TP.5 — cooperative cancellation; checked between stages and threaded into providers. */
  signal?: AbortSignal;
  /** TP.4/TP.5 — correlation id; when provided (the SSE route pre-generates it so /api/chat/cancel can address the job), every event carries it. */
  jobId?: string;
}

const uuid32 = () => randomUUID().replace(/-/g, "");

/** Agent narrative — English chrome text regardless of prompt language. */
const NARRATIVE = {
  progress: (t: string) => `Creating ${t} — please hold on.`,
  done: (t: string) => `Finished creating ${t}. Here is the result:`,
};
export type NarrativeLang = "en" | "vi" | "zh";

/** Rough detection: Latin-diacritic prompts, CJK prompts, default English. Generation keeps the user’s language. */
export function detectLanguage(prompt: string): NarrativeLang {
  if (/[\u0101\u0103\u0110\u0111\u0128\u0129\u0168\u0169\u01a0\u01a1\u01af\u01b0\u1ea0-\u1ef9]/i.test(prompt)) return "vi";
  if (/[\u4e00-\u9fff]/.test(prompt)) return "zh";
  return "en";
}

/** Fold the project name to plain ASCII. */
export function foldAscii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Scene builder: artwork placed to cover (zone-anchored crop on ratio mismatch) + named textboxes from blocks. */
export function buildScene(opts: {
  artworkUrl: string;
  artworkW?: number;
  artworkH?: number;
  width: number;
  height: number;
  blocks: PlanBlock[];
}): SceneCanvas {
  const { width, height } = opts;
  const objects: FabricObject[] = [
    { type: "Rect", name: "clip", origin: "generated", left: 0, top: 0, width, height, fill: "white", selectable: false, hasControls: false, visible: true },
  ];

  // Zone-anchored cover placement (TP.8): the canvas keeps its nominal size; the
  // artwork layer covers it, cropping the overflow away from the copy zones.
  if (opts.artworkW && opts.artworkH) {
    const fit = fitCoverWithZones(opts.artworkW, opts.artworkH, width, height);
    objects.push({
      type: "Image", name: "artwork", origin: "generated",
      left: 0, top: 0, width: fit.cropW, height: fit.cropH,
      cropX: fit.cropX, cropY: fit.cropY,
      scaleX: fit.scale, scaleY: fit.scale,
      src: opts.artworkUrl, crossOrigin: "anonymous", selectable: true, visible: true,
    });
  } else {
    // provider did not report the actual size — stretch to the canvas (legacy behavior)
    objects.push({
      type: "Image", name: "artwork", origin: "generated",
      left: 0, top: 0, width, height, src: opts.artworkUrl, crossOrigin: "anonymous", selectable: true, visible: true,
    });
  }

  // TP.1: every block lands as a NAMED Textbox (price/date/… first-class for selection);
  // placement from styleHint + copy-zone defaults — the fixed 72% overlay is gone.
  for (const placed of placeBlocks(opts.blocks, width, height)) {
    objects.push({
      type: "Textbox",
      name: `block:${placed.block.role}`,
      origin: "generated",
      left: placed.left, top: placed.top, width: placed.width, height: placed.height,
      text: placed.block.text,
      // Vietnamese-native coverage: the app ships Be Vietnam Pro as a webfont
      fontFamily: "Be Vietnam Pro",
      fontSize: placed.fontSize, fontWeight: "bold", fill: "#ffffff", textAlign: "center",
      selectable: true, visible: true,
    });
  }
  return { version: "7.3.1", objects };
}

/**
 * Designer Agent orchestration (Stage 0, Slice 1):
 * 1. jobId UUID at entry, attached to every event (TP.4 correlation)
 * 2. planner node — strict plan parse; a planner failure ABORTS the job before image
 *    generation (G2: no text-free empty banners from a failed planner)
 * 3. image generator tool — mode-aware prompts (TP.3), references on page 0 (TP.9)
 * 4. scene builder — named textboxes + origin provenance (TP.10 enforceable)
 * 5. AbortSignal threading end to end (TP.5)
 */
export async function* runDesignerAgent(
  input: DesignerAgentInput,
  deps: DesignerAgentDeps,
): AsyncGenerator<ChatEvent> {
  const jobId = input.jobId ?? randomUUID();
  const msgId = Date.now();
  const brandId = input.brandId ?? 0;
  const width = input.width ?? 1360;
  const height = input.height ?? 2048;
  const lang = (input.language as NarrativeLang) ?? detectLanguage(input.prompt);
  const mode: GenerationMode = input.mode ?? "poster";
  const t = NARRATIVE;
  let taskMeta: ChatEvent["renderData"]["taskMeta"] = [];

  const ev = (content: string, extra?: Partial<ChatEvent>): ChatEvent => ({
    msgId,
    content,
    status: 0,
    error: "",
    renderData: { msgMeta: [], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null },
    brandId,
    jobId,
    ...extra,
  });

  const fail = (err: unknown): ChatEvent => {
    const pe = ProviderError.from(err, deps.image.name);
    return ev("", {
      error: pe.message,
      errorClass: pe.errorClass,
      provider: pe.provider ?? deps.image.name,
      attemptNumber: 1, // metered jobs run exactly once (G3)
      renderData: { msgMeta: [], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null },
    });
  };

  const pagesWanted = Math.max(1, Math.min(9, input.pages ?? 1));
  // ---- 1) Planner node ----
  const nodeId = uuid32();
  taskMeta = [{ id: nodeId, content: "Designer Agent", type: "node", status: "0" }];
  yield ev(`<Collapse>[[task::node::${nodeId}]]`);

  let plan: ReturnType<typeof parsePlannerPlan>;
  try {
    const planRaw = await deps.llm.chat(
      [
        {
          role: "system",
          content:
            `You are a poster/banner planner. Reply with a JSON object matching the provided plan schema: ` +
            `{title, imagePrompt, imagePrompts?, outline?, blocks[]}. ` +
            `blocks[]: free-form text blocks that become editable text layers — pick roles from the request ` +
            `("headline", "price", "discount", "date", "name", "slogan", "subtitle"…); a sale banner naturally yields price/date/name blocks; ` +
            `omit blocks when the text must stay baked into the artwork. ` +
            `Coherence rule: never emit a block whose text duplicates what the imagePrompt asks the model to render.` +
            (input.skill ? `\nSkill structure hint: ${input.skill}.` : "")
            + (pagesWanted > 1 ? `\nProduce exactly ${pagesWanted} imagePrompts[] (one per page, coherent series).` : "")
            + (input.outlineMode ? `\nAlso return outline[] — 3-6 short bullets planning the content (Outline Mode).` : "")
            + (input.brandGuidance ? `\nBrand rules the output MUST follow:\n${input.brandGuidance}` : "")
            + (mode === "clean-plate"
              ? `\nClean-plate mode: the imagePrompt must describe text-free artwork (no added typography; product packaging lettering is preserved) — ALL copy goes into blocks[].`
              : ""),
        },
        { role: "user", content: input.prompt },
      ],
      { json: true, signal: input.signal },
    );
    plan = parsePlannerPlan(planRaw);
    if (!plan) {
      throw new ProviderError("plan_parse_failed", "the planner returned a malformed plan", { provider: deps.llm.name });
    }
  } catch (err) {
    if (input.signal?.aborted) return; // TP.5: silent stop — the route emits the terminal cancelled event
    // G2/G7: planner failure aborts BEFORE image generation — explicit failure event, one attempt, no silent fallback
    yield fail(err);
    return;
  }

  const title = plan.title || input.prompt.slice(0, 60);
  const blocks = normalizeBlocks(plan);
  const imagePrompts =
    pagesWanted > 1 && plan.imagePrompts?.length
      ? plan.imagePrompts.slice(0, pagesWanted)
      : Array.from({ length: pagesWanted }, (_, i) =>
          i === 0 ? (plan.imagePrompt ?? input.prompt) : `${plan.imagePrompt ?? input.prompt} — variation ${i + 1}`);

  yield ev(
    input.referenceImages?.length
      ? `${t.progress(title.toLowerCase())} (adjusted for ${input.referenceImages.length} reference images)`
      : t.progress(title.toLowerCase()),
  );

  // BR-CTRL: outline mode — the outline is emitted BEFORE generation
  if (input.outlineMode && plan.outline?.length) {
    yield ev(`Outline:\n${plan.outline.map((b, i) => `${i + 1}. ${b}`).join("\n")}\n`);
  }

  // ---- 2) Image Generator tool + progressive canvases ----
  const toolId = uuid32();
  taskMeta = [...taskMeta, { id: toolId, content: "Image Generator", type: "tool", status: "0" }];
  yield ev(`[[task::tool::${toolId}]]`);

  const pages: { canvasId: string; canvasMeta: { id: string; type: "canvas"; thumbnail: string; canvas: SceneCanvas } }[] = [];
  for (let pi = 0; pi < imagePrompts.length; pi++) {
    if (input.signal?.aborted) return; // TP.5: stop between stages; no orphan generation
    try {
      const img = await deps.image.generate({
        prompt: imagePrompts[pi], width, height, mode,
        referenceImages: pi === 0 ? input.referenceImages : undefined,
        signal: input.signal,
      });
      const canvasId = uuid32();
      const scene = buildScene({
        artworkUrl: img.url,
        artworkW: img.width,
        artworkH: img.height,
        width, height,
        // blocks land on the first page only — per-page blocks wait for a real ask
        blocks: pi === 0 ? blocks : [],
      });
      const canvasMeta = { id: canvasId, type: "canvas" as const, thumbnail: img.url, canvas: scene };
      pages.push({ canvasId, canvasMeta });
      yield ev(`[[canvas::canvas::${canvasId}]] `, { renderData: { msgMeta: [canvasMeta], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null } });
    } catch (err) {
      if (input.signal?.aborted) return;
      yield fail(err);
      return;
    }
  }
  const { canvasId, canvasMeta } = pages[0];

  // ---- 3) Tool done + done narrative ----
  taskMeta = taskMeta.map((x) => (x.id === toolId ? { ...x, status: "1" } : x));
  if (pages.length > 1) yield ev(`Created ${pages.length} pages.`, { renderData: { msgMeta: [pages.at(-1)!.canvasMeta], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null } });
  yield ev(t.done(title.toLowerCase()), {
    renderData: { msgMeta: [canvasMeta], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null },
  });

  // ---- 4) Node done ----
  taskMeta = taskMeta.map((x) => (x.id === nodeId ? { ...x, status: "1" } : x));
  yield ev("", { renderData: { msgMeta: [canvasMeta], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null } });

  // ---- 5) Manager Agent result + exportMeta ----
  const resultId = uuid32();
  taskMeta = [...taskMeta, { id: resultId, content: "Manager Agent", type: "result", status: "0" }];
  yield ev(`<Result>[[task::result::${resultId}]]`, {
    renderData: {
      msgMeta: [canvasMeta],
      fileMeta: [],
      taskMeta,
      exportMeta: {
        projectName: foldAscii(title),
        createTime: Math.floor(Date.now() / 1000),
        defaultExportType: "jpg",
      },
      confirmRequest: null,
    },
  });
  yield ev(`</Content>`);
}
