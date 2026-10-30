import { z } from "zod";
import { chatRequestSchema } from "@oia/services";
import { brandKitSchema, taskTypeSchema } from "@oia/schema";

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
import { IMAGE_EXTS } from "@oia/schema"; // single home for the upload allowlist (uploads.ts)

export { IMAGE_EXTS };
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

/** ---- reorg step 4c: quick tools task lane ----------------------------------
 * Mirrors the web /api/tasks routes: MAIN admits a known task TYPE only; the strict
 * per-type params validation lives in TaskStore.submit (submitTaskSchemas — the ONE
 * home, same contract the loopback and skills speak). */
export const taskSubmitSchema = z.object({
  type: taskTypeSchema,
  params: z.record(z.unknown()).default({}),
});
export const taskGetSchema = z.object({ taskId: z.string().min(1) });
export const taskCancelSchema = z.object({ taskId: z.string().min(1) });

/** ---- reorg step 4d: brand kits + For Agents --------------------------------- */
export const brandKitUpsertSchema = brandKitSchema
  .omit({ id: true, createdAt: true })
  .extend({ id: z.string().optional(), createdAt: z.number().optional() });
export const brandKitRemoveSchema = z.object({ id: z.string().min(1) });
export const apiKeyCreateSchema = z.object({
  name: z.string().min(1).max(60),
  ttlDays: z.number().int().positive().max(3650).nullable(),
});
export const apiKeyRevokeSchema = z.object({ id: z.string().min(1) });
/** Copy-to-clipboard rides MAIN (the deny-all permission handler blocks the
 *  renderer's navigator.clipboard) — cap it so the channel stays boring. */
export const clipboardWriteSchema = z.object({ text: z.string().max(10_000) });

/** TP-D3 — provider mode is an explicit user choice persisted across launches. */
export const runtimeSetModeSchema = z.object({
  mode: z.enum(["auto", "mock", "codex"]),
});
export type RuntimeModeChoice = z.infer<typeof runtimeSetModeSchema>["mode"];
