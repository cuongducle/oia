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
  createdAt: z.number(),
});
export type Template = z.infer<typeof templateSchema>;

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
});
