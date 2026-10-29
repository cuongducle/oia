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
    /** TP.10 provenance — objects without `origin` (legacy scenes) default to "user". */
    origin: z.enum(["user", "agent", "generated"]).nullable().optional(),
    /** Fabric crop fields (zone-anchored cover-crop, TP.8 size policy). */
    cropX: z.number().nullable().optional(),
    cropY: z.number().nullable().optional(),
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

/**
 * TP.7 — the no-base64 rule is enforced ON SAVE, not on load: legacy projects and
 * sessions containing data URLs still open (read-tolerant); a migrate-on-save pass
 * extracts embedded bytes into the asset store and rewrites references.
 * Asset-reference syntax: scene `src`/`thumbnail` hold `/api/files/<key>` exactly
 * as `LocalFileStore.put()` returns it — same-origin, browser-loadable.
 */
const DATA_URL_RE = /^data:/i;
const ASSET_REF_RE = /^\/api\/files\//;

export function isAssetReference(src: string): boolean {
  return ASSET_REF_RE.test(src);
}

/** Returns the paths of save-blocking base64 violations (empty list = saveable). */
export function validateSceneForSave(scene: SceneCanvas, where = "canvas"): string[] {
  const violations: string[] = [];
  scene.objects?.forEach((o, i) => {
    if (typeof o.src === "string" && DATA_URL_RE.test(o.src)) violations.push(`${where}.objects[${i}].src`);
  });
  return violations;
}

export function validateProjectForSave(project: Project): string[] {
  const violations: string[] = [];
  for (const [pi, page] of project.pages.entries()) {
    violations.push(...validateSceneForSave(page.canvas, `pages[${pi}].canvas`));
  }
  return violations;
}
