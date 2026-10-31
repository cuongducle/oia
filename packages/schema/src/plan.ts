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
 * designer used to silently break every mock gate — teardown 2026-10-31). */
export const PLANNER_INSTRUCTIONS = {
  imagePrompts: (n: number) => `Produce exactly ${n} imagePrompts[] (one per page, coherent series).`,
  pageOutline: (n: number) => `Also return pageOutline[] — EXACTLY ${n} entries {title, summary}, one per page in order (Outline Gate).`,
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
  required: ["title", "imagePrompt", "imagePrompts", "outline", "pageOutline", "copy", "blocks"],
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
