import { FONT_MATCH_JSON_SCHEMA, FONT_MATCH_PROMPT, fontMatchesSchema, fontReferenceInputSchema } from "@oia/schema";
import { ProviderError } from "@oia/providers";
import type { ProcCtx } from "./processors.js";
import type { TaskContext } from "./store.js";
import { readDeconstructPng } from "./deconstruct/source-image.js";

/** D23: one metered visual comparison; the desktop owns font rasterization. */
export function makeMatchFonts(ctx: ProcCtx) {
  return async (params: Record<string, unknown>, tctx: TaskContext) => {
    const { boardUrl, rows } = fontReferenceInputSchema.parse({ boardUrl: params.boardUrl, rows: params.rows });
    if (!ctx.llm.readImage || !ctx.llm.capabilities.referenceImages) {
      throw new ProviderError("capability_unsupported", "this provider cannot compare font references", { provider: ctx.llm.name });
    }
    const bytes = await ctx.store.read(boardUrl.replace(/^\/api\/files\//, "")).catch(() => null);
    if (!bytes) throw new Error("font reference board has not been uploaded");
    readDeconstructPng(bytes);
    tctx.signal.throwIfAborted();
    const raw = await ctx.llm.readImage(`${FONT_MATCH_PROMPT}\nFONT_ROWS=${JSON.stringify(rows)}`, bytes, FONT_MATCH_JSON_SCHEMA, {
      signal: tctx.signal, jobId: `fonts-${tctx.jobId}`,
    });
    tctx.signal.throwIfAborted();
    try {
      const { matches } = fontMatchesSchema.parse(JSON.parse(raw));
      const seen = new Set<number>();
      for (const m of matches) {
        const row = rows.find((r) => r.lineIndex === m.lineIndex);
        if (!row || seen.has(m.lineIndex) || new Set(m.candidateIds).size !== m.candidateIds.length || m.candidateIds.some((id) => !row.candidateIds.includes(id))) {
          throw new Error("unknown or duplicate font reference");
        }
        seen.add(m.lineIndex);
      }
      if (seen.size !== rows.length) throw new Error("missing font reference row");
      return { urls: [], fontMatches: matches };
    } catch {
      throw new ProviderError("plan_parse_failed", "font comparison returned invalid candidate IDs", { provider: ctx.llm.name });
    }
  };
}
