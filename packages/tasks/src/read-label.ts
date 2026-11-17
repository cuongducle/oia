import { LABEL_READ_JSON_SCHEMA, LABEL_READ_PROMPT, labelReadSchema, type LabelRead } from "@oia/schema";
import { ProviderError } from "@oia/providers";
import type { TaskContext } from "./store.js";

/** ProcCtx shape shared with the other processors (deconstruct/processor.ts). */
interface ProcCtx {
  store: { read(key: string): Promise<Uint8Array> };
  llm: {
    name: string;
    capabilities: { referenceImages: boolean };
    readImage?(prompt: string, image: Uint8Array, schema: object, opts?: { signal?: AbortSignal; jobId?: string }): Promise<string>;
  };
}

/**
 * W1.2 door 2: one metered vision read proposes profile content from a label
 * photo. Validation happens BEFORE the paid read (0 quota on failure), the
 * result is SUGGESTIONS for the editor (owner 16/11: no publication gate).
 * The caller (editor) owns mapping: name → draft, brand → tag proposal,
 * facts → ProductFact[] with source kind "file" + the photo's name.
 */
export function makeReadLabel(ctx: ProcCtx) {
  return async (params: Record<string, unknown>, tctx: TaskContext): Promise<{ urls: string[]; labelRead: LabelRead }> => {
    const fileUrl = String(params.fileUrl ?? "");
    if (!fileUrl.startsWith("/api/files/")) throw new Error("read-label requires a uploaded photo (fileUrl)");
    const key = fileUrl.slice("/api/files/".length);
    const bytes = await ctx.store.read(key).catch(() => null);
    if (!bytes) throw new Error("The label photo is invalid or has not been uploaded."); // 0 quota: no readImage call yet

    if (typeof ctx.llm.readImage !== "function" || !ctx.llm.capabilities.referenceImages) {
      throw new ProviderError("capability_unsupported", `provider ${ctx.llm.name} cannot read images`, { provider: ctx.llm.name });
    }
    tctx.signal?.throwIfAborted();
    const raw = await ctx.llm.readImage(LABEL_READ_PROMPT, bytes, LABEL_READ_JSON_SCHEMA, {
      signal: tctx.signal,
      ...(tctx.jobId ? { jobId: `label-${tctx.jobId}` } : {}),
    });
    let read: LabelRead;
    try {
      read = labelReadSchema.parse(JSON.parse(raw));
    } catch {
      throw new ProviderError("plan_parse_failed", "label read returned malformed JSON", { provider: ctx.llm.name, detail: String(raw).slice(0, 200) });
    }
    return { urls: [fileUrl], labelRead: read };
  };
}
