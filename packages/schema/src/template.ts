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
  /** Optional grouping for template galleries ("livestream" — live-overlay-presets.md LV-7). Additive, D14. */
  category: z.string().trim().min(1).max(40).optional(),
  createdAt: z.number(),
});
export type Template = z.infer<typeof templateSchema>;

export const templateListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  featured: z.coerce.boolean().optional(),
});
