import { z } from "zod";
import { sceneCanvasSchema } from "./scene.js";
import { errorClassSchema } from "./plan.js";

/** SSE event in the chat/send stream. */
export const taskMetaSchema = z.object({
  id: z.string(),
  content: z.string(),
  styleId: z.string().optional(),
  status: z.string().optional(),
  type: z.enum(["node", "tool", "result"]),
});

export const canvasMsgMetaSchema = z
  .object({
    id: z.string(),
    type: z.literal("canvas"),
    thumbnail: z.string().optional(),
    canvas: sceneCanvasSchema,
  })
  .passthrough();

export const exportMetaSchema = z.object({
  projectName: z.string().optional(),
  createTime: z.number().optional(),
  defaultExportType: z.string().optional(),
});

export const confirmRequestSchema = z.object({
  jobId: z.string(),
  /** Names exactly what a destructive action would lose (TP.10). */
  losses: z.array(z.string()),
});

export const renderDataSchema = z.object({
  msgMeta: z.array(canvasMsgMetaSchema).default([]),
  fileMeta: z.array(z.unknown()).default([]),
  taskMeta: z.array(taskMetaSchema).default([]),
  exportMeta: exportMetaSchema.nullable().default(null),
  /** TP.10 — present only when an agent action needs explicit user confirmation. */
  confirmRequest: confirmRequestSchema.nullable().default(null),
});

/**
 * TP.4/TP.5 — `status` widens to "cancelled" for the terminal cancel event; numeric
 * statuses keep their existing meaning. Failure events carry `errorClass`,
 * `attemptNumber` (always 1 for metered jobs) and `provider`; every event carries `jobId`.
 */
export const chatEventSchema = z.object({
  id: z.number().nullable().optional(),
  msgId: z.number(),
  content: z.string(),
  status: z.union([z.number(), z.literal("cancelled")]).default(0),
  error: z.string().nullable(),
  renderData: renderDataSchema,
  brandId: z.number().default(0),
  jobId: z.string().optional(),
  errorClass: errorClassSchema.optional(),
  attemptNumber: z.number().optional(),
  provider: z.string().optional(),
  /** Cancel outcome flag (job outcome, not an error class): artwork was already produced. */
  afterCompletion: z.boolean().optional(),
});

export type ChatEvent = z.infer<typeof chatEventSchema>;
export type TaskMeta = z.infer<typeof taskMetaSchema>;
export type CanvasMsgMeta = z.infer<typeof canvasMsgMetaSchema>;
export type RenderData = z.infer<typeof renderDataSchema>;
