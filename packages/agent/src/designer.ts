import { randomUUID } from "node:crypto";
import type { ImageProvider, LlmProvider } from "@pixforge/providers";
import type { ChatEvent, SceneCanvas } from "@pixforge/schema";

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

/**
 * Designer Agent orchestration:
 * 1. the "Designer Agent" node opens with a progress narrative
 * 2. the "Image Generator" tool streams progressive canvases (one uuid, emitted repeatedly)
 * 3. tool done → done narrative
 * 4. node done
 * 5. <Result>[[task::result::]] "Manager Agent" + final canvas + exportMeta (ASCII-folded projectName)
 * 6. </Content>
 */
export async function* runDesignerAgent(
  input: DesignerAgentInput,
  deps: DesignerAgentDeps,
): AsyncGenerator<ChatEvent> {
  const msgId = Date.now();
  const brandId = input.brandId ?? 0;
  const width = input.width ?? 1360;
  const height = input.height ?? 2048;
  const lang = (input.language as NarrativeLang) ?? detectLanguage(input.prompt);
  const t = NARRATIVE;
  let taskMeta: ChatEvent["renderData"]["taskMeta"] = [];

  const ev = (content: string, extra?: Partial<ChatEvent>): ChatEvent => ({
    msgId,
    content,
    status: 0,
    error: "",
    renderData: { msgMeta: [], fileMeta: [], taskMeta, exportMeta: null },
    brandId,
    ...extra,
  });

  const pagesWanted = Math.max(1, Math.min(9, input.pages ?? 1));
  // ---- 1) Planner node ----
  const nodeId = uuid32();
  taskMeta = [{ id: nodeId, content: "Designer Agent", type: "node", status: "0" }];
  const planRaw = await deps.llm.chat(
    [
      {
        role: "system",
        content:
          `You are a poster planner. Reply JSON {title, imagePrompt, copy}. ` +
          `IMPORTANT language rule: write title/copy in the SAME language as the user prompt ` +
          `(${lang}); never silently translate to another language.` +
          (input.skill ? `\nSkill structure hint: ${input.skill}.` : "")
          + (pagesWanted > 1 ? `\nProduce exactly ${pagesWanted} imagePrompts[] (one per page, coherent series).` : "")
          + (input.outlineMode ? `\nAlso return outline[] — 3-6 short bullets planning the content (Outline Mode).` : "")
          + (input.brandGuidance ? `\nBrand rules the output MUST follow:\n${input.brandGuidance}` : ""),
      },
      { role: "user", content: input.prompt },
    ],
    { json: true },
  );
  let plan: {
    title?: string; imagePrompt?: string; copy?: string;
    outline?: string[]; imagePrompts?: string[];
  } = {};
  try { plan = JSON.parse(planRaw); } catch { /* the agent still runs */ }
  const title = plan.title ?? input.prompt.slice(0, 60);
  const copy = plan.copy ?? "";
  const imagePrompts =
    pagesWanted > 1 && plan.imagePrompts?.length
      ? plan.imagePrompts.slice(0, pagesWanted)
      : Array.from({ length: pagesWanted }, (_, i) =>
          i === 0 ? (plan.imagePrompt ?? input.prompt) : `${plan.imagePrompt ?? input.prompt} — variation ${i + 1}`);
  yield ev(`<Collapse>[[task::node::${nodeId}]]`);
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
    const img = await deps.image.generate({
      prompt: imagePrompts[pi], width, height,
      referenceImages: pi === 0 ? input.referenceImages : undefined,
    });
    const canvasId = uuid32();
    const scene: SceneCanvas = {
      version: "7.3.1",
      objects: [
        { type: "Rect", name: "clip", left: 0, top: 0, width, height, fill: "white", selectable: false, hasControls: false, visible: true },
        { type: "Image", left: 0, top: 0, width, height, src: img.url, crossOrigin: "anonymous", selectable: true, visible: true },
        ...(pi === 0 && copy
          ? [{
              type: "Textbox", left: Math.round(width * 0.1), top: Math.round(height * 0.72),
              width: Math.round(width * 0.8), height: 120, text: copy, fontFamily: "Inter",
              fontSize: 96, fontWeight: "bold", fill: "#ffffff", textAlign: "center",
              selectable: true, visible: true,
            }]
          : []),
      ],
    };
    const canvasMeta = { id: canvasId, type: "canvas" as const, thumbnail: img.url, canvas: scene };
    pages.push({ canvasId, canvasMeta });
    // event contract: content="[[canvas::canvas::id]] " with msgMeta attached
    yield ev(`[[canvas::canvas::${canvasId}]] `, { renderData: { msgMeta: [canvasMeta], fileMeta: [], taskMeta, exportMeta: null } });
  }
  const { canvasId, canvasMeta } = pages[0];

  // ---- 3) Tool done + done narrative ----
  taskMeta = taskMeta.map((x) => (x.id === toolId ? { ...x, status: "1" } : x));
  if (pages.length > 1) yield ev(`Created ${pages.length} pages.`, { renderData: { msgMeta: [pages.at(-1)!.canvasMeta], fileMeta: [], taskMeta, exportMeta: null } });
  yield ev(t.done(title.toLowerCase()), {
    renderData: { msgMeta: [canvasMeta], fileMeta: [], taskMeta, exportMeta: null },
  });

  // ---- 4) Node done ----
  taskMeta = taskMeta.map((x) => (x.id === nodeId ? { ...x, status: "1" } : x));
  yield ev("", { renderData: { msgMeta: [canvasMeta], fileMeta: [], taskMeta, exportMeta: null } });

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
    },
  });
  yield ev(`</Content>`);
}
