import { lensSuggestionSchema, type DeconstructText, type LensSuggestion } from "@oia/schema";
import type { OiaBridge } from "../../shared/bridge.js";
import { fittedDeconstructScene } from "./deconstruct-typography.js";
import { buildFontReference, rankFontReferences, releaseFontReference } from "./font-reference.js";
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
  let board: Awaited<ReturnType<typeof buildFontReference>> = null;
  try {
    board = await buildFontReference(input.png, input.texts, input.w, input.h, run.stopped, suggestions);
    if (!board) return { scene: baseline, note: "No reliable text crop was available for visual font comparison." };
    if (run.stopped()) throw new DOMException("Stopped", "AbortError");
    // D23: all bounded candidates are measured locally. A paid shortlist cannot add candidates or improve the pixel optimum.
    const ranked = await rankFontReferences(board, [], input.texts, input.w, input.h, run.stopped);
    if (run.stopped()) throw new DOMException("Stopped", "AbortError");
    const scene = await fittedDeconstructScene({ ...input, texts: ranked.texts, fits: ranked.fits });
    for (const line of board.lines) {
      const source = board.sources.find((s) => s.lineIndex === line.lineIndex && s.family === ranked.texts[line.lineIndex]?.typography?.fontFamily);
      if (source && scene.objects[line.lineIndex + 2]) scene.objects[line.lineIndex + 2].fontSource = source.source;
    }
    const eligible = input.texts.filter((t) => t.typography).length;
    const note = board.rows.length < eligible ? `Visual font comparison covered ${board.rows.length} of ${eligible} text regions; other regions keep their initial font.` : "";
    if (note) scene.deconstructFontNote = note;
    return { scene, note };
  } catch (error) {
    const stopped = run.stopped() || (error instanceof DOMException && error.name === "AbortError");
    const note = stopped ? "Font comparison was stopped. The initial editable text and cleaned background were kept."
      : "Font comparison was unavailable. The initial editable text and cleaned background were kept.";
    baseline.deconstructFontNote = note;
    return { scene: baseline, note };
  } finally { if (board) releaseFontReference(board); }
}
