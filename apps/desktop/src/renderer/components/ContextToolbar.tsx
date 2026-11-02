import { useRef } from "react";
import type * as fabricNS from "fabric";
import { applyLayerAction, layerKind, type LayerObject } from "@oia/canvas";
import { commitObject, useCanvasRev } from "../lib/canvas-rev.js";

/**
 * UI v1.1 R5 — the few actions each kind of selection needs most, floating just
 * above it (below when there is no room). Replaces the old text-only bar, whose
 * layer buttons called fabric 6 per-object methods that fabric 7 removed.
 */

interface Props {
  canvas: fabricNS.Canvas | null;
  onEditWithAi: () => void;
  onReplaceImage: (file: File) => void;
  onDuplicate: () => void;
  /** D16: poster-mode edit path — deconstruct this page's baked text into layers. */
  onMakeTextEditable?: () => void;
}

export function ContextToolbar({ canvas, onEditWithAi, onReplaceImage, onDuplicate, onMakeTextEditable }: Props) {
  useCanvasRev(canvas, true);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = canvas?.getActiveObject();
  // SAFETY: LayerObject is a structural subset of FabricObject.
  if (!canvas || !active || canvas.isDrawingMode || (active as unknown as LayerObject).locked) return null;

  const vpt = canvas.viewportTransform;
  const pts = active.getCoords();
  const xs = pts.map((p) => p.x * vpt[0] + vpt[4]);
  const ys = pts.map((p) => p.y * vpt[3] + vpt[5]);
  const top = Math.min(...ys) - 50;
  const style = { left: (Math.min(...xs) + Math.max(...xs)) / 2, top: top < 4 ? Math.max(...ys) + 10 : top };

  const multi = active.type === "activeselection";
  // SAFETY: see above.
  const kind = multi ? "selection" : layerKind(active as unknown as LayerObject);
  const set = (patch: Record<string, unknown>) => commitObject(canvas, active, patch);
  const order = (a: "layerFront" | "layerBack") => {
    // SAFETY: applyLayerAction needs only getObjects/moveObjectTo, which fabric.Canvas implements.
    applyLayerAction(canvas as unknown as Parameters<typeof applyLayerAction>[0], active as unknown as LayerObject, a);
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: active });
  };
  const remove = () => {
    const targets = canvas.getActiveObjects();
    canvas.discardActiveObject();
    for (const o of targets) canvas.remove(o);
    canvas.requestRenderAll();
  };
  // SAFETY: only read for text — Textbox carries these.
  const text = active as unknown as { fontSize?: number; fontWeight?: string | number; textAlign?: string };
  const bold = text.fontWeight === "bold" || Number(text.fontWeight) >= 600;
  const nextAlign = text.textAlign === "left" ? "center" : text.textAlign === "center" ? "right" : "left";

  return (
    <div className="ctxToolbar" role="toolbar" aria-label="Selection actions" data-testid="ctx-toolbar" data-kind={kind} style={style} onMouseDown={(e) => e.preventDefault()}>
      {kind === "text" && (
        <>
          <button aria-label="Smaller text" onClick={() => set({ fontSize: Math.max(4, Math.round((text.fontSize ?? 16) / 1.15)) })}>A−</button>
          <span className="ctxValue" aria-label="Font size">{Math.round(text.fontSize ?? 16)}</span>
          <button aria-label="Larger text" onClick={() => set({ fontSize: Math.round((text.fontSize ?? 16) * 1.15) })}>A+</button>
          <button aria-label="Bold" aria-pressed={bold} onClick={() => set({ fontWeight: bold ? "normal" : "bold" })}><b>B</b></button>
          <button aria-label={`Align ${nextAlign}`} title={`Align: ${text.textAlign ?? "left"}`} onClick={() => set({ textAlign: nextAlign })}>{text.textAlign === "center" ? "↔" : text.textAlign === "right" ? "⇥" : "⇤"}</button>
          <label className="ctxColor" title="Text color">
            <input type="color" aria-label="Text color" value={typeof active.fill === "string" && /^#[0-9a-f]{6}$/i.test(active.fill) ? active.fill : "#000000"} onChange={(e) => set({ fill: e.target.value })} />
          </label>
          <span className="ctxSep" />
        </>
      )}
      {kind === "image" && (
        <>
          <button onClick={() => fileRef.current?.click()}>Replace</button>
          <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Replacement image file" onChange={(e) => { if (e.target.files?.[0]) onReplaceImage(e.target.files[0]); e.target.value = ""; }} />
          <button className="ctxAi" data-testid="ctx-edit-ai" onClick={onEditWithAi}>✦ Edit with AI</button>
          {onMakeTextEditable && <button data-testid="ctx-make-text-editable" title="Read the text in this artwork and rebuild it as editable layers" onClick={onMakeTextEditable}>Make text editable</button>}
          <span className="ctxSep" />
        </>
      )}
      {!multi && (
        <>
          <button aria-label="Bring to front" title="Bring to front" onClick={() => order("layerFront")}>⤒</button>
          <button aria-label="Send to back" title="Send to back (stays on the page)" onClick={() => order("layerBack")}>⤓</button>
        </>
      )}
      <button aria-label="Duplicate selection" title="Duplicate" onClick={onDuplicate}>⧉</button>
      <button aria-label="Delete selection" title="Delete" className="ctxDanger" onClick={remove}>✕</button>
    </div>
  );
}
