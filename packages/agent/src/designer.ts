import { randomUUID } from "node:crypto";
import type { ChatEvent, SceneCanvas, FabricObject, PlanBlock, PlanPage, GenerationMode, PlannerPlan, EvalRead, SelfImproveResult, TaskMeta } from "@oia/schema";
import {
  parsePlannerPlan, normalizeBlocks, nextMsgId, SCENE_VERSION, PLANNER_INSTRUCTIONS, REFINE_INSTRUCTION,
  EVAL_JSON_SCHEMA, EVAL_READ_MARKER, evalReadSchema,
} from "@oia/schema";
import type { ImageProvider, LlmProvider, ImageGenResult } from "@oia/providers";
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
  /** Page count: a fixed N is 1..9. "Auto" generates ONE page today (the composer's
   *  default) — there is no planner-decided count yet (stale comment fixed 2026-10-31). */
  pages?: number;
  /** Outline mode: emit the outline (title + bullets) BEFORE generating. */
  outlineMode?: boolean;
  /** C1 outline gate phase 1 (docs/designs/outline-gate.md OC-1): stop after the
   * planner returns pageOutline — NO image call. Phase 2 sends approvedOutline. */
  outlineGate?: boolean;
  /** C1 phase 2: the user-edited outline. Planner is constrained to it; the page
   * COUNT is a hard contract both ways (OC-2) — mismatch aborts before any image. */
  approvedOutline?: PlanPage[];
  /** Selected skill (e.g. "Presentation Maker") — structure hint for the planner. */
  skill?: string;
  /** A3-lite: referenceImages[0] is the edit target — clauses are welded HERE
   *  (deterministic, planner-proof), never in the renderer's prompt string. */
  editMode?: { targetName?: string; textLayerOverlays?: boolean };
  /** TP.3 — generation mode. Poster (baked text, fidelity guard) stays the default for skills/templates; the Home banner flow sends "clean-plate". */
  mode?: GenerationMode;
  /** DA-1 — run the planner turn with live web search. Capability-gated: a
   * provider without `webSearch` plans from the prompt alone (announced, never
   * silently skipped — DA-2). Ignored when reusePlan skips the planner turn. */
  research?: boolean;
  /** DA-3 — Auto refine rounds PER PAGE: after each image a critic read checks
   * it; a failed check re-plans + re-generates, bounded by `rounds` (0 = off).
   * The loop lives INSIDE the one metered job (hard rule 6 / G3). */
  selfImprove?: { rounds: number };
  /** TP.5 — cooperative cancellation; checked between stages and threaded into providers. */
  signal?: AbortSignal;
  /** TP.4/TP.5 — correlation id; when provided (the SSE route pre-generates it so /api/chat/cancel can address the job), every event carries it. */
  jobId?: string;
  /** TP.4 stage-aware retry: a cached plan from a failed-image run — the planner stage
   *  is skipped entirely (zero planner turns spent on a retry that only needs the image). */
  reusePlan?: PlannerPlan;
  /** TP.4: the route stashes the successful plan per session so a retry reuses it. */
  onPlan?: (plan: PlannerPlan) => void;
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

/** A3-lite edit contract — one place, deterministic, planner-proof (the live
 *  experiments of 2026-11-02 verified each clause: target declaration kills
 *  wrong-image edits, the dimension lock kills ratio-mismatch warnings, the
 *  lettering ban stops a plate growing text that would double after apply). */
export function buildEditClauses(edit: { targetName?: string; textLayerOverlays?: boolean }): string {
  const target = ` Edit Image 1${edit.targetName ? ` (the ${edit.targetName} layer)` : ""} only, and return the result at the exact same dimensions as Image 1.`;
  const noText = edit.textLayerOverlays ? " Do not add any text or lettering — copy is added as separate layers." : "";
  return target + noText;
}

/** DA-3..DA-8 — Auto refine helpers. The loop itself lives inline in the page
 * loop so every yield keeps the taskMeta/ev orchestration in one place. */

/** Decode a `data:` image URL to bytes — the critic needs the actual pixels.
 * Every current provider returns data URLs; anything else returns null and the
 * loop reports "check unavailable" instead of pretending (DA-7, 0 extra burn). */
export function decodeDataImage(url: string): Uint8Array | null {
  const m = /^data:image\/[a-z+.-]+;base64,(.+)$/i.exec(url.trim());
  if (!m) return null;
  try {
    return Uint8Array.from(Buffer.from(m[1], "base64"));
  } catch {
    return null;
  }
}

/** Tolerant eval parse: strict on shape, lenient on fences (parsePlannerPlan pattern). */
export function parseEvalRead(raw: string): EvalRead | null {
  const unfenced = raw.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  try {
    const parsed = evalReadSchema.safeParse(JSON.parse(unfenced));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Best-effort ranking: mean of the four criteria (DA-3). */
export function evalTotal(e: EvalRead): number {
  return (e.scores.textHandling + e.scores.brand + e.scores.fidelity + e.scores.composition) / 4;
}

/** DA-8 — mode-aware critic criteria live in ONE place, versioned with the
 * planner prompt. Poster weighs rendered text heaviest (D16 + RE §7.1: wrong
 * spelling/language is the image model's #1 defect — the reference competitor
 * ships it too): the copy to judge is INSIDE the page prompt (it names the exact
 * lines) — never duplicated into a second field (teardown #11: two copies of the
 * same text confuse the reader). Clean-plate swaps the criterion for copy-zone
 * headroom: `overlayCopy` lists ONLY the copy that will land on THIS page
 * (page 0 carries the blocks; later pages carry none — teardown #3).
 * The `textHandling` score covers both meanings; the prompt says which applies. */
/** B7: stamped into every selfImprove record — the rubric shipped 3 versions in one day;
 * a verdict must name its judge. Bump when the rubric changes. */
export const CRITIC_PROMPT_VERSION = "v3";

export function criticPrompt(o: {
  mode: GenerationMode;
  title: string;
  pagePrompt: string;
  /** Clean-plate ONLY: the overlay copy this page must leave room for. */
  overlayCopy: string[];
  brandGuidance?: string;
}): string {
  const overlays = o.mode === "clean-plate"
    ? o.overlayCopy.length
      ? `Overlay copy that will land on this page (the artwork must leave clean, uncluttered room exactly where each line sits): ${o.overlayCopy.join(" | ")}`
      : "This page carries NO overlay copy (purely visual plate)."
    : `The image prompt above names the exact copy lines that must be rendered — judge every rendered line against them.`;
  return (
    `Critic rubric ${CRITIC_PROMPT_VERSION}.\n` +
    `You are a senior art director doing final review of ONE generated image for a paying client. You are strict and evidence-driven: "shippable" means the client approves it without a single revision.\n` +
    `Brief title: ${o.title}\n` +
    `Image prompt that produced it: ${o.pagePrompt}\n` +
    (o.brandGuidance ? `Brand rules that must hold: ${o.brandGuidance}\n` : "") +
    `\nMETHOD — look before you judge:\n` +
    `1. TRANSCRIBE first: read every line of text actually painted in the image, character by character, including every diacritic. Never assume the copy came out right because the prompt asked for it — garbled rendered text is the single most common defect of image models.\n` +
    `2. SQUINT at the image (the designer's squint test): when blurred, what registers first, second, third? That is the real hierarchy — it must match what the brief intends to lead.\n` +
    `3. Only then score. Every issue you report must be something you SAW, at a place you can name.\n` +
    `\nSCORE BANDS — same meaning for every criterion:\n` +
    `9-10 flawless; a senior designer ships it without a comment. 7-8 shippable; at most one minor nit nobody would resend. 4-6 the client sends it back; visible defects. 0-3 broken; unusable as-is.\n` +
    `When torn between two scores, take the LOWER one.\n` +
    `\nCRITERIA — the classic design-review dimensions (C.R.A.P. + Gestalt), weighted for AI image output:\n` +
    `TEXTHANDLING (heaviest weight)${o.mode === "poster" ? " — every rendered line matches its brief line EXACTLY: spelling, language, diacritics, casing; no garbled, invented, duplicated or missing words; the leading line stays legible at the size the design will actually be consumed. CRITICAL defects (instant fail): garbled or invented text, wrong language, missing copy line, wrong or missing diacritics, unreadable leading line." : " — the artwork leaves clean, uncluttered space where each overlay line lands (check figure-ground contrast against what sits behind it); any text painted INTO the image is a defect in this mode."}\n` +
    overlays + `\n` +
    `BRAND: adherence to the brand rules above (10 only when none were given).\n` +
    `FIDELITY: everything the brief named — subject, style, mood, aspect and platform context; anything named that is absent or wrong is a defect.\n` +
    `COMPOSITION — judge like a designer, whatever the design type (poster, menu, slide, overlay, social post):\n` +
    `- Hierarchy: one clear focal order — primary message/subject first, then secondary, then supporting; the squint-test order must match the brief's intent.\n` +
    `- Contrast & figure-ground: text and subject separate cleanly from the background; contrast is deliberate, never accidental blending.\n` +
    `- Alignment & proximity: elements align to edges or a grid; related elements grouped, unrelated separated (C.R.A.P.).\n` +
    `- Repetition & consistency: recurring styles, colors and type treatments stay consistent where the brief implies them.\n` +
    `- Balance, negative space, crop: no accidental crowding or dead zones; nothing important clipped or within ~5% of any edge.\n` +
    `\nVERDICT: "pass" ONLY when every score is 7+ AND no critical defect exists. Anything fixable that you would revise yourself means "fail" — do not grade effort, grade the artifact.\n` +
    `issues[]: one entry per defect, evidence-first — what you saw and where, e.g. rendered 'GIAM SÓC' top center while the brief says 'GIẢM SỐC' (diacritics missing).\n` +
    `fixHints[]: imperative edits to the IMAGE PROMPT only — change exactly what is broken, keep everything that worked, specific enough that one regeneration fixes it.\n` +
    EVAL_READ_MARKER
  );
}

/** Input + winner of one page's Auto refine loop (DA-3). `taskMeta` returns the
 * frames the caller must adopt — the check/refine nodes live there. */
export interface RefinePageResult {
  img: ImageGenResult;
  prompt: string;
  selfImprove: SelfImproveResult | null; // null only when the loop never ran (rounds 0)
  taskMeta: TaskMeta[];
}

/** DA-3 — one page's bounded critic→refine loop, extracted from the page loop
 * (teardown #13: a 120-line inline loop was steering the generator toward
 * god-function). Semantics:
 * - `rounds` counts refine ATTEMPTS; the recorded `selfImprove.rounds` counts
 *   re-generations that PRODUCED an image (a failed refine turn burns quota but
 *   adds no round — the failure + its error class rides the note, teardown #5/#6)
 * - every stop flavor keeps the current best image and never burns the main flow (G2)
 * - abort anywhere yields-nothing-more; the caller finalizes with the best image (DA-7)
 */
async function* refinePage(a: {
  img: ImageGenResult;
  prompt: string;
  rounds: number;
  deps: DesignerAgentDeps;
  signal?: AbortSignal;
  jobId?: string;
  brandGuidance?: string;
  brandId: number;
  msgId: number;
  referenceImages?: string[];
  mode: GenerationMode;
  title: string;
  /** Clean-plate page 0 only: the overlay texts for THIS page (teardown #3). */
  blockTexts: string[];
  width: number;
  height: number;
  taskMeta: TaskMeta[];
}): AsyncGenerator<ChatEvent, RefinePageResult> {
  const { deps, signal, jobId, mode, title, width, height } = a;
  let taskMeta = a.taskMeta;
  let img = a.img;
  let pagePrompt = a.prompt;
  let selfImprove: SelfImproveResult | null = null;
  const ev = (content: string, extra?: Partial<ChatEvent>): ChatEvent => ({
    msgId: a.msgId,
    content,
    status: 0,
    error: "",
    renderData: { msgMeta: [], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null },
    brandId: a.brandId,
    jobId,
    ...extra,
  });
  const flip = (id: string): void => {
    taskMeta = taskMeta.map((x) => (x.id === id ? { ...x, status: "1" } : x));
  };

  const candidates: { img: ImageGenResult; prompt: string; evalRead: EvalRead }[] = [];
  let attemptsLeft = a.rounds;      // refine turns the bound still allows
  let roundsRun = 0;                // re-generations that actually produced an image
  while (true) {
    if (signal?.aborted) return { img, prompt: pagePrompt, selfImprove, taskMeta }; // DA-7: keep the best already-generated image
    const checkRound = candidates.length + 1;
    const checkId = randomUUID();
    taskMeta = [...taskMeta, { id: checkId, content: `Checking round ${checkRound}`, type: "node", status: "0" }];
    yield ev(`Checking round ${checkRound}…`);
    let evalRead: EvalRead | null = null;
    const bytes = decodeDataImage(img.url);
    if (bytes && deps.llm.readImage) {
      try {
        const raw = await deps.llm.readImage(
          criticPrompt({ mode, title, pagePrompt, overlayCopy: a.blockTexts, brandGuidance: a.brandGuidance }),
          bytes, EVAL_JSON_SCHEMA, { signal, jobId },
        );
        evalRead = parseEvalRead(raw);
      } catch {
        evalRead = null; // G2: a failed check never burns the main flow
      }
    }
    // teardown #10: close the check frame BEFORE any abort exit — no node may
    // hang "running" on the canvas the caller is about to yield
    flip(checkId);
    if (signal?.aborted) return { img, prompt: pagePrompt, selfImprove, taskMeta };
    if (!evalRead) {
      // DA-7: check unavailable → keep this version, zero extra burn
      yield ev("Auto refine check unavailable — keeping this version.");
      selfImprove = { criticVersion: CRITIC_PROMPT_VERSION, rounds: roundsRun, verdict: "best-effort", issues: [] };
      return { img, prompt: pagePrompt, selfImprove, taskMeta };
    }
    candidates.push({ img, prompt: pagePrompt, evalRead });
    if (evalRead.verdict === "pass") {
      selfImprove = { criticVersion: CRITIC_PROMPT_VERSION, rounds: roundsRun, verdict: "pass", issues: evalRead.issues };
      return { img, prompt: pagePrompt, selfImprove, taskMeta };
    }
    if (attemptsLeft <= 0) {
      // DA-3: no pass within budget → the best-scoring candidate wins (best-effort)
      const best = candidates.reduce((x, y) => (evalTotal(x.evalRead) >= evalTotal(y.evalRead) ? x : y));
      selfImprove = { criticVersion: CRITIC_PROMPT_VERSION, rounds: roundsRun, verdict: "best-effort", issues: best.evalRead.issues };
      return { img: best.img, prompt: best.prompt, selfImprove, taskMeta };
    }
    // one refine turn: planner revises the prompt (text-only), then one image
    attemptsLeft -= 1;
    const refineId = randomUUID();
    taskMeta = [...taskMeta, { id: refineId, content: "Refining", type: "node", status: "0" }];
    yield ev("Refining…");
    let revisedPrompt: string | null = null;
    try {
      const refined = parsePlannerPlan(await deps.llm.chat(
        [
          { role: "system", content: REFINE_INSTRUCTION + (a.brandGuidance ? `\nBrand rules still apply:\n${a.brandGuidance}` : "") },
          { role: "user", content: JSON.stringify({ imagePrompt: pagePrompt, issues: evalRead.issues, fixHints: evalRead.fixHints }) },
        ],
        { json: true, signal, jobId },
      ));
      revisedPrompt = refined?.imagePrompt ?? null;
    } catch {
      revisedPrompt = null; // G2: refine-planner failure keeps the current image
    }
    flip(refineId);
    if (!revisedPrompt) {
      // teardown #5/#6: the burned planner turn is ANNOUNCED — a quota cost with
      // no round and no note is a record that lies
      yield ev("Auto refine could not revise the prompt (planner returned no usable plan) — keeping this version.");
      selfImprove = { criticVersion: CRITIC_PROMPT_VERSION, rounds: roundsRun, verdict: "best-effort", issues: evalRead.issues };
      return { img, prompt: pagePrompt, selfImprove, taskMeta };
    }
    try {
      img = await deps.image.generate({
        prompt: revisedPrompt, width, height, mode,
        referenceImages: a.referenceImages,
        signal, jobId,
      });
      pagePrompt = revisedPrompt;
      roundsRun += 1; // teardown #5: a round = a re-generation that produced an image
    } catch (err) {
      if (signal?.aborted) return { img, prompt: pagePrompt, selfImprove, taskMeta };
      // teardown #6: the note names the class — "failed" alone hides quota_exceeded
      const cls = ProviderError.from(err, deps.image.name).errorClass;
      yield ev(`Auto refine regeneration failed (${cls}) — keeping this version.`);
      selfImprove = { criticVersion: CRITIC_PROMPT_VERSION, rounds: roundsRun, verdict: "best-effort", issues: evalRead.issues };
      return { img, prompt: pagePrompt, selfImprove, taskMeta };
    }
  }
}

/** Scene builder: artwork placed to cover (zone-anchored crop on ratio mismatch) + named textboxes from blocks. */
export function buildScene(opts: {
  artworkUrl: string;
  artworkW?: number;
  artworkH?: number;
  width: number;
  height: number;
  blocks: PlanBlock[];
  /** Placement policy is mode-dependent (DEF-1) — required, no silent default. */
  mode: GenerationMode;
}): SceneCanvas {
  const { width, height } = opts;
  const objects: FabricObject[] = [
    { type: "Rect", name: "clip", origin: "generated", left: 0, top: 0, width, height, fill: "white", selectable: false, hasControls: false, visible: true },
  ];

  // Zone-anchored cover placement (TP.8): the canvas keeps its nominal size; the
  // artwork layer covers it, cropping the overflow away from the copy zones.
  if (opts.artworkW && opts.artworkH) {
    const fit = fitCoverWithZones(opts.artworkW, opts.artworkH, width, height, opts.mode);
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
  return { version: SCENE_VERSION, objects };
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
  const msgId = nextMsgId(); // monotonic — Date.now() alone collides for same-ms streams
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

  // B3: provider attribution comes from the THROWING stage — a planner failure is never
  // labeled with the image provider's name. ProviderError keeps its own provider when set.
  const fail = (err: unknown, providerHint: string): ChatEvent => {
    const pe = ProviderError.from(err, providerHint);
    return ev("", {
      error: pe.message,
      errorClass: pe.errorClass,
      provider: pe.provider ?? providerHint,
      attemptNumber: 1, // metered jobs run exactly once (G3)
      resetAt: pe.resetAt, // Q3: quota reset time when the provider showed one
      renderData: { msgMeta: [], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null },
    });
  };

  // C1: the approved outline (phase 2) DECIDES the page count before the planner
  // prompt is built — otherwise the "exactly N imagePrompts" instruction never fires.
  const approvedPages = input.approvedOutline?.length ?? 0;
  const pagesWanted = Math.max(1, Math.min(9, approvedPages || (input.pages ?? 1)));
  // ---- 1) Planner node ----
  // DA-1: research rides INSIDE the planner turn (one exec: search + plan); its
  // node opens first so the timeline narrates "Researching the web → Planning".
  const researchWanted = input.research === true && !input.reusePlan;
  const researchActive = researchWanted && deps.llm.capabilities.webSearch === true;
  const nodeId = uuid32();
  const researchId = uuid32();
  if (researchWanted && !researchActive) {
    // DA-2: say it, never skip silently — research is an enhancer, the job runs on
    yield ev(`Research unavailable on ${deps.llm.name} — generating from the prompt alone.`);
  }
  taskMeta = [
    ...(researchActive ? [{ id: researchId, content: "Researching the web", type: "node" as const, status: "0" }] : []),
    { id: nodeId, content: "Designer Agent", type: "node", status: "0" },
  ];
  yield ev(`<Collapse>[[task::node::${researchActive ? `${researchId}]][[task::node::` : ""}${nodeId}]]`);

  let plan: ReturnType<typeof parsePlannerPlan>;
  if (input.reusePlan) {
    // TP.4 stage-aware retry: the cached plan rides again — the planner never runs
    plan = input.reusePlan;
  } else
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
            + (researchActive ? `\n${PLANNER_INSTRUCTIONS.research}` : "")
            + ((pagesWanted > 1 || approvedPages >= 1) ? `\n${PLANNER_INSTRUCTIONS.imagePrompts(pagesWanted)}` : "")
            + (input.outlineMode ? `\nAlso return outline[] — 3-6 short bullets planning the content (Outline Mode).` : "")
            + (input.outlineGate && pagesWanted > 1 ? `\n${PLANNER_INSTRUCTIONS.pageOutline(pagesWanted)}` : "")
            + (input.approvedOutline?.length ? `\nThe user APPROVED this page outline — implement each page faithfully; do NOT merge, add, drop or reorder pages:\n${input.approvedOutline.map((p, i) => `${i + 1}. ${p.title} — ${p.summary}`).join("\n")}` : "")
            + (input.brandGuidance ? `\nBrand rules the output MUST follow:\n${input.brandGuidance}` : "")
            + (mode === "clean-plate"
              ? `\nClean-plate mode: the imagePrompt must describe text-free artwork (no added typography; product packaging lettering is preserved) — ALL copy goes into blocks[].`
              : `\nPoster mode (D16): the image model RENDS the copy — put every text line into imagePrompt verbatim with placement and typography hints (e.g. \"bold condensed 'FLASH SALE' across the top, '20% OFF TODAY' large beneath it\"); write ALL copy in the SAME language as the user's request — an English request gets English-only copy, never mixed; do NOT emit blocks[] — no overlay text will be added on top. The image channel cannot request exact pixels and the render is cover-cropped to the page (${width}\u00d7${height}, ratio ${(width / height).toFixed(2)}): state this aspect explicitly in every imagePrompt and demand ALL text inside a safe area — at least 10% clear of every edge — or the crop will cut edge-hugging lines.`
            )
            +
            `\nStyle vocabulary — when the request names or implies a style, spell the CONCRETE phrases into imagePrompt, never the label alone ` +
            `(adapted from SurgePix agent-skills, MIT): ` +
            `modern=grid-based, generous whitespace, strong focal hierarchy, modular alignment; ` +
            `vintage=collage-style, organic layered graphics, retro print alignment; ` +
            `minimalist=Swiss grid, maximum whitespace, typography-centered; ` +
            `bold=oversized typography, dynamic text layering, high impact (e-commerce promos); ` +
            `creative=freeform composition, cinematic balance, atmospheric negative space; ` +
            `3d=floating glossy 3D objects, layered digital interface, Y2K typography; ` +
            `hand-drawn=illustration-led, organic strokes, playful hand-lettered typography; ` +
            `business-promo=product-centered, large promotional headline, layered badges, clear CTA.`,
        },
        { role: "user", content: input.prompt },
      ],
      { json: true, signal: input.signal, jobId: input.jobId, ...(researchActive ? { search: true } : {}) },
    );
    plan = parsePlannerPlan(planRaw);
    if (!plan) {
      throw new ProviderError("plan_parse_failed", "the planner returned a malformed plan", { provider: deps.llm.name });
    }
    input.onPlan?.(plan); // stash for stage-aware retry (TP.4)
  } catch (err) {
    if (input.signal?.aborted) return; // TP.5: silent stop — the route emits the terminal cancelled event
    // G2/G7: planner failure aborts BEFORE image generation — explicit failure event, one attempt, no silent fallback
    yield fail(err, deps.llm.name);
    return;
  }

  const title = plan.title || input.prompt.slice(0, 60);
  const blocks = normalizeBlocks(plan);

  // DA-6: the research findings are part of the record — the user sees what the
  // planner learned (and imagePrompt already inherited them inside the turn).
  if (researchActive && plan.researchNotes?.length) {
    if (researchActive) taskMeta = taskMeta.map((x) => (x.id === researchId ? { ...x, status: "1" } : x));
    yield ev(`Research notes:\n${plan.researchNotes.map((n) => `- ${n}`).join("\n")}\n`);
  } else if (researchActive) {
    taskMeta = taskMeta.map((x) => (x.id === researchId ? { ...x, status: "1" } : x));
  }

  // ---- C1 outline gate phase 1: emit the outline and STOP — zero image calls (OC-1) ----
  if (input.outlineGate && !input.approvedOutline && pagesWanted > 1) {
    const pageOutline = plan.pageOutline;
    if (!pageOutline || pageOutline.length !== pagesWanted) {
      // OC-2: a wrong-count outline is a planner failure — abort before any quota burns
      yield fail(
        new ProviderError("plan_parse_failed", `the planner returned ${pageOutline?.length ?? 0}/${pagesWanted} outline pages`, { provider: deps.llm.name }),
        deps.llm.name,
      );
      return;
    }
    taskMeta = taskMeta.map((x) => (x.id === nodeId ? { ...x, status: "1" } : x));
    yield ev(`Outline for ${pagesWanted} pages:`);
    yield ev(pageOutline.map((p, i) => `${i + 1}. ${p.title} — ${p.summary}`).join("\n"), {
      renderData: { msgMeta: [], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null, outline: pageOutline },
    });
    yield ev(`</Content>`);
    return;
  }

  // ---- C1 phase 2: the approved outline is the page-count contract (OC-2/OC-3) ----
  if (input.approvedOutline?.length) {
    const approved = input.approvedOutline;
    const got = plan.imagePrompts?.length ?? 0;
    if (got !== approved.length) {
      yield fail(
        new ProviderError("plan_parse_failed", `the planner returned ${got}/${approved.length} page prompts for the approved outline`, { provider: deps.llm.name }),
        deps.llm.name,
      );
      return;
    }
  }

  const imagePrompts = (() => {
    const base = input.approvedOutline?.length
      ? plan.imagePrompts!
      : pagesWanted > 1 && plan.imagePrompts?.length
        ? plan.imagePrompts.slice(0, pagesWanted)
        : Array.from({ length: pagesWanted }, (_, i) =>
            i === 0 ? (plan.imagePrompt ?? input.prompt) : `${plan.imagePrompt ?? input.prompt} — variation ${i + 1}`);
    // A3-lite: append the edit contract only when the caller sent references —
    // "Image 1" names referenceImages[0], so the clauses are meaningless without it.
    const clauses = input.editMode && input.referenceImages?.length ? buildEditClauses(input.editMode) : "";
    return clauses ? base.map((p) => p + clauses) : base;
  })();

  yield ev(
    input.referenceImages?.length
      ? `${t.progress(title.toLowerCase())} (adjusted for ${input.referenceImages.length} reference image${input.referenceImages.length === 1 ? "" : "s"})`
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
  const refineRounds = Math.max(0, input.selfImprove?.rounds ?? 0);
  /** DA-6/B7 — the hero verdict pairs with the HERO canvas the terminal events
   * attach (pages[0]); every page's verdict rides `selfImprovePages` so the
   * record never drops a refine round that burned quota (teardown #2). */
  let heroSelfImprove: SelfImproveResult | null = null;
  const pageVerdicts: (SelfImproveResult | null)[] = [];
  for (let pi = 0; pi < imagePrompts.length; pi++) {
    if (input.signal?.aborted) return; // TP.5: stop between stages; no orphan generation
    try {
      let img = await deps.image.generate({
        prompt: imagePrompts[pi], width, height, mode,
        referenceImages: pi === 0 ? input.referenceImages : undefined,
        signal: input.signal,
        jobId: input.jobId, // A9: one correlation id across events, records, and CLI transcripts
      });
      let pagePrompt = imagePrompts[pi];

      // ---- DA-3: Auto refine — critic check → bounded refine, INSIDE this metered job ----
      let selfImprove: SelfImproveResult | null = null;
      if (refineRounds > 0) {
        const r = yield* refinePage({
          img, prompt: pagePrompt, rounds: refineRounds,
          deps, signal: input.signal, jobId: input.jobId,
          brandGuidance: input.brandGuidance, brandId, msgId,
          referenceImages: pi === 0 ? input.referenceImages : undefined,
          mode, title,
          // teardown #3: only page 0 carries overlay blocks — later pages are
          // judged as purely visual plates, not against copy that never lands
          blockTexts: mode === "clean-plate" && pi === 0 ? blocks.map((b) => b.text) : [],
          width, height, taskMeta,
        });
        img = r.img;
        pagePrompt = r.prompt;
        selfImprove = r.selfImprove;
        taskMeta = r.taskMeta;
      }

      const canvasId = uuid32();
      // D16: in poster mode the copy is baked into the artwork — overlay blocks
      // would DOUBLE the text. The planner is told not to emit them; this guard
      // holds even when it half-complies (bakes the copy AND returns blocks).
      // A half-complying planner can also LOSE copy it never baked — that must
      // never be silent (B7 spirit, same bar as format_drift): warn per page.
      if (pi === 0 && mode !== "clean-plate" && blocks.length > 0) {
        yield ev(`Note: ${blocks.length} planned text block${blocks.length === 1 ? "" : "s"} were not drawn — in Text-in-image mode the copy is rendered into the artwork. If any copy is missing from the image, ask for a repaint.`, {
          renderData: { msgMeta: [], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null },
        });
      }
      const scene = buildScene({
        artworkUrl: img.url,
        artworkW: img.width,
        artworkH: img.height,
        width, height,
        mode,
        // blocks land on the first page only — per-page blocks wait for a real ask.
        blocks: pi === 0 && mode === "clean-plate" ? blocks : [],
      });
      const canvasMeta = { id: canvasId, type: "canvas" as const, thumbnail: img.url, canvas: scene };
      pages.push({ canvasId, canvasMeta });
      if (pi === 0) heroSelfImprove = selfImprove;
      pageVerdicts.push(selfImprove);
      yield ev(`[[canvas::canvas::${canvasId}]] `, {
        renderData: { msgMeta: [canvasMeta], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null, ...(selfImprove ? { selfImprove } : {}) },
      });
      if (input.signal?.aborted) return; // DA-7: canvas yielded, stop here — route sends cancelled
    } catch (err) {
      if (input.signal?.aborted) return;
      yield fail(err, deps.image.name);
      return;
    }
  }
  const { canvasId, canvasMeta } = pages[0];
  // DA-6/B7: hero verdict pairs with the hero canvas; the per-page array keeps
  // every verdict the run actually produced (present only when the loop ran)
  const verdictExtras = {
    ...(heroSelfImprove ? { selfImprove: heroSelfImprove } : {}),
    ...(refineRounds > 0 ? { selfImprovePages: pageVerdicts } : {}),
  };

  // ---- 3) Tool done + done narrative ----
  taskMeta = taskMeta.map((x) => (x.id === toolId ? { ...x, status: "1" } : x));
  if (pages.length > 1) yield ev(`Created ${pages.length} pages.`, { renderData: { msgMeta: [pages.at(-1)!.canvasMeta], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null, ...verdictExtras } });
  yield ev(t.done(title.toLowerCase()), {
    renderData: { msgMeta: [canvasMeta], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null, ...verdictExtras },
  });

  // ---- 4) Node done ----
  taskMeta = taskMeta.map((x) => (x.id === nodeId ? { ...x, status: "1" } : x));
  yield ev("", { renderData: { msgMeta: [canvasMeta], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null } });

  // ---- 5) Manager Agent result + exportMeta ----
  const resultId = uuid32();
  taskMeta = [...taskMeta, { id: resultId, content: "Manager Agent", type: "result", status: "0" }];;;
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
      ...verdictExtras,
    },
  });
  // BR-2 settle: the result node CLOSES (0→1) — without this terminal flip the UI
  // timeline hangs on "Manager Agent · running…" after the poster has finished.
  taskMeta = taskMeta.map((x) => (x.id === resultId ? { ...x, status: "1" } : x));
  yield ev("", { renderData: { msgMeta: [], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null, ...verdictExtras } });
  yield ev(`</Content>`, { renderData: { msgMeta: [], fileMeta: [], taskMeta, exportMeta: null, confirmRequest: null, ...verdictExtras } });
}
