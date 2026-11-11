/** Image builders for the D22 detector lane (owner decision 2026-11-11):
 *  the detector owns geometry, the vision model only classifies and transcribes
 *  numbered artifacts built here. Pure pngjs, no canvas, deterministic.
 *
 *  Evidence that shaped these layouts (real quota, 2026-11-11): labels drawn
 *  ABOVE boxes mispaired with the line above; chips drawn INSIDE boxes paired
 *  114/114; transcription from unoccluded crops with the ID OUTSIDE the crop
 *  recovered content the full-image read got wrong (docs/private/real-runs/
 *  2026-11-11-deconstruct-detector/RECHECK.md).
 */
import { PNG } from "pngjs";
import type { DetectedTextLine } from "./text-detector.js";

/** 5x7 bitmap digits: the only glyphs the sheets ever need (line ids). */
const DIGITS: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};

function drawDigits(target: PNG, text: string, x0: number, y0: number, scale: number, rgb: [number, number, number]) {
  for (const [n, char] of Array.from(text).entries()) {
    const glyph = DIGITS[char];
    if (!glyph) continue;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
      if (glyph[y][x] !== "1") continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const x1 = x0 + (n * 6 + x) * scale + dx, y1 = y0 + y * scale + dy;
        if (x1 < 0 || y1 < 0 || x1 >= target.width || y1 >= target.height) continue;
        const i = (y1 * target.width + x1) * 4;
        target.data[i] = rgb[0]; target.data[i + 1] = rgb[1]; target.data[i + 2] = rgb[2]; target.data[i + 3] = 255;
      }
    }
  }
}

function fillRect(target: PNG, x0: number, y0: number, w: number, h: number, rgb: [number, number, number]) {
  for (let y = Math.max(0, y0); y < Math.min(target.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(target.width, x0 + w); x++) {
      const i = (y * target.width + x) * 4;
      target.data[i] = rgb[0]; target.data[i + 1] = rgb[1]; target.data[i + 2] = rgb[2]; target.data[i + 3] = 255;
    }
  }
}

/** Reconstruct the detector quad (image px) from the ink-rect + angle contract. */
export function lineQuad(src: PNG, line: DetectedTextLine): [number, number][] {
  const rad = line.angle * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const x = line.box.x * src.width, y = line.box.y * src.height;
  const w = line.box.w * src.width, h = line.box.h * src.height;
  return [[0, 0], [w, 0], [w, h], [0, h]].map(([u, v]) => [x + u * cos - v * sin, y + u * sin + v * cos]);
}

function thickSegment(target: PNG, ax: number, ay: number, bx: number, by: number, radius: number, rgb: [number, number, number]) {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - radius)), maxX = Math.min(target.width - 1, Math.ceil(Math.max(ax, bx) + radius));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - radius)), maxY = Math.min(target.height - 1, Math.ceil(Math.max(ay, by) + radius));
  const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
    const px = ax + t * dx, py = ay + t * dy;
    if (Math.hypot(x - px, y - py) <= radius) {
      const i = (y * target.width + x) * 4;
      target.data[i] = rgb[0]; target.data[i + 1] = rgb[1]; target.data[i + 2] = rgb[2]; target.data[i + 3] = 255;
    }
  }
}

/** The classification read: full-image context with every line outlined and a
 *  numbered yellow chip INSIDE its outline (the pairing that measured 114/114). */
export function buildAnnotatedImage(src: PNG, lines: DetectedTextLine[]): PNG {
  const out = new PNG({ width: src.width, height: src.height });
  src.data.copy(out.data);
  for (const [index, line] of lines.entries()) {
    const quad = lineQuad(src, line);
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = quad[i], [bx, by] = quad[(i + 1) % 4];
      thickSegment(out, ax, ay, bx, by, 1.5, [255, 0, 0]);
    }
    const bh = line.box.h * src.height;
    const scale = Math.max(1, Math.round(Math.min(2, Math.max(9 / 7, bh * 0.5 / 7))));
    const label = String(index);
    const chipW = label.length * 6 * scale + 6, chipH = 7 * scale + 4;
    const [qx, qy] = quad[0];
    const bx = Math.round(qx) + 2;
    const by = Math.round(qy) + (bh < chipH + 6 ? Math.round(qy + bh / 2 - chipH / 2) - Math.round(qy) : 2);
    fillRect(out, bx, by, chipW, chipH, [255, 235, 0]);
    drawDigits(out, label, bx + 3, by + 2, scale, [0, 0, 0]);
  }
  return out;
}

export const TRANSCRIBE_SHEET_CAPACITY = 36; // 3 columns x 12 rows
const CROP_TARGET_HEIGHT = 64, CROP_MAX_WIDTH = 560, LABEL_W = 46, CELL_W = LABEL_W + CROP_MAX_WIDTH + 18, CELL_H = CROP_TARGET_HEIGHT + 18, SHEET_COLS = 3;

function bilinear(src: PNG, x: number, y: number, out: number[]) {
  const x0 = Math.floor(x), y0 = Math.floor(y), ax = x - x0, ay = y - y0;
  const at = (xx: number, yy: number) => {
    const cx = Math.min(src.width - 1, Math.max(0, xx)), cy = Math.min(src.height - 1, Math.max(0, yy));
    return (cy * src.width + cx) * 4;
  };
  for (let c = 0; c < 3; c++) {
    const v = (i: number) => src.data[i + c];
    out[c] = v(at(x0, y0)) * (1 - ax) * (1 - ay) + v(at(x0 + 1, y0)) * ax * (1 - ay)
      + v(at(x0, y0 + 1)) * (1 - ax) * ay + v(at(x0 + 1, y0 + 1)) * ax * ay;
  }
}

/** Upright, padded, upscaled crop of one line (the de-rotation contract). */
function lineCrop(src: PNG, line: DetectedTextLine, width: number, height: number) {
  const crop = new PNG({ width, height });
  const pad = 3;
  const bw = Math.max(1, line.box.w * src.width), bh = Math.max(1, line.box.h * src.height);
  const rad = line.angle * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const ox = line.box.x * src.width, oy = line.box.y * src.height;
  const pixel = [0, 0, 0];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x + 0.5) * (bw + 2 * pad) / width - pad, v = (y + 0.5) * (bh + 2 * pad) / height - pad;
    bilinear(src, ox + u * cos - v * sin, oy + u * sin + v * cos, pixel);
    const i = (y * width + x) * 4;
    crop.data[i] = Math.round(pixel[0]); crop.data[i + 1] = Math.round(pixel[1]); crop.data[i + 2] = Math.round(pixel[2]); crop.data[i + 3] = 255;
  }
  return crop;
}

/** Transcription sheets: the id sits OUTSIDE the crop, never over glyphs. */
export function buildTranscribeSheets(src: PNG, lines: DetectedTextLine[], ids: number[]): PNG[] {
  const sheets: PNG[] = [];
  for (let start = 0; start < ids.length; start += TRANSCRIBE_SHEET_CAPACITY) {
    const batch = ids.slice(start, start + TRANSCRIBE_SHEET_CAPACITY);
    const rows = Math.ceil(batch.length / SHEET_COLS);
    const sheet = new PNG({ width: SHEET_COLS * CELL_W + 12, height: rows * CELL_H + 12 });
    fillRect(sheet, 0, 0, sheet.width, sheet.height, [238, 238, 238]);
    for (const [n, id] of batch.entries()) {
      const col = n % SHEET_COLS, row = Math.floor(n / SHEET_COLS);
      const cellX = col * CELL_W + 8, cellY = row * CELL_H + 8;
      drawDigits(sheet, String(id), cellX + 8, cellY + Math.floor((CELL_H - 14) / 2), 2, [0, 0, 0]);
      const line = lines[id];
      const cropH = Math.max(1, Math.round(line.box.h * src.height)) + 6;
      const cropW = Math.max(1, Math.round(line.box.w * src.width)) + 6;
      const scale = Math.max(0.25, Math.min(6, CROP_TARGET_HEIGHT / cropH, CROP_MAX_WIDTH / cropW));
      const w = Math.max(1, Math.min(CROP_MAX_WIDTH, Math.round(cropW * scale)));
      const h = Math.max(1, Math.min(CROP_TARGET_HEIGHT, Math.round(cropH * scale)));
      const crop = lineCrop(src, line, w, h);
      PNG.bitblt(crop, sheet, 0, 0, w, h, cellX + LABEL_W, cellY + Math.max(0, Math.floor((CELL_H - 10 - h) / 2)));
    }
    sheets.push(sheet);
  }
  return sheets;
}
