import { lensSuggestionSchema, type DeconstructText, type LensSuggestion } from "@oia/schema";
import type { OiaBridge } from "../../shared/bridge.js";
import { fittedDeconstructScene } from "./deconstruct-typography.js";
import { FontComparisonBudgetExceeded, rankArtworkFonts } from "./font-ranking.js";
import { pollTask } from "./poll-task.js";

type FontMatchBridge = Pick<OiaBridge, "uploadAsset" | "submitTask" | "getTask" | "cancelTask">;

/** Local Lens classification, 0 provider quota. Any failure falls back to no suggestions. */
async function recognizeFontsLocally(png: Uint8Array, texts: DeconstructText[], bridge: FontMatchBridge, run: { stopped: () => boolean; onTask: (taskId: string) => void }): Promise<LensSuggestion[]> {
  let taskId: string | null = null;
  try {
    const uploaded = await bridge.uploadAsset("font-source.png", png);
    const started = await bridge.submitTask("recognize-fonts", { fileUrl: uploaded.url, texts });
    taskId = started.taskId;
    run.onTask(taskId);
    if (run.stopped()) { await bridge.cancelTask(taskId).catch(() => {}); return []; }
    const final = await pollTask(started, { get: (id) => bridge.getTask(id) });
    if (final.progress !== "succeeded") return [];
    return (final.taskResult?.fontSuggestions ?? []).map((s) => lensSuggestionSchema.parse(s));
  } catch {
    if (taskId) await bridge.cancelTask(taskId).catch(() => {});
    return [];
  }
}

/** A failed or stopped optional stage may never discard the paid OCR/plate result. */
export async function matchedDeconstructScene(input: {
  png: Uint8Array; imageUrl: string; w: number; h: number; texts: DeconstructText[];
}, bridge: FontMatchBridge, run: { stopped: () => boolean; onTask: (taskId: string) => void }) {
  const baseline = await fittedDeconstructScene(input);
  if (run.stopped() || !input.texts.some((t) => t.typography)) return { scene: baseline, note: "" };
  const suggestions = await recognizeFontsLocally(input.png, input.texts, bridge, run);
  if (run.stopped()) return { scene: baseline, note: "" };
  try {
    const ranked = await rankArtworkFonts(input.png, input.texts, input.w, input.h, run.stopped, suggestions);
    if (!ranked.compared) return { scene: baseline, note: "No reliable text crop was available for visual font comparison." };
    if (run.stopped()) throw new DOMException("Stopped", "AbortError");
    const scene = await fittedDeconstructScene({ ...input, texts: ranked.texts, fits: ranked.fits });
    for (const source of ranked.sources) {
      if (source.family === ranked.texts[source.lineIndex]?.typography?.fontFamily && scene.objects[source.lineIndex + 2]) {
        scene.objects[source.lineIndex + 2].fontSource = source.source;
      }
    }
    const eligible = input.texts.filter((t) => t.typography).length;
    const note = ranked.compared < eligible ? `Visual font comparison covered ${ranked.compared} of ${eligible} text regions; other regions keep their initial font. Fonts are approximations; review the result before exporting.`
      : "Fonts are approximations; review the result before exporting.";
    if (note) scene.deconstructFontNote = note;
    return { scene, note };
  } catch (error) {
    const stopped = run.stopped() || (error instanceof DOMException && error.name === "AbortError");
    const note = stopped ? "Font comparison was stopped. The initial editable text and cleaned background were kept."
      : error instanceof FontComparisonBudgetExceeded
        ? "Font comparison reached its local time limit. The initial editable text and cleaned background were kept."
        : "Font comparison was unavailable. The initial editable text and cleaned background were kept.";
    baseline.deconstructFontNote = note;
    return { scene: baseline, note };
  }
}
