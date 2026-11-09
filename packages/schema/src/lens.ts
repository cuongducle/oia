import { z } from "zod";
import { deconstructTextSchema } from "./deconstruct.js";

export const fontSourceSchema = z.object({
  url: z.string().startsWith("/api/files/"),
  licenseUrl: z.string().startsWith("/api/files/"),
  weight: z.number().int().min(100).max(900),
  style: z.enum(["normal", "italic"]),
  variable: z.boolean(),
}).strict();
export const lensSuggestionSchema = z.object({
  lineIndex: z.number().int().min(0).max(59),
  family: z.string().min(1).max(120).regex(/^[\p{L}\p{N} ._'\-]+$/u),
  score: z.number().min(0).max(1),
  source: fontSourceSchema,
}).strict();
export const recognizeFontsInputSchema = z.object({
  fileUrl: z.string().min(1),
  texts: z.array(deconstructTextSchema).min(1).max(60),
}).strict();
export type FontSource = z.infer<typeof fontSourceSchema>;
export type LensSuggestion = z.infer<typeof lensSuggestionSchema>;
