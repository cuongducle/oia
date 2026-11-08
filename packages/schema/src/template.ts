import { z } from "zod";
import { sceneCanvasSchema } from "./scene.js";

/**
 * BR-TPL — Community templates ("Sharing your design as template";
 * gallery: 1/N thumbnail, name, author, tip credits).
 */
export const templateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  authorName: z.string().max(80).default("Anonymous"),
  scene: sceneCanvasSchema,
  featured: z.boolean().default(false),
  tipCredits: z.number().int().min(0).default(0),
  /** Optional grouping for template galleries ("livestream" — live-overlay-presets.md LV-7).
   * Deliberately LOOSE here (G6, goldfish): legacy free-text categories must keep parsing
   * on read (D14); the CLOSED taxonomy (templateCategorySchema) is enforced at write edges
   * (TemplateStore.publish) and sanitized on import lanes (addImported). */
  category: z.string().trim().min(1).max(40).optional(),
  /** SC-2 — style family (social-card-style-presets.md). Same loose-on-read /
   * closed-at-edges pattern as category (G6, D14). */
  style: z.string().trim().min(1).max(40).optional(),
  /** SC-5 — curated pack membership (niche bundles). Loose read / edge-enforced. */
  pack: z.string().trim().min(1).max(60).optional(),
  createdAt: z.number(),
});
export type Template = z.infer<typeof templateSchema>;

/**
 * SC-2 — the template style families. Two systems, each with font pairing and
 * the laws the critic enforces (docs/designs/social-card-style-presets.md).
 */
export const TEMPLATE_STYLES = [
  { id: "editorial", label: "Editorial", fontPair: "Georgia + Be Vietnam Pro", laws: "serif display headline, italic deck, textured paper background (never flat), hairline rules, restrained warm palette" },
  { id: "swiss", label: "Swiss", fontPair: "Be Vietnam Pro (display weight 200)", laws: "one saturated accent used exactly once, very large light-weight display type, hairline dividers, flat surfaces — no gradients, no shadows, no rounded corners" },
] as const;
export type TemplateStyleId = (typeof TEMPLATE_STYLES)[number]["id"];
export const templateStyleSchema = z.enum(
  TEMPLATE_STYLES.map((s) => s.id) as [TemplateStyleId, ...TemplateStyleId[]],
);

/**
 * SC-5 — preset packs: curated bundles by seller niche (a pack bundles templates
 * + the prompts that grew them; see social-card-style-presets.md). Same
 * closed-at-edges pattern as category/style.
 */
export const TEMPLATE_PACKS = [
  { id: "cafe-restaurant", label: "Café & restaurant" },
  { id: "product-launch", label: "Product launch" },
  { id: "tet-sale", label: "Tết sale" },
] as const;
export type TemplatePackId = (typeof TEMPLATE_PACKS)[number]["id"];
export const templatePackSchema = z.enum(
  TEMPLATE_PACKS.map((p) => p.id) as [TemplatePackId, ...TemplatePackId[]],
);

/**
 * TPL-T1 — the template taxonomy, single home. Ids match the Home composer's
 * category chips (flash sale / new product / livestream / menu / social post /
 * deck) so a chip can later route to matching templates; labels are UI EN (D8).
 */
export const TEMPLATE_CATEGORIES = [
  { id: "flash-sale", label: "Flash sale" },
  { id: "new-product", label: "New product" },
  { id: "livestream", label: "Livestream" },
  { id: "menu", label: "Menu" },
  { id: "social-post", label: "Social post" },
  { id: "deck", label: "Presentation" },
  { id: "poster", label: "Poster" },
  { id: "overlay", label: "Overlay" },
] as const;
export type TemplateCategoryId = (typeof TEMPLATE_CATEGORIES)[number]["id"];
export const templateCategorySchema = z.enum(
  TEMPLATE_CATEGORIES.map((c) => c.id) as [TemplateCategoryId, ...TemplateCategoryId[]],
);

export const templateListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  featured: z.coerce.boolean().optional(),
  category: templateCategorySchema.optional(),
  style: templateStyleSchema.optional(),
  pack: templatePackSchema.optional(),
});
