import { useEffect, useRef, useState } from "react";
import type * as fabricNS from "fabric";
import { layerKind, layerLabel, type LayerObject } from "@oia/canvas";
import { commitObject, useCanvasRev } from "../lib/canvas-rev.js";

/**
 * UI v1.1 R5 — the Design tab: what the selection is and every number that
 * places it. Edits commit on Enter/blur through commitObject (object:modified →
 * undo + autosave). Nothing selected → the page's own properties.
 */

interface Props {
  canvas: fabricNS.Canvas | null;
  page: { w: number; h: number };
  onOpenPage: () => void;
  onEditWithAi: () => void;
  onReplaceImage: (file: File) => void;
}

/** A number input that edits a draft and commits once — per-keystroke commits flood undo. */
function NumberField({ label, value, onCommit, disabled, suffix, min }: {
  label: string; value: number; onCommit: (v: number) => void; disabled?: boolean; suffix?: string; min?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    setDraft(null);
    if (Number.isFinite(v) && (min === undefined || v >= min) && v !== value) onCommit(v);
  };
  return (
    <label className="inspField">
      <span>{label}</span>
      <input
        type="number" aria-label={label} disabled={disabled}
        value={draft ?? String(Math.round(value))}
        onFocus={(e) => setDraft(e.currentTarget.value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); } }}
      />
      {suffix && <em>{suffix}</em>}
    </label>
  );
}

export function Inspector({ canvas, page, onOpenPage, onEditWithAi, onReplaceImage }: Props) {
  useCanvasRev(canvas, true);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = canvas?.getActiveObject() ?? null;
  // a stale draft must not survive a selection change
  const [selKey, setSelKey] = useState(0);
  useEffect(() => setSelKey((k) => k + 1), [active]);

  if (!canvas || !active) {
    return (
      <div className="inspector" data-testid="inspector">
        <section className="inspSection">
          <h4>Page</h4>
          <p className="inspValue">{page.w} × {page.h} px</p>
          <button className="ghostBtn" onClick={onOpenPage}>Size and background…</button>
        </section>
        <p className="hintP">Select a layer on the canvas or in Layers to edit it here.</p>
      </div>
    );
  }

  // SAFETY: LayerObject is a structural subset of FabricObject (type/name/text/src/origin/visible/locked).
  const lo = active as unknown as LayerObject;
  const kind = active.type === "activeselection" ? "selection" : layerKind(lo);
  const locked = lo.locked === true;
  const set = (patch: Record<string, unknown>) => commitObject(canvas, active, patch);
  const w = (active.width ?? 0) * (active.scaleX ?? 1);
  const h = (active.height ?? 0) * (active.scaleY ?? 1);
  const isText = kind === "text";
  const fill = typeof active.fill === "string" ? active.fill : null;
  // SAFETY: only read when isText — fontSize/fontWeight/textAlign/charSpacing exist on fabric Textbox.
  const text = active as unknown as { fontSize?: number; fontWeight?: string | number; textAlign?: string; charSpacing?: number; fontFamily?: string };
  const bold = text.fontWeight === "bold" || Number(text.fontWeight) >= 600;

  return (
    <div className="inspector" data-testid="inspector" key={selKey}>
      <div className="inspHead">
        <strong>{kind === "selection" ? `${canvas.getActiveObjects().length} layers` : layerLabel(lo)}</strong>
        <span>{kind === "selection" ? "Selection" : kind[0].toUpperCase() + kind.slice(1)}</span>
      </div>
      {locked && <p className="notice" role="status">Locked — unlock it in Layers to edit.</p>}

      <section className="inspSection" aria-label="Position">
        <h4>Position</h4>
        <div className="inspGrid">
          <NumberField label="X" value={active.left ?? 0} disabled={locked} onCommit={(v) => set({ left: v })} />
          <NumberField label="Y" value={active.top ?? 0} disabled={locked} onCommit={(v) => set({ top: v })} />
          <NumberField label="W" value={w} min={1} disabled={locked} onCommit={(v) => set(isText ? { width: v / (active.scaleX ?? 1) } : { scaleX: v / Math.max(1, active.width ?? 1) })} />
          <NumberField label="H" value={h} min={1} disabled={locked || isText} onCommit={(v) => set({ scaleY: v / Math.max(1, active.height ?? 1) })} />
          <NumberField label="Rotation" value={active.angle ?? 0} suffix="°" disabled={locked} onCommit={(v) => set({ angle: ((v % 360) + 360) % 360 })} />
        </div>
      </section>

      <section className="inspSection" aria-label="Appearance">
        <h4>Appearance</h4>
        <label className="inspRange">
          <span>Opacity</span>
          <input type="range" min={0} max={100} aria-label="Opacity" disabled={locked} value={Math.round((active.opacity ?? 1) * 100)} onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} />
          <em>{Math.round((active.opacity ?? 1) * 100)}%</em>
        </label>
        {fill && kind !== "image" && (
          <label className="inspColor">
            <span>{isText ? "Color" : "Fill"}</span>
            <input type="color" aria-label={isText ? "Text color" : "Fill color"} disabled={locked} value={/^#[0-9a-f]{6}$/i.test(fill) ? fill : "#000000"} onChange={(e) => set({ fill: e.target.value })} />
            <code>{fill}</code>
          </label>
        )}
      </section>

      {isText && (
        <section className="inspSection" aria-label="Text">
          <h4>Text</h4>
          <p className="inspValue" title="Fonts follow your brand kit and the app's Vietnamese-safe stack">{text.fontFamily ?? "Default"}</p>
          <div className="inspGrid">
            <NumberField label="Size" value={text.fontSize ?? 16} min={4} disabled={locked} onCommit={(v) => set({ fontSize: v })} />
            <NumberField label="Spacing" value={text.charSpacing ?? 0} disabled={locked} onCommit={(v) => set({ charSpacing: v })} />
          </div>
          <div className="inspButtons">
            <button aria-pressed={bold} disabled={locked} onClick={() => set({ fontWeight: bold ? "normal" : "bold" })}><b>B</b></button>
            {(["left", "center", "right"] as const).map((a) => (
              <button key={a} aria-pressed={text.textAlign === a} aria-label={`Align ${a}`} disabled={locked} onClick={() => set({ textAlign: a })}>{a === "left" ? "⇤" : a === "center" ? "↔" : "⇥"}</button>
            ))}
          </div>
        </section>
      )}

      {kind === "image" && (
        <section className="inspSection" aria-label="Image">
          <h4>Image</h4>
          <div className="inspActions">
            <button className="secondaryBtn" disabled={locked} onClick={() => fileRef.current?.click()}>Replace image…</button>
            <button className="secondaryBtn aiAction" data-testid="inspector-edit-ai" onClick={onEditWithAi}>✦ Edit with AI</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Replacement image" onChange={(e) => { if (e.target.files?.[0]) onReplaceImage(e.target.files[0]); e.target.value = ""; }} />
        </section>
      )}
    </div>
  );
}
