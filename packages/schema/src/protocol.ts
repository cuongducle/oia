import { z } from "zod";
import { sceneCanvasSchema } from "./scene.js";

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

export const renderDataSchema = z.object({
  msgMeta: z.array(canvasMsgMetaSchema).default([]),
  fileMeta: z.array(z.unknown()).default([]),
  taskMeta: z.array(taskMetaSchema).default([]),
  exportMeta: exportMetaSchema.nullable().default(null),
});

export const chatEventSchema = z.object({
  id: z.number().nullable().optional(),
  msgId: z.number(),
  content: z.string(),
  status: z.number(),
  error: z.string().nullable(),
  renderData: renderDataSchema,
  brandId: z.number().default(0),
});

export type ChatEvent = z.infer<typeof chatEventSchema>;
export type TaskMeta = z.infer<typeof taskMetaSchema>;
export type CanvasMsgMeta = z.infer<typeof canvasMsgMetaSchema>;
export type RenderData = z.infer<typeof renderDataSchema>;
