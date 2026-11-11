import {
  DECONSTRUCT_FONTS, FONT_REFERENCE_MAX_LINES, FONT_REFERENCE_MAX_CANDIDATES,
  type DeconstructText, type FontReferenceRow, type LensSuggestion,
} from "@oia/schema";
import type { InkMask } from "./font-mask.js";
import { loadLensFont } from "./scene-fonts.js";
import { dataUrlBytes } from "./data-url.js";

export type Family = NonNullable<DeconstructText["typography"]>["fontFamily"];
type Candidate = { id: string; family: Family };
interface ReferenceLine { lineIndex: number; crop: HTMLCanvasElement; mask: InkMask; scale: number; candidates: Candidate[] }
export interface FontReferenceBoard { png: Uint8Array; rows: FontReferenceRow[]; lines: ReferenceLine[]; sources: LensSuggestion[] }

export function referenceContext(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Font reference rendering is unavailable");
  return ctx;
}
export function referenceCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  return canvas;
}

/** FontFaceSet.check returns true for unknown system families, so compare fallback metrics. */
function systemFontAvailable(family: Family): boolean {
  if (["sans-serif", "serif", "monospace", "Be Vietnam Pro", "Instrument Serif"].includes(family)) return true;
  const c = referenceCanvas(1, 1), ctx = referenceContext(c);
  const probe = "mmmmWWWiii0123456789Q@";
  return ["monospace", "serif", "sans-serif"].some((fallback) => {
    ctx.font = `48px ${fallback}`; const width = ctx.measureText(probe).width;
    ctx.font = `48px "${family}", ${fallback}`;
    return Math.abs(ctx.measureText(probe).width - width) > 0.01;
  });
}

export function sourceInkMask(crop: HTMLCanvasElement, fill: string): InkMask {
  const { width, height } = crop;
  const rgba = referenceContext(crop).getImageData(0, 0, width, height).data;
  const rgb = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16));
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const distance = rgb.reduce((sum, c, k) => sum + (rgba[i * 4 + k] - c) ** 2, 0);
    data[i] = Number(rgba[i * 4 + 3] >= 200 && distance <= 55 ** 2);
  }
  return { width, height, data };
}

function uprightCrop(image: ImageBitmap, t: DeconstructText, w: number, h: number) {
  const bw = Math.max(1, t.box.w * w), bh = Math.max(1, t.box.h * h);
  const scale = Math.min(1, 640 / bw, 100 / bh);
  const crop = referenceCanvas(Math.max(1, Math.ceil(bw * scale)), Math.max(1, Math.ceil(bh * scale)));
  const ctx = referenceContext(crop), r = (t.typography?.angle ?? 0) * Math.PI / 180;
  const cos = Math.cos(r), sin = Math.sin(r), x = t.box.x * w, y = t.box.y * h;
  ctx.setTransform(scale * cos, -scale * sin, scale * sin, scale * cos, -scale * (cos * x + sin * y), scale * (sin * x - cos * y));
  ctx.drawImage(image, 0, 0, w, h);
  return { crop, scale };
}

function drawCandidate(ctx: CanvasRenderingContext2D, text: string, family: Family, weight: number, italic: string, x: number, y: number, maxWidth: number) {
  ctx.font = `${italic} ${weight} 36px "${family}"`;
  if (["serif", "sans-serif", "monospace"].includes(family)) ctx.font = `${italic} ${weight} 36px ${family}`;
  const metrics = ctx.measureText(text);
  const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  const s = Math.min(1, 30 / Math.max(1, height), maxWidth / Math.max(1, metrics.width));
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillText(text, 0, metrics.actualBoundingBoxAscent); ctx.restore();
}

/** Build at most six panels in one image; every sample uses the exact OCR content. */
export async function buildFontReference(png: Uint8Array, texts: DeconstructText[], w: number, h: number, stopped: () => boolean, suggestions: LensSuggestion[] = [], renderBoard = true): Promise<FontReferenceBoard | null> {
  const sources: LensSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (stopped()) throw new DOMException("Stopped", "AbortError");
    try { await loadLensFont(suggestion.family, suggestion.source); sources.push(suggestion); }
    catch { /* A corrupt or unsupported font must not hide the installed-font candidates. */ }
  }
  const available = DECONSTRUCT_FONTS.filter(systemFontAvailable).slice(0, FONT_REFERENCE_MAX_CANDIDATES);
  const lines: ReferenceLine[] = [];
  // SAFETY: Uint8Array copied into a fresh ArrayBuffer for browser Blob typing.
  const image = await createImageBitmap(new Blob([new Uint8Array(png).buffer], { type: "image/png" }));
  try {
    for (const [lineIndex, t] of texts.entries()) {
      if (stopped()) throw new DOMException("Stopped", "AbortError");
      if (lines.length >= FONT_REFERENCE_MAX_LINES) break;
      if (!t.typography || !/[\p{L}\p{N}]/u.test(t.text) || Array.from(t.text).length > 80 || !t.box.w || !t.box.h) continue;
      const { crop, scale } = uprightCrop(image, t, w, h);
      const mask = sourceInkMask(crop, t.typography.fill);
      const inkCount = mask.data.reduce((sum, v) => sum + v, 0);
      if (inkCount < 8 || inkCount > mask.data.length * 0.65) { crop.width = crop.height = 0; continue; }
      const families = [...new Set([t.typography.fontFamily, ...sources.filter((s) => s.lineIndex === lineIndex).map((s) => s.family), ...available])];
      lines.push({ lineIndex, crop, mask, scale, candidates: families.map((family, i) => ({ id: `F${String(i + 1).padStart(2, "0")}`, family })) });
    }
    if (!lines.length) return null;
    await Promise.all(lines.flatMap((line) => line.candidates.map((candidate) => {
      const t = texts[line.lineIndex];
      return document.fonts.load(`${t.typography?.fontStyle ?? "normal"} ${t.typography?.fontWeight ?? 400} 36px "${candidate.family}"`, t.text);
    })));
    if (stopped()) throw new DOMException("Stopped", "AbortError");
    const rows = lines.map(line => ({ lineIndex: line.lineIndex, candidateIds: line.candidates.slice(0, FONT_REFERENCE_MAX_CANDIDATES).map(c => c.id) }));
    if (!renderBoard) return { png: new Uint8Array(), rows, lines, sources };
    const panelHeight = 96 + Math.ceil(Math.min(FONT_REFERENCE_MAX_CANDIDATES, Math.max(...lines.map((line) => line.candidates.length))) / 4) * 70;
    const board = referenceCanvas(1600, lines.length * panelHeight), ctx = referenceContext(board);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, board.width, board.height);
    for (const [row, line] of lines.entries()) {
      const top = row * panelHeight, t = texts[line.lineIndex];
      ctx.fillStyle = "#111111"; ctx.font = "bold 18px sans-serif";
      ctx.fillText(`Line ${line.lineIndex}: ORIGINAL`, 12, top + 22);
      const s = Math.min(1, 1200 / line.crop.width, 54 / line.crop.height);
      ctx.drawImage(line.crop, 260, top + 6, line.crop.width * s, line.crop.height * s);
      line.candidates.slice(0, FONT_REFERENCE_MAX_CANDIDATES).forEach((candidate, i) => {
        const x = (i % 4) * 400 + 12, y = top + 88 + Math.floor(i / 4) * 70;
        ctx.fillStyle = "#666666"; ctx.font = "14px sans-serif";
        ctx.fillText(`${candidate.id} (${t.typography?.fontWeight ?? 400})`, x, y);
        ctx.fillStyle = "#111111";
        drawCandidate(ctx, t.text, candidate.family, t.typography?.fontWeight ?? 400, t.typography?.fontStyle ?? "normal", x, y + 8, 372);
      });
    }
    const bytes = dataUrlBytes(board.toDataURL("image/png"));
    board.width = board.height = 0;
    return { png: bytes, rows: lines.map((line) => ({ lineIndex: line.lineIndex, candidateIds: line.candidates.slice(0, FONT_REFERENCE_MAX_CANDIDATES).map((c) => c.id) })), lines, sources };
  } catch (e) { for (const line of lines) line.crop.width = line.crop.height = 0; throw e; }
  finally { image.close(); }
}

export function releaseFontReference(board: FontReferenceBoard) {
  for (const line of board.lines) line.crop.width = line.crop.height = 0;
}
