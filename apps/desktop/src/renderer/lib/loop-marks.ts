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

export function drawMark(ctx: CanvasRenderingContext2D, mark: LoopMark, index: number, naturalWidth: number, naturalHeight: number): void {
  const lw = markerWidthFor(naturalWidth, naturalHeight);
  ctx.strokeStyle = "#ff0000";
  ctx.fillStyle = "#ff0000";
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (mark.kind === "box") {
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
  drawChip(ctx, index + 1, chipAnchor(mark), lw);
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
        marks.forEach((m, i) => drawMark(ctx, m, i, naturalWidth, naturalHeight));
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
