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

/**
 * DA-11 — anti-"AI slop" image-craft rules, injected into every planner system
 * prompt. Sources cross-checked 2026-11-05 over three passes: OSideMedia/
 * higgsfield-ai-prompt-skill (anti-slop vocabulary, negative-constraints,
 * style § CGI Material Contract + One Style Anchor, gpt-image-2 § realism
 * framing, image-shots framing, vocab § 60/30/10); EN practitioners (OpenAI
 * Cookbook + image-prompting guide, r/ChatGPT GPT-Image guide, community
 * threads, r/midjourney); CN practitioners (@xpg0970 塑料感 counter-methods
 * — causal lighting + air/lens-flaw touch, xiaohu.ai poster skeleton,
 * Zhihu 去除AI味); ordering verified via TikTok Effect House docs (earlier
 * words carry more influence). Palette rule follows arXiv 2603.13547 (hex
 * specs fragment — describe colors by name). A shared constant so tests and
 * future gates can key on it verbatim (C1 pattern).
 */
export const IMAGE_CRAFT_RULES =
  "Image-craft rules for every imagePrompt (kill the generic 'AI slop' look):\n" +
  "- Name the deliverable FIRST — 'ad poster', 'product photo', 'social post', 'menu design': the model picks composition defaults and polish level from that word.\n" +
  "- Write the prompt like a creative brief, not a tech spec: who the audience is, what the brand feels like, what the campaign vibe is — then the exact copy — and let the model make taste-driven decisions inside those boundaries.\n" +
  "- Front-load the prompt: deliverable + subject + the primary visual in the first sentence, constraints at the end — words placed earlier carry more influence (vendor-verified), so the load-bearing content rides up front.\n" +
  "- Ban empty quality words — beautiful, stunning, amazing, 'high quality', '4K', cinematic alone. Replace each with the concrete visual it claims to name: a lighting setup, an optics spec, a designer or film referent, an exact palette.\n" +
  "- ALWAYS name the lighting — source + direction + quality ('single warm side-light from camera left, soft shadows' / 'overcast daylight, even and shadowless' / 'golden-hour backlight, long shadows'). A prompt with no lighting line renders flat and generic.\n" +
  "- Light must DO something to a named object — 'harsh sunlight casting the window frame's shadow across the peeling wall', 'neon reflecting on the oily puddles' — bare nouns placed side by side (sunlight, wall) render as disconnected stickers.\n" +
  "- Name surfaces and materials the camera touches (product on raw concrete, matte paper stock, brushed metal, linen weave) — unspecified surfaces render glossy and cheap.\n" +
  "- People: natural skin texture with subtle imperfections, stray hair strands, real fabric weave — never smooth plastic skin.\n" +
  "- Never write 'photorealistic' or 'hyperrealistic' when people are in frame — GPT-family image models turn faces plasticky on realism flags; frame realism as film photography instead ('35mm film photograph', 'editorial portrait', 'direct flash photo', film grain).\n" +
  "- Product/CGI surfaces carry 2-4 material properties (base: ceramic/metal/fabric; finish: matte/satin/glossy; wear: hairline scratches, dust, patina; edge: beveled/soft) — unspecified surfaces default to plastic sheen.\n" +
  "- Style anchor discipline: ONE primary style anchor plus at most two supporting tokens ('anamorphic, subtle grain, muted palette') — stacking five style adjectives dilutes attention and renders generic.\n" +
  "- Palette: one dominant color plus one secondary and one accent (60/30/10), never five competing hues.\n" +
  "- Artwork showing a subject in a scene leads with framing — shot size (macro / close-up / medium / wide) + camera angle (eye-level / low / overhead / flat-lay); an unframed subject defaults to a boring centered medium shot.\n" +
  "- Depth of field names the plane that stays sharp ('subject in sharp focus, background falling into soft bokeh' or 'sharp focus throughout, deep depth of field') — never a bare 'blurry background'.\n" +
  "- Imperfection belongs to the subject, never the rendering: a crooked poster on the wall, a chipped mug, light reaching only one cheek. No trailing 'film grain', 'soft focus', 'dreamy' — they soften the whole frame.\n" +
  "- Break the vacuum, lightly: when the image should read as photographed, add ONE airborne medium (dust motes, steam, haze catching the light) and at most ONE small lens flaw (subtle vignette, faint halation) — a light touch; stacking them reads as forced.\n" +
  "- Phrase constraints positively ('flat-lay overhead, locked-off frame' / 'bright evenly lit overcast daylight') — image channels have no negative prompt, negations do nothing.";

/**
 * Art-direction style presets (phrases adapted from SurgePix agent-skills, MIT).
 * A preset maps the label a seller actually says to the concrete phrases the
 * image model needs. The mapping is deterministic CODE riding the planner
 * system prompt — never the planner LLM's guess ("bold" alone buys nothing).
 */
export const STYLE_PRESETS = [
  { id: "modern", label: "Modern", phrases: "grid-based, generous whitespace, strong focal hierarchy, modular alignment", useCases: "business events, product launches" },
  { id: "vintage", label: "Vintage", phrases: "collage-style, organic layered graphics, retro print alignment", useCases: "creative events, themed campaigns" },
  { id: "minimalist", label: "Minimalist", phrases: "Swiss grid, maximum whitespace, minimal elements, typography-centered", useCases: "art exhibitions, design events" },
  { id: "bold", label: "Bold", phrases: "oversized typography, dynamic text layering, high impact", useCases: "e-commerce promos, flash sales, music festivals" },
  { id: "creative", label: "Creative", phrases: "freeform composition, asymmetric editorial balance, floating objects, atmospheric negative space", useCases: "concept launches, art exhibitions" },
  { id: "3d", label: "3D", phrases: "floating glossy 3D objects, layered digital interface, Y2K typography", useCases: "tech product launches, gaming" },
  { id: "hand-drawn", label: "Hand-drawn", phrases: "illustration-led, organic strokes, warm textures, playful hand-lettered typography", useCases: "product promotions, community events" },
  { id: "business-promo", label: "Business promo", phrases: "product-centered composition, large promotional headline, layered badges, clear CTA", useCases: "e-commerce marketing, limited-time campaigns" },
  /** SC-2 (social-card-style-presets.md) — the two Guizang-derived style systems,
   * same plumbing as the other presets; the critic turns these into hard checks. */
  { id: "editorial", label: "Editorial", phrases: "magazine-feature feel, serif display headline, quiet italic subhead, warm paper tones with visible grain or soft ink wash, generous margins, hairline rules", useCases: "cafés, menus, boutiques, journals, gift sets" },
  { id: "swiss", label: "Swiss", phrases: "strict left-aligned grid, extreme size contrast with very large LIGHT-weight type, hairline rules, exactly one saturated accent color used once, flat surfaces, no gradients, no shadows, no rounded corners", useCases: "tech launches, product specs, data statements" },
] as const;
export type StylePresetId = (typeof STYLE_PRESETS)[number]["id"];
export const stylePresetIdSchema = z.enum(
  STYLE_PRESETS.map((p) => p.id) as [StylePresetId, ...StylePresetId[]],
);

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
      description: "Findings from web research, one line per finding, each ending with its source in parentheses. Null when research was not enabled or found nothing worth citing.",
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

/** DA-3 — one critic read returns this shape (scores 0..10 per criterion).
 * `textHandling` is the mode's #1 text-related criterion under ONE name:
 * poster = rendered-text fidelity (spelling/language); clean-plate = copy-zone
 * headroom. The critic prompt says which meaning applies (teardown #12).
 * v3.2 (2026-11-05, research docs/research/image-prompt-craft.md): `realism`
 * judges the anti-slop axes (lighting direction, texture vs plastic, designed
 * vs stock-photo look) that blind A/B rounds proved a vision judge can score;
 * `scope` routes the refine path — localized defects get a surgical edit of
 * the current image (astorie.ai evidence), global ones a full re-plan. */
export const criticScoresSchema = z.object({
  textHandling: z.number().min(0).max(10),
  brand: z.number().min(0).max(10),
  fidelity: z.number().min(0).max(10),
  composition: z.number().min(0).max(10),
  realism: z.number().min(0).max(10),
});
export type CriticScores = z.infer<typeof criticScoresSchema>;

export const criticScopeSchema = z.enum(["localized", "global"]);
export type CriticScope = z.infer<typeof criticScopeSchema>;

export const evalReadSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  scores: criticScoresSchema,
  scope: criticScopeSchema,
  issues: z.array(z.string().max(500)).max(20),
  fixHints: z.array(z.string().max(500)).max(20),
});
export type EvalRead = z.infer<typeof evalReadSchema>;

/** JSON Schema pinned via --output-schema on the critic read turn. */
export const EVAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "scores", "scope", "issues", "fixHints"],
  properties: {
    verdict: { type: "string", enum: ["pass", "fail"], description: "pass when the image is good enough to ship; fail when a fixable defect was found." },
    scores: {
      type: "object",
      additionalProperties: false,
      required: ["textHandling", "brand", "fidelity", "composition", "realism"],
      properties: {
        textHandling: { type: "number", minimum: 0, maximum: 10, description: "Poster: rendered-text fidelity (spelling, language). Clean-plate: copy-zone headroom." },
        brand: { type: "number", minimum: 0, maximum: 10, description: "Brand guidance adherence." },
        fidelity: { type: "number", minimum: 0, maximum: 10, description: "Match to the request and reference image." },
        composition: { type: "number", minimum: 0, maximum: 10, description: "Layout, balance, crop." },
        realism: { type: "number", minimum: 0, maximum: 10, description: "Professional production feel vs generic AI look: light direction, real texture vs plastic, designed commercial asset vs stock photo with text stamped on." },
      },
    },
    scope: { type: "string", enum: ["localized", "global"], description: "localized = the image is right overall, only the listed details are wrong (surgical edit target); global = the problems come from layout, lighting or overall treatment (needs a re-plan)." },
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
  /** B7: which critic rubric judged this artifact — the prompt has shipped in
   * multiple versions; a record must be able to say WHO failed the work. */
  criticVersion: z.string().max(40).optional(),
  /** DA-3.1 (2026-11-05): how the LAST refine round fixed the image —
   * "edit" (surgical edit of the current artwork), "reroll" (same prompt,
   * variance harvesting) or "regen" (planner-revised prompt). Records must
   * not lie about which medicine was administered. */
  refinePath: z.enum(["edit", "reroll", "regen"]).optional(),
});
export type SelfImproveResult = z.infer<typeof selfImproveResultSchema>;
