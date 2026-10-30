import { z } from "zod";
import { chatRequestSchema } from "@oia/services";

/**
 * MAIN-ONLY schemas (zod + @oia/services are not preload-loadable under sandbox).
 * The chat REQUEST schema is the single source from @oia/services — the web adapter
 * and the desktop main parse raw input through the same object.
 */
export { chatRequestSchema };
export type ChatRequestIpc = Parameters<import("./bridge.js").OiaBridge["chatRun"]>[0];

export const chatCancelSchema = z.object({ jobId: z.string().min(1) });
export const projectsCreateSchema = z.object({
  name: z.string().optional(),
  scene: z.unknown().optional(),
  pages: z.unknown().optional(), // strictly validated by ProjectStore.create (projectSchema)
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export const projectsGetSchema = z.object({ id: z.string().min(1) });
export const projectsRemoveSchema = z.object({ id: z.string().min(1) });
/** Autosave: pages pass through loosely here; the store's projectSchema is the strict gate. */
export const projectsSaveSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(120).optional(),
  pages: z.unknown().optional(),
});
export const templatesCreateSchema = z.object({
  name: z.string().min(1).max(80),
  authorName: z.string().max(60).optional(),
  scene: z.unknown(),
});
export const sessionsGetSchema = z.object({ id: z.number().int().positive() });

/** Editor asset uploads — same image whitelist as the web upload route, bytes via structured clone. */
export const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB — generous for product photos, small enough to guard IPC
export const filesUploadSchema = z
  .object({
    name: z.string().min(1).max(255),
    bytes: z.instanceof(Uint8Array),
  })
  .superRefine((v, ctx) => {
    const ext = v.name.split(".").pop()?.toLowerCase() ?? "";
    if (!IMAGE_EXTS.has(ext)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "unsupported image type" });
    if (v.bytes.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "empty file" });
    if (v.bytes.length > MAX_UPLOAD_BYTES) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "file too large" });
  });

/** Renderer export → native save dialog. Extension is derived from the plan, not trusted from input. */
export const exportSaveSchema = z.object({
  fileName: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\\/:*?"<>|]+$/, "invalid file name"),
  bytes: z.instanceof(Uint8Array),
});
