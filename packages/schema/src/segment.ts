import { z } from "zod";

/** Segment-image contract (D21): one detected instance of the text prompt.
 *  box is [x1, y1, x2, y2] as fractions of the source image (0..1, xyxy). */
export const segmentObjectSchema = z.object({
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  score: z.number().min(0).max(1),
  url: z.string(),
});
export type SegmentObject = z.infer<typeof segmentObjectSchema>;

export const SEGMENT_PROMPT_MAX = 64;
