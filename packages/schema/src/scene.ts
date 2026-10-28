import { z } from "zod";

/**
 * Scene graph = Fabric.js serialized JSON (the interchange format).
 * Fixtures: packages/protocol/test/fixtures.
 */
export const fabricObjectSchema = z
  .object({
    type: z.string(),
    left: z.number().nullable().optional(),
    top: z.number().nullable().optional(),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    scaleX: z.number().nullable().optional(),
    scaleY: z.number().nullable().optional(),
    angle: z.number().nullable().optional(),
    opacity: z.number().nullable().optional(),
    visible: z.boolean().nullable().optional(),
    fill: z.unknown().nullable().optional(),
    src: z.string().nullable().optional(),
    text: z.string().nullable().optional(),
    fontFamily: z.string().nullable().optional(),
    fontSize: z.number().nullable().optional(),
    name: z.string().nullable().optional(),
    selectable: z.boolean().nullable().optional(),
  })
  .passthrough();

export const sceneCanvasSchema = z
  .object({
    version: z.string(),
    objects: z.array(fabricObjectSchema).default([]),
    clipPath: z.unknown().nullable().optional(),
    background: z.unknown().nullable().optional(),
    backgroundImage: z.unknown().nullable().optional(),
  })
  .passthrough();

export const pageSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  width: z.number(),
  height: z.number(),
  canvas: sceneCanvasSchema,
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().default("Untitled project"),
  pages: z.array(pageSchema).min(1),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export type FabricObject = z.infer<typeof fabricObjectSchema>;
export type SceneCanvas = z.infer<typeof sceneCanvasSchema>;
export type Page = z.infer<typeof pageSchema>;
export type Project = z.infer<typeof projectSchema>;
