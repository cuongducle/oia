import { z } from "zod";

/**
 * Stage-0 contracts (TP.1/TP.3/TP.4/TP.10/TP.11).
 * The planner plan gains free-form text `blocks[]`; every provider declares
 * capabilities; a stable 14-class error taxonomy rides task records and SSE events.
 */

/** TP.4 — the one and only error taxonomy. Adapters normalize their quirks into these classes. */
export const errorClassSchema = z.enum([
  "provider_missing",
  "not_logged_in",
  "quota_exceeded",
  "rate_limited",
  "content_refused",
  "timeout",
  "format_drift",
  "no_output",
  "plan_parse_failed",
  "capability_unsupported",
  "persistence_failed",
  "network",
  "cancelled",
  "unknown",
]);
export type ErrorClass = z.infer<typeof errorClassSchema>;
export const ERROR_CLASSES = errorClassSchema.options;

/** TP.3 — generation modes. Poster bakes text (fidelity guard); clean-plate forbids added typography. */
export const generationModeSchema = z.enum(["poster", "clean-plate"]);
export type GenerationMode = z.infer<typeof generationModeSchema>;

/** TP.10 — provenance. Legacy objects without `origin` default to "user" (the conservative choice). */
export const objectOriginSchema = z.enum(["user", "agent", "generated"]);
export type ObjectOrigin = z.infer<typeof objectOriginSchema>;

/** TP.1 — one free-form text block. `role` is chosen by the planner ("price", "date", "headline"…), not an enum. */
export const planBlockSchema = z.object({
  role: z.string().min(1),
  text: z.string().min(1),
  styleHint: z.string().nullable().optional(),
});
export type PlanBlock = z.infer<typeof planBlockSchema>;

/** C1 outline gate — one approved deck page: title + what the page will say.
 * The outline card edits THIS shape; phase 2 generation honors it by count (OC-2).
 * .trim(): a whitespace-only title is BLANK — the wire, the planner parse and the
 * card's validity check must all agree on that (teardown 2026-10-31). */
export const planPageSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});
export type PlanPage = z.infer<typeof planPageSchema>;

/** C1 — the planner instruction fragments are SHARED CONSTANTS, not prose owned by
 * the designer: the mock planner derives its matchers from THESE (rewording the
 * designer used to silently break every mock gate — teardown 2026-10-31).
 *
 * DA-1/DA-2 — research rides INSIDE the planner turn (`codex exec --search`).
 * The instruction is a shared constant for the same reason as C1: the mock
 * planner keys its deterministic researchNotes on this exact string. */
export const RESEARCH_INSTRUCTION =
  "Web research is ENABLED — search the web for current, specific facts (dates, prices, trends, events, holidays) relevant to this request and use what you find. Also return researchNotes[]: one line per finding, each ending with its source in parentheses. If nothing worth citing comes up, return an empty array.";

/** DA-3 — the refine turn instruction (shared constant so the mock planner can
 * key its deterministic refined output on it). The refine turn returns the SAME
 * plan JSON shape; the designer uses only `imagePrompt`. */
export const REFINE_INSTRUCTION =
  "You are refining a previously generated design after a critic found defects. Revise imagePrompt so the next render fixes every listed issue while keeping everything that already worked. Return the same plan JSON shape as before (designer.refine.v1).";

export const PLANNER_INSTRUCTIONS = {
  imagePrompts: (n: number) => `Produce exactly ${n} imagePrompts[] (one per page, coherent series).`,
  pageOutline: (n: number) => `Also return pageOutline[] — EXACTLY ${n} entries {title, summary}, one per page in order (Outline Gate).`,
  research: RESEARCH_INSTRUCTION,
} as const;

/**
 * Planner plan contract. Legacy `{title, imagePrompt, copy}` keeps working:
 * `copy`, when present, is read as a single block (see normalizeBlocks).
 */
export const plannerPlanSchema = z.object({
  title: z.string().min(1),
  imagePrompt: z.string().min(1),
  imagePrompts: z.array(z.string()).nullable().optional(),
  outline: z.array(z.string()).nullable().optional(),
  pageOutline: z.array(planPageSchema).nullable().optional(),
  copy: z.string().nullable().optional(),
  blocks: z.array(planBlockSchema).nullable().optional(),
  /** DA-1 — findings from the research-enabled planner turn; each line ends with
   * its source. Optional-nullable so every legacy plan parses unchanged (D14). */
  researchNotes: z.array(z.string()).nullable().optional(),
});
export type PlannerPlan = z.infer<typeof plannerPlanSchema>;

/** Legacy `copy` → one block; otherwise pass blocks through. Zero blocks is valid (poster mode). */
export function normalizeBlocks(plan: PlannerPlan): PlanBlock[] {
  const blocks = (plan.blocks ?? []).filter((b) => b.role && b.text);
  if (blocks.length) return blocks;
  if (plan.copy) return [{ role: "copy", text: plan.copy }];
  return [];
}

/** Tolerant parse for planner output: strict on shape, lenient on legacy extras. Returns null when not a plan. */
export function parsePlannerPlan(raw: string): PlannerPlan | null {
  const attempt = (text: string): unknown | undefined => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };
  // models sometimes wrap JSON in a fence — strip BEFORE parsing (a fenced text is not valid JSON)
  const unfenced = raw.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let value = attempt(unfenced);
  if (value === undefined) return null;
  // …and sometimes return a JSON string of a JSON string
  if (typeof value === "string") {
    const inner = attempt(value.trim());
    if (inner === undefined) return null;
    value = inner;
  }
  const parsed = plannerPlanSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** TP.11 — model capabilities are data, not code assumptions. */
export const sizePolicySchema = z.object({
  /** true-ratio WIDTHxHEIGHT is accepted (rounded to `divisibleBy`). */
  trueRatio: z.boolean().default(false),
  /** Only when trueRatio: dimensions must be divisible by this. */
  divisibleBy: z.number().int().positive().nullable().default(null),
  /** [min, max] width/height ratio bounds (trueRatio). */
  ratioBounds: z.tuple([z.number(), z.number()]).nullable().default(null),
  /** Exact sizes are honored (trueRatio=false): the fixed list, or orientation buckets. */
  fixedSizes: z.array(z.string()).nullable().default(null),
  /** The channel cannot request exact pixels at all (Codex $imagegen: orientation only). */
  orientationOnly: z.boolean().default(false),
});
export type SizePolicy = z.infer<typeof sizePolicySchema>;

export const providerCapabilitiesSchema = z.object({
  referenceImages: z.boolean(),
  sizePolicy: sizePolicySchema,
  transparentBg: z.boolean().default(false),
  isMock: z.boolean().default(false),
  /** DA-2 — the planner channel can run with live web search. Optional so every
   * legacy declaration parses unchanged (undefined ⇒ treat as false). */
  webSearch: z.boolean().optional(),
});
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;

/**
 * The JSON Schema handed to `codex exec --output-schema` (TP.2).
 *
 * OpenAI strict structured output requires EVERY property in `required`;
 * optional fields are `required` + nullable (`"type": ["string","null"]`) —
 * the pattern verified by spike S2 (2026-10-29). This object is the source of
 * truth; `plan.schema.json` is generated from it and a unit test fails on drift.
 */
export const PLAN_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://oia.dev/schemas/plan.schema.json",
  title: "OiaPlannerPlan",
  type: "object",
  additionalProperties: false,
  required: ["title", "imagePrompt", "imagePrompts", "outline", "pageOutline", "copy", "blocks", "researchNotes"],
  properties: {
    title: { type: "string", description: "Short project title, same language as the user request." },
    imagePrompt: { type: "string", description: "Art-direction prompt for the image model (English art direction is fine); do not include copy that exists as blocks." },
    imagePrompts: {
      type: ["array", "null"],
      items: { type: "string" },
      description: "Only for multi-page series: one prompt per page. Null otherwise.",
    },
    outline: {
      type: ["array", "null"],
      items: { type: "string" },
      description: "Only in outline mode: 3-6 short planning bullets. Null otherwise.",
    },
    pageOutline: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary"],
        properties: {
          title: { type: "string", description: "Page title, same language as the user request." },
          summary: { type: "string", description: "One line: what this page shows/says." },
        },
      },
      description: "Only in outline-gate phase 1: exactly one entry per requested page, in order. Null otherwise.",
    },
    copy: { type: ["string", "null"], description: "Legacy single-copy field. Prefer blocks[]; null when blocks are used." },
    researchNotes: {
      type: ["array", "null"],
      items: { type: "string" },
      description: "Only when web research was enabled: one line per finding, each ending with its source in parentheses. Null otherwise.",
    },
    blocks: {
      type: ["array", "null"],
      description: "Free-form text blocks that become editable native text layers. Zero/one/many — decide from the request. Null only when the plan format predates blocks.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "text", "styleHint"],
        properties: {
          role: { type: "string", description: "Free-form: headline, price, discount, date, name, slogan, subtitle…" },
          text: { type: "string", description: "The exact copy, in the user's language." },
          styleHint: { type: ["string", "null"], description: "Optional styling/placement hint (e.g. 'large bold, top'). Null when none." },
        },
      },
    },
  },
} as const;

/* ---------- DA — Auto refine (designer-agent-loop.md DA-3..DA-8) ---------- */

/** DA-4 — bounds are greppable constants, not LLM decisions (OC-6 pattern).
 * Default ON is the owner decision of 2026-11-06 (Q1); the switch OFF persists
 * in localStorage. A test pins both the default and the cap. */
export const AUTO_REFINE_DEFAULT = true;
export const AUTO_REFINE_MAX_ROUNDS_DEFAULT = 1;
export const AUTO_REFINE_MAX_ROUNDS_CAP = 2;

/** DA-3 — one critic read returns this shape (scores 0..10 per criterion). */
export const criticScoresSchema = z.object({
  text: z.number().min(0).max(10),
  brand: z.number().min(0).max(10),
  fidelity: z.number().min(0).max(10),
  composition: z.number().min(0).max(10),
});
export type CriticScores = z.infer<typeof criticScoresSchema>;

export const evalReadSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  scores: criticScoresSchema,
  issues: z.array(z.string().max(500)).max(20),
  fixHints: z.array(z.string().max(500)).max(20),
});
export type EvalRead = z.infer<typeof evalReadSchema>;

/** JSON Schema pinned via --output-schema on the critic read turn. */
export const EVAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "scores", "issues", "fixHints"],
  properties: {
    verdict: { type: "string", enum: ["pass", "fail"], description: "pass when the image is good enough to ship; fail when a fixable defect was found." },
    scores: {
      type: "object",
      additionalProperties: false,
      required: ["text", "brand", "fidelity", "composition"],
      properties: {
        text: { type: "number", minimum: 0, maximum: 10, description: "Spelling/language of rendered text (poster mode) or copy-zone space (clean-plate)." },
        brand: { type: "number", minimum: 0, maximum: 10, description: "Brand guidance adherence." },
        fidelity: { type: "number", minimum: 0, maximum: 10, description: "Match to the request and reference image." },
        composition: { type: "number", minimum: 0, maximum: 10, description: "Layout, balance, crop." },
      },
    },
    issues: { type: "array", items: { type: "string", maxLength: 500 }, maxItems: 20, description: "Concrete defects found." },
    fixHints: { type: "array", items: { type: "string", maxLength: 500 }, maxItems: 20, description: "Actionable edits for the image prompt." },
  },
} as const;

/** Stable marker at the end of the critic prompt — the mock matcher keys on it
 * (DECONSTRUCT_READ_MARKER pattern). */
export const EVAL_READ_MARKER = "designer.eval.v1";

/** DA-6 — the persisted verdict on the WINNING canvas event (B7: the record says
 * which round won and why). Optional-nullable on renderData (D14 additive). */
export const selfImproveResultSchema = z.object({
  /** Refine rounds actually RUN for the winning page (0 = never refined). */
  rounds: z.number().int().min(0),
  verdict: z.enum(["pass", "best-effort"]),
  issues: z.array(z.string().max(500)).max(20),
});
export type SelfImproveResult = z.infer<typeof selfImproveResultSchema>;
