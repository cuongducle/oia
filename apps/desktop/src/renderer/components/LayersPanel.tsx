import { useState } from "react";
import type * as fabricNS from "fabric";
import { layerRows, moveLayer, setLocked, type LayerObject, type LayerRow } from "@oia/canvas";
import { useCanvasRev } from "../lib/canvas-rev.js";

/**
 * UI v1.1 R4 — the Fabric stack as a list, top first. Click selects (locked
 * layers too — the panel is how you reach them), eye hides, padlock locks, drag
 * reorders. Every change fires object:modified so undo and autosave see it.
 */

const KIND_ICON: Record<LayerRow["kind"], string> = {
  text: "M4 6h16M9 6v13h6",
  image: "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6",
  group: "M3 3h8v8H3zM13 13h8v8h-8z",
  shape: "M4 4h16v16H4z",
};
const EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";
const EYE_OFF = "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6";
const LOCK = "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4";
const UNLOCK = "M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2";

const Svg = ({ d }: { d: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export function LayersPanel({ canvas }: { canvas: fabricNS.Canvas | null }) {
  useCanvasRev(canvas);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  if (!canvas) return null;

  const objects = canvas.getObjects();
  // SAFETY: LayerObject is a structural subset of FabricObject (type/name/text/src/origin/visible/locked/selectable/evented).
  const rows = layerRows(objects as unknown as LayerObject[]);
  const active = canvas.getActiveObject();
  const activeSet = new Set(canvas.getActiveObjects());

  const touch = (obj: fabricNS.FabricObject) => {
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: obj });
  };
  const select = (obj: fabricNS.FabricObject) => {
    if (obj.visible === false) return;
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
  };
  const toggleVisible = (obj: fabricNS.FabricObject) => {
    if (obj.visible !== false && activeSet.has(obj)) canvas.discardActiveObject();
    obj.set("visible", obj.visible === false);
    touch(obj);
  };
  const toggleLock = (obj: fabricNS.FabricObject, locked: boolean) => {
    // SAFETY: see LayerObject above — setLocked only writes locked/selectable/evented.
    setLocked(obj as unknown as LayerObject, !locked);
    touch(obj);
  };
  const drop = (toIndex: number) => {
    if (dragFrom === null || dragFrom === toIndex) return setDragFrom(null);
    const obj = objects[dragFrom];
    setDragFrom(null);
    // SAFETY: moveLayer calls only getObjects/moveObjectTo, which fabric.Canvas implements.
    moveLayer(canvas as unknown as Parameters<typeof moveLayer>[0], obj as unknown as LayerObject, toIndex);
    touch(obj);
  };

  return (
    <div className="layersPanel" data-testid="layers-panel">
      {rows.length === 0 && <p className="hintP">No layers yet — add text, shapes or images.</p>}
      <ul className="layerList" aria-label="Layers, top first">
        {rows.map((r) => {
          const obj = objects[r.index];
          const selected = obj === active || activeSet.has(obj);
          return (
            <li
              key={r.index}
              className={`layerRow ${selected ? "selected" : ""} ${r.visible ? "" : "hidden"} ${dragFrom === r.index ? "dragging" : ""}`}
              data-layer-index={r.index}
              draggable
              onDragStart={(e) => { setDragFrom(r.index); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
              onDrop={(e) => { e.preventDefault(); drop(r.index); }}
              onDragEnd={() => setDragFrom(null)}
            >
              <button className="layerMain" aria-pressed={selected} onClick={() => select(obj)} title={r.visible ? "Select layer" : "Show the layer to select it"}>
                <span className="layerIcon"><Svg d={KIND_ICON[r.kind]} /></span>
                <span className="layerName">{r.label}</span>
                {r.user && <span className="layerYou" title="Added by you — AI edits never remove it">You</span>}
              </button>
              <button className="layerToggle" aria-label={`${r.visible ? "Hide" : "Show"} ${r.label}`} aria-pressed={!r.visible} onClick={() => toggleVisible(obj)}><Svg d={r.visible ? EYE : EYE_OFF} /></button>
              <button className={`layerToggle ${r.locked ? "on" : ""}`} aria-label={`${r.locked ? "Unlock" : "Lock"} ${r.label}`} aria-pressed={r.locked} onClick={() => toggleLock(obj, r.locked)}><Svg d={r.locked ? LOCK : UNLOCK} /></button>
            </li>
          );
        })}
      </ul>
      {rows.length > 1 && <p className="hintP layersHint">Drag to reorder. The page itself always stays at the bottom.</p>}
    </div>
  );
}
