import { ProviderError } from "@oia/providers";
import { recognizeFontsInputSchema, type DeconstructText, type LensSuggestion } from "@oia/schema";
import type { ProcCtx } from "./processors.js";
import type { TaskContext } from "./store.js";

export interface RecognizedFont {
  lineIndex: number; family: string; score: number; weight: number; style: "normal" | "italic";
  variable: boolean; url: string; licenseUrl: string;
}
export interface FontRecognizer {
  recognize(png: Uint8Array, texts: DeconstructText[], signal: AbortSignal): Promise<RecognizedFont[]>;
}

async function boundedDownload(url: string, host: string, cap: number, signal: AbortSignal): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.host !== host) throw new Error("Unapproved Lens asset host");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
  if (!response.ok || !response.body) throw new Error(`Font download failed (${response.status})`);
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > cap) throw new Error("Lens asset exceeds the download limit");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

/** D23: local classification, then cache open font bytes AND their license in the asset store. */
export function makeRecognizeFonts(ctx: ProcCtx) {
  return async (params: Record<string, unknown>, tctx: TaskContext) => {
    const { fileUrl, texts } = recognizeFontsInputSchema.parse({ fileUrl: params.fileUrl, texts: params.texts });
    if (!ctx.fontRecognizer) throw new ProviderError("capability_unsupported", "Lens is not installed in this build", { provider: "local" });
    const bytes = await ctx.store.read(fileUrl.replace(/^\/api\/files\//, "")).catch(() => null);
    if (!bytes) throw new Error("font source image has not been uploaded");
    const found = await ctx.fontRecognizer.recognize(bytes, texts, tctx.signal);
    const fontSuggestions: LensSuggestion[] = [];
    const cached = new Map<string, LensSuggestion["source"]>();
    let skipped = 0;
    for (const f of found) {
      tctx.signal.throwIfAborted();
      try {
        let source = cached.get(f.url);
        if (!source) {
          const license = await boundedDownload(f.licenseUrl, "raw.githubusercontent.com", 100000, tctx.signal);
          const font = await boundedDownload(f.url, "static.mixfont.com", 5_000_000, tctx.signal);
          const magic = Buffer.from(font.subarray(0, 4)).toString("hex");
          if (!["00010000", "4f54544f", "774f4646", "774f4632"].includes(magic)) throw new Error("Invalid font data");
          const savedLicense = await ctx.store.put(license, "txt");
          const savedFont = await ctx.store.put(font, "ttf");
          source = { url: savedFont.url, licenseUrl: savedLicense.url, weight: f.weight, style: f.style, variable: f.variable };
          cached.set(f.url, source);
        }
        fontSuggestions.push({ lineIndex: f.lineIndex, family: f.family, score: f.score, source });
      } catch (error) {
        tctx.signal.throwIfAborted();
        skipped++;
      }
    }
    return { urls: [], fontSuggestions, note: skipped ? `${skipped} font assets were unavailable; available candidates were kept.` : "Lens ran locally; no provider quota was used." };
  };
}
