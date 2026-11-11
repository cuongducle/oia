import { ProviderError } from "@oia/providers";
import {
  DECONSTRUCT_READ_PROMPT, DECONSTRUCT_INPAINT_PROMPT, DECONSTRUCT_JSON_SCHEMA,
  deconstructReadSchema, type DeconstructRead, type DeconstructText,
} from "@oia/schema";
import type { ProcCtx } from "../processors.js";
import type { TaskContext } from "../store.js";
import { fetchBytes } from "../asset-bytes.js";
import { readDeconstructPng } from "./source-image.js";
import { detectorLaneTexts } from "./text-reading.js";
import { prepareDeconstructRegions } from "./text-layout.js";
import { composeTextPlate, localTextPlate, repairRetainedRegions } from "./background-plate.js";
import { retainedTextRegions } from "./retained-ink.js";

/** B1 deconstruct (deconstruct-import.md): vision read (1 LLM turn) → inpaint
 * (1 image). The order is a G2 invariant: a malformed read fails BEFORE any
 * image is generated, a doomed job never burns the seller's quota.
 * D22 detector lane (owner decision 2026-11-11): when a local text detector
 * is available it owns the geometry; the vision model only classifies and
 * transcribes numbered artifacts. Absent detector = the shipped read lane. */
export function makeDeconstruct(ctx: ProcCtx) {
  return async (params: Record<string, unknown>, tctx: TaskContext) => {
    const fileUrl = String(params.fileUrl ?? "");
    if (!fileUrl) throw new Error("deconstruct requires fileUrl");
    const src = await ctx.store.read(fileUrl.replace(/^\/api\/files\//, "")).catch(() => null);
    if (!src) throw new Error("fileUrl is invalid or has not been uploaded");

    if (typeof ctx.llm.readImage !== "function" || !ctx.llm.capabilities.referenceImages) {
      throw new ProviderError("capability_unsupported", `provider ${ctx.llm.name} cannot read images`, { provider: ctx.llm.name });
    }
    const original = readDeconstructPng(src);
    tctx.signal?.throwIfAborted();
    const readOnce = async (prompt: string, png: Uint8Array, schema: object, jobIdSuffix: string) =>
      ctx.llm.readImage!(prompt, png, schema, {
        signal: tctx.signal,
        ...(tctx.jobId ? { jobId: `${jobIdSuffix}-${tctx.jobId}` } : {}),
      });

    let texts: DeconstructText[];
    let detectorNote: string | undefined;
    if (ctx.textDetector) {
      const located = await detectorLaneTexts(ctx.textDetector, src, original, tctx, ctx.llm.name, readOnce);
      if (!located.texts.length) {
        tctx.signal?.throwIfAborted();
        return { urls: [fileUrl], texts: [], note: located.note };
      }
      texts = located.texts;
      detectorNote = located.note;
    } else {
      const raw = await ctx.llm.readImage(DECONSTRUCT_READ_PROMPT, src, DECONSTRUCT_JSON_SCHEMA, {
        signal: tctx.signal,
        ...(tctx.jobId ? { jobId: `read-${tctx.jobId}` } : {}),
      });
      let read: DeconstructRead;
      try {
        read = deconstructReadSchema.parse(JSON.parse(raw));
      } catch {
        throw new ProviderError("plan_parse_failed", "vision read returned malformed JSON", { provider: ctx.llm.name, detail: String(raw).slice(0, 200) });
      }
      if (!read.texts.length) {
        tctx.signal?.throwIfAborted();
        return { urls: [fileUrl], texts: [], note: "No readable text was found. The original image is unchanged." };
      }
      texts = read.texts;
    }
    const { texts: measured, eraseRegions } = prepareDeconstructRegions(original, texts);
    await tctx.checkpoint?.({ urls: [], texts: measured, note: "Text recognition was preserved. Background cleanup has not completed; the original image is unchanged." });
    tctx.signal?.throwIfAborted();
    const local = localTextPlate(original, eraseRegions);
    if (!local && !ctx.image.capabilities.referenceImages) {
      throw new ProviderError("capability_unsupported", `provider ${ctx.image.name} does not accept reference images`, { provider: ctx.image.name });
    }
    let plate = local;
    let repairNote: string | undefined;
    if (!plate) {
      // P2: reference bytes live in the store, not a renderer URL.
      const platePath = await ctx.store.pathOf(fileUrl.replace(/^\/api\/files\//, ""));
      if (!platePath) throw new Error("fileUrl is invalid or has not been uploaded");
      const img = await ctx.image.generate({
        prompt: `${DECONSTRUCT_INPAINT_PROMPT}\nOCR data (fraction boxes, clockwise angle about top-left): ${JSON.stringify(eraseRegions.map(t => ({ text: t.text, box: t.box, angle: t.typography?.angle ?? 0 })))}`,
        width: original.width, height: original.height,
        referenceImages: [platePath], signal: tctx.signal,
      });
      const bytes = await fetchBytes(img.url, ctx.store);
      tctx.signal?.throwIfAborted();
      plate = composeTextPlate(original, readDeconstructPng(bytes), eraseRegions);
    }
    let retained = retainedTextRegions(original, readDeconstructPng(plate), measured);
    if (retained.length) {
      // reuse the paid generation: rebuild only the flagged regions from their
      // local smooth background, then re-check. No provider retry, no second image.
      const repaired = repairRetainedRegions(original, readDeconstructPng(plate), retained.map((i) => measured[i]));
      if (repaired) {
        const after = retainedTextRegions(original, readDeconstructPng(repaired), measured);
        if (!after.length) {
          repairNote = `The generated background missed ${retained.length} region${retained.length === 1 ? "" : "s"}; ${retained.length} were rebuilt locally from the smooth background.`;
          plate = repaired;
          retained = [];
        }
      }
      if (retained.length) {
        const detail = retained.slice(0, 5).map((i) => measured[i].text).join(" | ");
        throw new ProviderError("no_output", `Background cleanup left original text in ${retained.length} selected regions (${detail}${retained.length > 5 ? ", …" : ""}). The original image and recognized text were preserved; no automatic retry was made.`, { provider: ctx.image.name });
      }
    }
    tctx.signal?.throwIfAborted();
    const saved = await ctx.store.put(plate, "png");
    const note = [detectorNote, repairNote, local ? "The smooth background was restored locally; no image generation was used." : undefined].filter(Boolean).join(" ");
    return { urls: [saved.url], texts: measured, ...(note ? { note } : {}) };
  };
}
