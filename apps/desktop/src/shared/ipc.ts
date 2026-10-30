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
});
export const projectsGetSchema = z.object({ id: z.string().min(1) });
