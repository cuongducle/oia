import { MIN_BOX_PX, type LoopMark } from "./loop-marks.js";
import type { Point } from "./markup-annotate.js";
import "@oia/canvas"; // fabric v6 origin compat must run before any object is created (F4 gate)

/**
 * Fabric-based marking layer (owner directive 18/11: use the fabric we
 * already ship). The fabric canvas handles interaction (drag, handles,
 * selection,
 * freehand brush); LoopMark[] stays the single source of truth for the prompt,
 * the red composite sent to the model and the session file. This module only
 * converts between the two worlds; it owns no state.
 *
 * Read-back rules after a user drag/scale (object:modified):
 * - box/oval: the group's bounding box IS the geometry
 * - path: transform the child Path's original commands by its live matrix
 * - arrow: move-only (scaling locked); from/to shift by the group delta
 */
export const MARK_UI = {
  stroke: "#ff0000",
  chipSize: 20,
} as const;

export function markStrokeWidth(naturalW: number, naturalH: number): number {
  return Math.max(1.8, Math.max(naturalW, naturalH) / 520);
}

type FabricNS = typeof import("fabric");
type Group = import("fabric").Group;
type Object = import("fabric").Object;

/** Interactive object for one mark: shape + numbered chip in a Group, so
 * handles and dragging act on the whole region. Scene coords = natural px. */
export function markToObject(fabric: FabricNS, mark: LoopMark, index: number, naturalW: number, naturalH: number): Group {
  const sw = markStrokeWidth(naturalW, naturalH);
  const shape = buildShape(fabric, mark, sw);
  const s = MARK_UI.chipSize;
  const shapeLeft = shape.left ?? 0;
  const shapeTop = shape.top ?? 0;
  const bg = new fabric.Rect({ left: shapeLeft, top: shapeTop - s - 3, width: s, height: s, fill: MARK_UI.stroke, rx: 4, ry: 4 });
  const label = new fabric.Text(String(index + 1), {
    left: shapeLeft + s / 2,
    top: shapeTop - s / 2 - 3,
    fontFamily: "system-ui",
    fontSize: 13,
    fontWeight: "700",
    fill: "#ffffff",
    originX: "center",
    originY: "center",
    selectable: false,
    evented: false,
  });
  const g = new fabric.Group([shape, bg, label], { objectCaching: false });
  const arrowLike = mark.kind === "arrow";
  g.set({
    markId: mark.id,
    markKind: mark.kind,
    lockRotation: true,
    hasControls: !arrowLike,
    lockScalingX: arrowLike,
    lockScalingY: arrowLike,
    padding: 4,
    cornerSize: 9,
    cornerStyle: "circle",
    cornerColor: "#ffffff",
    cornerStrokeColor: "#ff0000",
    transparentCorners: false,
    borderColor: "#f59e0b",
    borderScaleFactor: 1.6,
  });
  return g;
}

function buildShape(fabric: FabricNS, mark: LoopMark, sw: number): Object {
  if (mark.kind === "box") {
    return new fabric.Rect({ left: mark.x, top: mark.y, width: mark.w, height: mark.h, stroke: MARK_UI.stroke, strokeWidth: sw, fill: "rgba(255,0,0,0.08)", strokeUniform: true });
  }
  if (mark.kind === "oval") {
    return new fabric.Ellipse({ left: mark.cx - mark.rx, top: mark.cy - mark.ry, rx: mark.rx, ry: mark.ry, stroke: MARK_UI.stroke, strokeWidth: sw, fill: "rgba(255,0,0,0.08)", strokeUniform: true });
  }
  if (mark.kind === "path") {
    const d = mark.pts.map((q, i) => `${i === 0 ? "M" : "L"} ${q.x} ${q.y}`).join(" ");
    return new fabric.Path(d, { stroke: MARK_UI.stroke, strokeWidth: mark.thick ? sw * 3 : sw, fill: undefined, strokeUniform: true, opacity: mark.thick ? 0.55 : 1, strokeLineCap: "round", strokeLineJoin: "round" });
  }
  // arrow: shaft + solid head
  const size = sw * 4 + 6;
  const { dx, dy } = unit(mark.from, mark.to);
  const tri = new fabric.Polygon(
    [
      new fabric.Point(mark.to.x, mark.to.y),
      new fabric.Point(mark.to.x - dx * size - dy * size * 0.5, mark.to.y - dy * size + dx * size * 0.5),
      new fabric.Point(mark.to.x - dx * size + dy * size * 0.5, mark.to.y - dy * size - dx * size * 0.5),
    ],
    { fill: MARK_UI.stroke, objectCaching: false },
  );
  const line = new fabric.Line([mark.from.x, mark.from.y, mark.to.x, mark.to.y], { stroke: MARK_UI.stroke, strokeWidth: sw * 2.2, strokeLineCap: "round" });
  return new fabric.Group([line, tri], { objectCaching: false, selectable: false, evented: false });
}

function unit(from: Point, to: Point): { dx: number; dy: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { dx: dx / len, dy: dy / len };
}

/** Geometry read-back after the user dragged/scaled the fabric group. */
export function objectToMark(prev: LoopMark, obj: Object, fabric: FabricNS, naturalW: number, naturalH: number): LoopMark {
  const W = Math.max(1, naturalW);
  const H = Math.max(1, naturalH);
  if (prev.kind === "box" || prev.kind === "oval") {
    const sx = obj.scaleX ?? 1;
    const sy = obj.scaleY ?? 1;
    const x = clamp(obj.left ?? 0, 0, W);
    const y = clamp(obj.top ?? 0, 0, H);
    const bw = clamp((obj.width ?? 0) * sx, MIN_BOX_PX, W - x);
    const bh = clamp((obj.height ?? 0) * sy, MIN_BOX_PX, H - y);
    return prev.kind === "box" ? { ...prev, x, y, w: bw, h: bh } : { ...prev, cx: x + bw / 2, cy: y + bh / 2, rx: bw / 2, ry: bh / 2 };
  }
  if (prev.kind === "arrow") {
    // move-only: shift both endpoints by the group's own delta
    const pl = Number((obj as Group & { prevLeft?: number }).prevLeft ?? obj.left ?? 0);
    const pt = Number((obj as Group & { prevTop?: number }).prevTop ?? obj.top ?? 0);
    const dx = (obj.left ?? 0) - pl;
    const dy = (obj.top ?? 0) - pt;
    return {
      ...prev,
      from: clampPt({ x: prev.from.x + dx, y: prev.from.y + dy }, W, H),
      to: clampPt({ x: prev.to.x + dx, y: prev.to.y + dy }, W, H),
    };
  }
  if (prev.kind === "path") {
    const child = findPathChild(obj);
    if (!child) return prev;
    const m = child.calcTransformMatrix();
    const pts = (child as { path?: unknown[][] }).path
      ?.filter((seg) => {
        const cmd = Array.isArray(seg) ? seg[0] : "";
        return cmd === "M" || cmd === "L";
      })
      .map((seg) => {
        const n = seg as unknown as number[];
        const p = fabric.util.transformPoint(new fabric.Point(n[1] ?? 0, n[2] ?? 0), m);
        return clampPt({ x: p.x, y: p.y }, W, H);
      }) ?? [];
    return pts.length >= 2 ? { ...prev, pts } : prev;
  }
  return prev;
}

/** Extract the drawing from a PencilBrush-created fabric.Path (M/L/Q commands). */
export function pathStrokePoints(path: import("fabric").Path): Point[] {
  const out: Point[] = [];
  for (const seg of path.path ?? []) {
    const cmd = Array.isArray(seg) ? seg[0] : "";
    if (cmd === "M" || cmd === "L" || cmd === "Q") {
      const n = seg as unknown as number[];
      out.push({ x: n[1] ?? 0, y: n[2] ?? 0 });
    }
  }
  return out;
}

function findPathChild(obj: Object): import("fabric").Path | null {
  if ((obj as import("fabric").Path).path) return obj as import("fabric").Path;
  for (const it of (obj as Group).getObjects?.() ?? []) {
    if ((it as import("fabric").Path).path) return it as import("fabric").Path;
  }
  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function clampPt(p: Point, w: number, h: number): Point {
  return { x: clamp(p.x, 0, w), y: clamp(p.y, 0, h) };
}
