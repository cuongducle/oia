import { z } from "zod";

/**
 * TP-D1 / Q7 — the typed, runtime-validated IPC contract between the shells.
 * Channels are explicit (no generic invoke passthrough); every payload is zod-validated
 * on the main side before it touches the service layer.
 */
export const IPC = {
  chatRun: "chat:run",
  chatEvent: "chat:event", // main → renderer streaming (ChatEvent frames)
  chatCancel: "chat:cancel",
  providerStatus: "provider:status",
  projectsCreate: "projects:create",
  projectsGet: "projects:get",
} as const;

/** ChatRequest subset that crosses the bridge (mirrors @oia/services ChatRequest). */
export const chatRequestSchema = z.object({
  prompt: z.string().min(1),
  width: z.number().optional(),
  height: z.number().optional(),
  sessionId: z.number().optional(),
  brandKitId: z.string().optional(),
  referenceImages: z.array(z.string()).optional(),
  pages: z.number().optional(),
  outlineMode: z.boolean().optional(),
  skill: z.string().optional(),
  mode: z.enum(["clean-plate"]).optional(),
  retryOf: z.string().optional(),
});
export type ChatRequestIpc = z.infer<typeof chatRequestSchema>;

export const chatCancelSchema = z.object({ jobId: z.string().min(1) });
export const projectsCreateSchema = z.object({
  name: z.string().optional(),
  scene: z.unknown().optional(),
});
export const projectsGetSchema = z.object({ id: z.string().min(1) });
