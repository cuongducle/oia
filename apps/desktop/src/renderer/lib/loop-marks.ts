import { markerWidthFor, type Point } from "./markup-annotate.js";

/**
 * SIL (single-image-loop.md) SL-2: region marks for the single-image loop.
 * Unlike ME's freehand strokes (kept untouched for the Editor), loop marks are
 * GEOMETRY: numbered boxes and arrows in the image's NATURAL pixel space, one
 * instruction per region. Same storage rule as ME-3: marks live in view state
 * only, they never enter any scene or store. The composite flattens image +
 * numbered marks into ONE PNG (probe P3 channel: red markers, model removes
 * them), the prompt lists each numbered region.
 */

export interface BoxMark {
  id: string;
  kind: "box";
  note: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArrowMark {
  id: string;
  kind: "arrow";
  note: string;
  from: Point;
  to: Point;
}

export type LoopMark = BoxMark | ArrowMark;

/** Hit-testing and dragging existing marks (owner pick 18/11: move a region
 * instead of delete + redraw). Pure, unit-tested. */
export function markHit(mark: LoopMark, p: Point, tol: number): boolean {
  if (mark.kind === "box") {
    return p.x >= mark.x - tol && p.x <= mark.x + mark.w + tol && p.y >= mark.y - tol && p.y <= mark.y + mark.h + tol;
  }
  return segDist(p, mark.from, mark.to) <= tol;
}

function segDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Move a whole mark by (dx, dy), clamped back into the image bounds. */
export function moveMark(mark: LoopMark, dx: number, dy: number, w: number, h: number): LoopMark {
  if (mark.kind === "box") {
    const x = Math.max(0, Math.min(w - mark.w, mark.x + dx));
    const y = Math.max(0, Math.min(h - mark.h, mark.y + dy));
    return { ...mark, x, y };
  }
  const minX = Math.min(mark.from.x, mark.to.x);
  const maxX = Math.max(mark.from.x, mark.to.x);
  const minY = Math.min(mark.from.y, mark.to.y);
  const maxY = Math.max(mark.from.y, mark.to.y);
  const ox = dx > 0 ? Math.min(dx, w - maxX) : Math.max(dx, -minX);
  const oy = dy > 0 ? Math.min(dy, h - maxY) : Math.max(dy, -minY);
  return { ...mark, from: { x: mark.from.x + ox, y: mark.from.y + oy }, to: { x: mark.to.x + ox, y: mark.to.y + oy } };
}

/** Resize a box from its bottom-right handle to the pointer position,
 * keeping the minimum size and staying inside the image. */
export function resizeBox(mark: BoxMark, p: Point, w: number, h: number): BoxMark {
  const x1 = Math.min(w, Math.max(mark.x + MIN_BOX_PX, p.x));
  const y1 = Math.min(h, Math.max(mark.y + MIN_BOX_PX, p.y));
  return { ...mark, w: x1 - mark.x, h: y1 - mark.y };
}

/** Minimum drag (natural px) below which a shape is a stray click, not a mark. */
export const MIN_BOX_PX = 6;
export const MIN_ARROW_PX = 8;

/** Stage view transform: viewport css = world css × s + t. */
export interface LoopView {
  s: number;
  tx: number;
  ty: number;
}

/** Zoom keeping the point under the cursor pinned (pure, unit-testable). */
export function zoomAt(v: LoopView, cx: number, cy: number, factor: number, min = 0.15, max = 12): LoopView {
  const s2 = Math.min(max, Math.max(min, v.s * factor));
  const f = s2 / v.s;
  return { s: s2, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f };
}

/** Fraction of the stage the image must keep overlapping however far it is
 * panned; 0.12 = the image can never leave more than ~88% of the viewport. */
export const PAN_KEEP_FRACTION = 0.12;

/** Clamp pan so the fitted image always stays reachable: its edges may leave
 * the stage but at least PAN_KEEP_FRACTION of the stage stays covered (pure).
 * Bounds are non-empty for every zoom because min uses the image's far edge. */
export function clampPan(v: LoopView, stageW: number, stageH: number, fitW: number, fitH: number): LoopView {
  const keep = PAN_KEEP_FRACTION;
  const txMin = stageW * keep - fitW * v.s;
  const txMax = stageW * (1 - keep);
  const tyMin = stageH * keep - fitH * v.s;
  const tyMax = stageH * (1 - keep);
  return {
    s: v.s,
    tx: Math.min(txMax, Math.max(txMin, v.tx)),
    ty: Math.min(tyMax, Math.max(tyMin, v.ty)),
  };
}

/** Keep the numbered chip inside the image: anchors near an edge slide in so
 * the number is never clipped away (the prompt references it). Pure. */
export function clampChipAnchor(p: Point, naturalWidth: number, naturalHeight: number, size: number): Point {
  const half = size / 2;
  return {
    x: Math.min(naturalWidth - half, Math.max(half, p.x)),
    y: Math.min(naturalHeight - half, Math.max(half, p.y)),
  };
}

let markSeq = 0;
export function newMarkId(): string {
  markSeq += 1;
  return `m${Date.now().toString(36)}-${markSeq}`;
}

/** Anchor (natural px) for the numbered chip: outside the box's top-left
 * corner; for arrows at the tail, nudged along the arrow's normal so the chip
 * does not sit on the line. Pure math, unit-testable. */
export function chipAnchor(mark: LoopMark): Point {
  if (mark.kind === "box") return { x: mark.x, y: mark.y };
  const dx = mark.to.x - mark.from.x;
  const dy = mark.to.y - mark.from.y;
  const len = Math.hypot(dx, dy) || 1;
  // unit normal (rotate direction -90°), chip sits 40% of the length up to a cap
  const off = Math.min(len * 0.4, 42);
  return { x: mark.from.x + (-dy / len) * off, y: mark.from.y + (dx / len) * off };
}

/** The three points of an arrow head triangle at `to`, pointing along the
 * arrow direction, sized relative to the marker width. Pure math. */
export function arrowHead(from: Point, to: Point, size: number): [Point, Point, Point] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return [
    { x: to.x, y: to.y },
    { x: to.x - ux * size - uy * size * 0.5, y: to.y - uy * size + ux * size * 0.5 },
    { x: to.x - ux * size + uy * size * 0.5, y: to.y - uy * size - ux * size * 0.5 },
  ];
}

/** Display mode for drawMark: the ON-CANVAS overlay wants thin strokes + a
 * translucent fill so the artwork stays readable under the marks (pro-tool
 * language); the COMPOSITE sent to the model keeps the probe-verified solid
 * red, no fill (P3). One draw function, two visual registers. */
export type MarkDisplay = "canvas" | "composite";

export function drawMark(
  ctx: CanvasRenderingContext2D,
  mark: LoopMark,
  index: number,
  naturalWidth: number,
  naturalHeight: number,
  chipPos?: { x: number; y: number },
  display: MarkDisplay = "composite",
): void {
  const base = markerWidthFor(naturalWidth, naturalHeight);
  const lw = display === "canvas" ? base * 0.6 : base;
  ctx.strokeStyle = "#ff0000";
  ctx.fillStyle = "#ff0000";
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (mark.kind === "box") {
    if (display === "canvas") {
      ctx.fillStyle = "rgba(255, 0, 0, 0.08)";
      ctx.fillRect(mark.x, mark.y, mark.w, mark.h);
      ctx.fillStyle = "#ff0000";
    }
    ctx.strokeRect(mark.x, mark.y, mark.w, mark.h);
  } else {
    ctx.beginPath();
    ctx.moveTo(mark.from.x, mark.from.y);
    ctx.lineTo(mark.to.x, mark.to.y);
    ctx.stroke();
    const [tip, a, b] = arrowHead(mark.from, mark.to, lw * 3.5);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.closePath();
    ctx.fill();
  }
  const at = chipPos ?? clampChipAnchor(chipAnchor(mark), naturalWidth, naturalHeight, Math.max(18, base * 4));
  drawChip(ctx, index + 1, at, base);
}

/** Collision-aware chip placement (one anchor per mark, array order). Overlapping
 * chips are nudged down in 1.3-chip steps (max 3 tries), then clamped into the
 * image. The 12-region shot exposed badges stacking into an unreadable strip;
 * this keeps every number visible. Pure, unit-tested. */
export function layoutChips(marks: LoopMark[], naturalWidth: number, naturalHeight: number): { x: number; y: number }[] {
  const size = Math.max(18, markerWidthFor(naturalWidth, naturalHeight) * 4);
  const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
  return marks.map((m) => {
    let p = clampChipAnchor(chipAnchor(m), naturalWidth, naturalHeight, size);
    for (let attempt = 0; attempt < 3; attempt++) {
      const box = { x1: p.x - size / 2, y1: p.y - size / 2, x2: p.x + size / 2, y2: p.y + size / 2 };
      const hit = placed.find((q) => box.x1 < q.x2 && box.x2 > q.x1 && box.y1 < q.y2 && box.y2 > q.y1);
      if (!hit) break;
      p = clampChipAnchor({ x: p.x, y: p.y + size * 1.3 }, naturalWidth, naturalHeight, size);
    }
    placed.push({ x1: p.x - size / 2, y1: p.y - size / 2, x2: p.x + size / 2, y2: p.y + size / 2 });
    return p;
  });
}

/** Numbered chip: red rounded square with the white region number. */
export function drawChip(ctx: CanvasRenderingContext2D, n: number, at: Point, lw: number): void {
  const size = Math.max(18, lw * 4);
  const r = size * 0.22;
  const x = at.x - size / 2;
  const y = at.y - size / 2;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, r);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${Math.round(size * 0.62)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), at.x, at.y + size * 0.04);
}

/**
 * Flatten image + numbered marks into one PNG data URL at natural size (the
 * flatten-mode payload, same channel as ME's markupComposite: crossOrigin
 * anonymous so oia:// never taints the canvas).
 */
export function regionComposite(src: string, marks: LoopMark[], naturalWidth: number, naturalHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = naturalWidth;
        canvas.height = naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("region composite: no 2d context"));
          return;
        }
        ctx.drawImage(img, 0, 0, naturalWidth, naturalHeight);
        const chips = layoutChips(marks, naturalWidth, naturalHeight);
        marks.forEach((m, i) => drawMark(ctx, m, i, naturalWidth, naturalHeight, chips[i]));
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("region composite: export failed"));
      }
    };
    img.onerror = () => reject(new Error("region composite: image failed to load"));
    img.src = src;
  });
}

/**
 * The per-region instruction block of the edit prompt. Numbering follows the
 * array order, exactly what the chips on the composite show. Empty notes are
 * the caller's gate (the button stays disabled), the builder stays total.
 */
export function marksPrompt(marks: LoopMark[]): string {
  return marks
    .map((m, i) => `Region ${i + 1} (red ${m.kind === "box" ? "box" : "arrow"}): ${m.note.trim()}`)
    .join("\n");
}
