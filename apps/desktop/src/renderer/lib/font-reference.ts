import {
  DECONSTRUCT_FONTS, FONT_REFERENCE_MAX_LINES, FONT_REFERENCE_MAX_CANDIDATES,
  type DeconstructText, type FontMatch, type FontReferenceRow, type LensSuggestion,
} from "@oia/schema";
import { fabricV6OriginDefaults } from "@oia/canvas";
import { fittedDeconstructScene, inkBounds, type DeconstructFit } from "./deconstruct-typography.js";
import { fontMaskPlacement, type InkMask } from "./font-mask.js";
import { loadLensFont } from "./scene-fonts.js";
import { dataUrlBytes } from "./data-url.js";

type Family = NonNullable<DeconstructText["typography"]>["fontFamily"];
type Candidate = { id: string; family: Family };
interface ReferenceLine { lineIndex: number; crop: HTMLCanvasElement; mask: InkMask; scale: number; candidates: Candidate[] }
export interface FontReferenceBoard { png: Uint8Array; rows: FontReferenceRow[]; lines: ReferenceLine[]; sources: LensSuggestion[] }

function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Font reference rendering is unavailable");
  return ctx;
}
function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  return canvas;
}

/** FontFaceSet.check returns true for unknown system families, so compare fallback metrics. */
function systemFontAvailable(family: Family): boolean {
  if (["sans-serif", "serif", "monospace", "Be Vietnam Pro", "Instrument Serif"].includes(family)) return true;
  const c = canvasOf(1, 1), ctx = context(c);
  const probe = "mmmmWWWiii0123456789Q@";
  return ["monospace", "serif", "sans-serif"].some((fallback) => {
    ctx.font = `48px ${fallback}`; const width = ctx.measureText(probe).width;
    ctx.font = `48px "${family}", ${fallback}`;
    return Math.abs(ctx.measureText(probe).width - width) > 0.01;
  });
}

export function sourceInkMask(crop: HTMLCanvasElement, fill: string): InkMask {
  const { width, height } = crop;
  const rgba = context(crop).getImageData(0, 0, width, height).data;
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
  const crop = canvasOf(Math.max(1, Math.ceil(bw * scale)), Math.max(1, Math.ceil(bh * scale)));
  const ctx = context(crop), r = (t.typography?.angle ?? 0) * Math.PI / 180;
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
export async function buildFontReference(png: Uint8Array, texts: DeconstructText[], w: number, h: number, stopped: () => boolean, suggestions: LensSuggestion[] = []): Promise<FontReferenceBoard | null> {
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
    const panelHeight = 96 + Math.ceil(Math.min(FONT_REFERENCE_MAX_CANDIDATES, Math.max(...lines.map((line) => line.candidates.length))) / 4) * 70;
    const board = canvasOf(1600, lines.length * panelHeight), ctx = context(board);
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

export interface FontReferenceScore { lineIndex: number; family: Family; before: number; after: number; fontWeight: number }

/** Every candidate gets measured; advisory LLM IDs only affect evaluation order. */
export async function rankFontReferences(board: FontReferenceBoard, matches: FontMatch[], texts: DeconstructText[], w: number, h: number, stopped: () => boolean) {
  const { FabricText } = await import("fabric"); fabricV6OriginDefaults();
  const chosen = texts.map((t) => ({ ...t }));
  const fits = new Map<number, DeconstructFit>();
  const scores: FontReferenceScore[] = [];
  const checkStopped = () => { if (stopped()) throw new DOMException("Stopped", "AbortError"); };
  for (const line of board.lines) {
    checkStopped();
    const t = texts[line.lineIndex], style = t.typography;
    if (!style) continue;
    const shortlist = matches.find((m) => m.lineIndex === line.lineIndex)?.candidateIds ?? [];
    const families = [...new Set([style.fontFamily, ...line.candidates.filter((c) => shortlist.includes(c.id)).map((c) => c.family), ...line.candidates.map((c) => c.family)])];
    let minX = line.mask.width, minY = line.mask.height;
    for (let i = 0; i < line.mask.data.length; i++) if (line.mask.data[i]) { minX = Math.min(minX, i % line.mask.width); minY = Math.min(minY, Math.floor(i / line.mask.width)); }
    type Fit = DeconstructFit & { score: number; family: Family; fontWeight: number };
    let baseline = 0;
    let best: Fit = { score: 0, family: style.fontFamily, fontWeight: style.fontWeight, fontSize: 12, charSpacing: 0 };
    const coarse: Fit[] = [];
    for (const family of families) {
      // Give Stop and painting a turn between bounded chunks of CPU work.
      await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkStopped();
      let familyBest: Fit | undefined;
      const source = board.sources.find((s) => s.family === family && s.lineIndex === line.lineIndex)?.source;
      const weights = source && !source.variable ? [source.weight] : [...new Set([style.fontWeight, 400, 700])];
      for (const fontWeight of weights) {
        checkStopped();
        const candidate = { ...t, box: { ...t.box, x: 0, y: 0 }, typography: { ...style, fontFamily: family, fontWeight, angle: 0 } };
        const scene = await fittedDeconstructScene({ imageUrl: "", w, h, texts: [candidate] });
        const object = scene.objects[2];
        if (!object) continue;
        const text = new FabricText(t.text, { fontFamily: family, fontWeight, fontStyle: style.fontStyle, fill: "#000000", strokeWidth: 0, originX: "left", originY: "top" });
        const evaluate = (fontSize: number, charSpacing: number, fixed = false): Fit => {
          checkStopped();
          text.set({ fontSize: Math.max(4, fontSize), charSpacing: Math.max(-80, Math.min(1000, charSpacing)) });
          const raster = text.toCanvasElement(), ink = inkBounds(raster);
          if (!ink) { raster.width = raster.height = 0; return { score: 0, family, fontWeight, fontSize, charSpacing }; }
          const normalized = canvasOf(Math.max(1, Math.ceil(ink.width * line.scale)), Math.max(1, Math.ceil(ink.height * line.scale)));
          const ctx = context(normalized);
          ctx.drawImage(raster, ink.x, ink.y, ink.width, ink.height, 0, 0, ink.width * line.scale, ink.height * line.scale);
          const pixels = ctx.getImageData(0, 0, normalized.width, normalized.height).data;
          const data = new Uint8Array(normalized.width * normalized.height);
          for (let i = 0; i < data.length; i++) data[i] = Number(pixels[i * 4 + 3] >= 200);
          const placement = fontMaskPlacement(line.mask, { width: normalized.width, height: normalized.height, data }, fixed ? 0 : minX, fixed ? 0 : minY, fixed ? 0 : 2);
          raster.width = raster.height = normalized.width = normalized.height = 0;
          return { score: placement.score, family, fontWeight, fontSize: text.fontSize, charSpacing: text.charSpacing, offsetX: placement.x / line.scale, offsetY: placement.y / line.scale };
        };
        try {
          const size = object.fontSize ?? 12, spacing = typeof object.charSpacing === "number" ? object.charSpacing : 0;
          if (family === style.fontFamily && fontWeight === style.fontWeight) baseline = evaluate(size, spacing, true).score;
          for (const offset of [0, -50, 50]) {
            const fit = evaluate(size, spacing + offset);
            if (!familyBest || fit.score > familyBest.score) familyBest = fit;
          }
        } finally { text.dispose(); }
      }
      if (familyBest) coarse.push(familyBest);
    }
    // Refine only the best four families, with two coordinate-descent passes.
    for (const seed of coarse.sort((a, b) => b.score - a.score).slice(0, 4)) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkStopped();
      let local = seed;
      const text = new FabricText(t.text, { fontFamily: seed.family, fontWeight: seed.fontWeight, fontStyle: style.fontStyle, fill: "#000000", strokeWidth: 0, originX: "left", originY: "top" });
      try {
        for (const step of [0.04, 0.015]) {
          const anchor = local;
          for (const sizeFactor of [1 - step, 1, 1 + step]) for (const delta of [-step * 1000, 0, step * 1000]) {
            checkStopped();
            text.set({ fontSize: Math.max(4, anchor.fontSize * sizeFactor), charSpacing: Math.max(-80, Math.min(1000, anchor.charSpacing + delta)) });
            const raster = text.toCanvasElement(), ink = inkBounds(raster);
            if (!ink) { raster.width = raster.height = 0; continue; }
            const normalized = canvasOf(Math.max(1, Math.ceil(ink.width * line.scale)), Math.max(1, Math.ceil(ink.height * line.scale))), ctx = context(normalized);
            ctx.drawImage(raster, ink.x, ink.y, ink.width, ink.height, 0, 0, ink.width * line.scale, ink.height * line.scale);
            const rgba = ctx.getImageData(0, 0, normalized.width, normalized.height).data, data = new Uint8Array(normalized.width * normalized.height);
            for (let p = 0; p < data.length; p++) data[p] = Number(rgba[p * 4 + 3] >= 200);
            const placement = fontMaskPlacement(line.mask, { width: normalized.width, height: normalized.height, data }, minX, minY, 2);
            if (placement.score > local.score) local = { ...seed, score: placement.score, fontSize: text.fontSize, charSpacing: text.charSpacing, offsetX: placement.x / line.scale, offsetY: placement.y / line.scale };
            raster.width = raster.height = normalized.width = normalized.height = 0;
          }
        }
      } finally { text.dispose(); }
      if (local.score > best.score) best = local;
    }
    if (best.score > baseline + 0.005 && best.score >= 0.18) {
      chosen[line.lineIndex] = { ...t, typography: { ...style, fontFamily: best.family, fontWeight: best.fontWeight, spacingEm: best.charSpacing / 1000 } };
      fits.set(line.lineIndex, { fontSize: best.fontSize, charSpacing: best.charSpacing, offsetX: best.offsetX, offsetY: best.offsetY });
    }
    scores.push({ lineIndex: line.lineIndex, family: chosen[line.lineIndex].typography?.fontFamily ?? style.fontFamily, fontWeight: chosen[line.lineIndex].typography?.fontWeight ?? style.fontWeight, before: baseline, after: fits.has(line.lineIndex) ? best.score : baseline });
  }
  return { texts: chosen, fits, scores };
}

export function releaseFontReference(board: FontReferenceBoard) {
  for (const line of board.lines) line.crop.width = line.crop.height = 0;
}
