import { z } from "zod";

/**
 * B1 — deconstruct import (deconstruct-import.md). The vision-read contract:
 * one image in, {text, box}[] out. Boxes are FRACTIONS of the image dimensions
 * (0..1) so they map onto any artboard size, whatever size the inpaint returns.
 *
 * Prompt constants are SHARED, not prose owned by a caller (PLANNER_INSTRUCTIONS
 * pattern): the mock vision derives its matcher from the marker below, so
 * rewording cannot silently break a mock gate.
 */

export const deconstructBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  })
  .strict();

export const deconstructTextSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    box: deconstructBoxSchema,
  })
  .strict();

export const deconstructReadSchema = z
  .object({
    texts: z.array(deconstructTextSchema).max(60),
  })
  .strict();

export type DeconstructText = z.infer<typeof deconstructTextSchema>;
export type DeconstructRead = z.infer<typeof deconstructReadSchema>;

/** JSON Schema handed to codex `--output-schema` for the read turn. */
export const DECONSTRUCT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["texts"],
  properties: {
    texts: {
      type: "array",
      maxItems: 60,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "box"],
        properties: {
          text: { type: "string", minLength: 1, maxLength: 500 },
          box: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y", "w", "h"],
            properties: {
              x: { type: "number", minimum: 0, maximum: 1 },
              y: { type: "number", minimum: 0, maximum: 1 },
              w: { type: "number", minimum: 0, maximum: 1 },
              h: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
      },
    },
  },
} as const;

/** Stable marker at the end of the read prompt — the mock matcher keys on it. */
export const DECONSTRUCT_READ_MARKER = "deconstruct.read.v1";

export const DECONSTRUCT_READ_PROMPT = `Read every piece of text visible in this image — all languages, including Vietnamese. For each visual LINE of text return: the exact text content, and its bounding box as fractions of the image dimensions (x, y = top-left corner, w, h = size, each in 0..1). Merge words of the same visual line into one entry. Skip watermarks smaller than 2% of image height. Return JSON only — ${DECONSTRUCT_READ_MARKER}.`;

export const DECONSTRUCT_INPAINT_PROMPT = `Edit this image: remove ALL text and lettering everywhere in it. Keep everything else exactly as it is — colors, products, background, lighting, composition. Fill the areas where text was removed with the surrounding content so nothing looks erased. Do not add any new elements or text. deconstruct.inpaint.v1`;
