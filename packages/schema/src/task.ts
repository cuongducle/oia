import { z } from "zod";

export const taskTypeSchema = z.enum([
  "remove-background",
  "image-edit",
  "image-translate",
  "ppt-translate",
  "generate-presentation",
  "generate-poster",
  "generate-xhs-images",
  "generate-illustrations",
  "generate-logo",
  "generate-storyboard",
  "generate-photo-poetic-editorial",
  "generate-restaged-cinematic",
]);
export type TaskType = z.infer<typeof taskTypeSchema>;

/** CommonResult envelope. */
export const commonResultSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ code: z.number(), data: data, msg: z.string() });

export const submitTaskBase = {
  sessionId: z.number().optional(),
  noWait: z.boolean().default(false),
  source: z.enum(["skill", "web", "agent"]).default("web"),
};

export const submitTaskSchemas = {
  "generate-presentation": z
    .object({
      ...submitTaskBase,
      prompt: z.string().optional(),
      outlines: z.array(z.string()).optional(),
      n: z.number().int().min(5).max(30).optional(),
      aspectRatio: z.string().optional(),
      style: z.string().optional(),
      language: z.enum(["zh", "en", "ja", "vi"]).optional(),
    })
    .strict(),
  "generate-poster": z
    .object({
      ...submitTaskBase,
      prompt: z.string().optional(),
      description: z.string().optional(),
      style: z.string().optional(),
      size: z.string().optional(),
      referenceImages: z.array(z.string()).optional(),
    })
    .strict(),
  "image-edit": z
    .object({
      ...submitTaskBase,
      reference: z.array(z.string()),
      prompt: z.string(),
      size: z.tuple([z.number(), z.number()]).optional(),
    })
    .strict(),
  "image-translate": z
    .object({ ...submitTaskBase, imageUrls: z.array(z.string()), language: z.string() })
    .strict(),
  "remove-background": z
    .object({ ...submitTaskBase, fileUrl: z.string() })
    .strict(),
} as const;

export const taskStatusSchema = z.object({
  taskId: z.string(),
  sessionId: z.number(),
  progress: z.enum(["processing", "succeeded", "failed"]),
  taskResult: z.object({ download: z.string().optional() }).nullable(),
  taskNote: z.string().nullable(),
  msg: z.string().default(""),
});
export type TaskStatus = z.infer<typeof taskStatusSchema>;
