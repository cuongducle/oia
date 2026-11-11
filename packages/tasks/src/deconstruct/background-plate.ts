import { PNG } from "pngjs";
import type { DeconstructText } from "@oia/schema";
import { textGeometry as geometry } from "./text-geometry.js";

/** D22 detector lane: the provider plate can miss small dense lines (run-02/03
 *  evidence). Rebuild ONLY the flagged regions from their local background
 *  plane, reusing the paid generation; regions without a smooth plane stay as
 *  they are and the gate fails honestly. Returns null when nothing changed. */
export function repairRetainedRegions(src: PNG, plate: PNG, flagged: DeconstructText[]): Uint8Array | null {
  if (!flagged.length) return null;
  const repairable = flagged.filter((t) => {
    const g = geometry(t, src.width, src.height);
    return g.bw > 0 && g.bh > 0 && backgroundPlane(src, g, Math.max(4, Math.min(20, g.bh * 0.4)), t.typography?.fill) !== null;
  });
  if (!repairable.length) return null;
  return composeTextPlate(src, plate, repairable);
}

type Plane = number[][];

/** A smooth background is cheaper and more faithful to reconstruct from its boundary. */
function backgroundPlane(src: PNG, g: ReturnType<typeof geometry>, pad: number, foreground?: string): Plane | null {
  if (!foreground) return null;
  const samples: { u: number; v: number; rgb: number[] }[] = [];
  for (let edge = 0; edge < 4; edge++) for (let n = 0; n <= 48; n++) {
    const fraction = n / 48;
    const u = edge < 2 ? -pad + fraction * (g.bw + 2 * pad) : edge === 2 ? -pad : g.bw + pad;
    const v = edge >= 2 ? -pad + fraction * (g.bh + 2 * pad) : edge === 0 ? -pad : g.bh + pad;
    const x = Math.round(g.x + u * g.cos - v * g.sin), y = Math.round(g.y + u * g.sin + v * g.cos);
    if (x < 0 || y < 0 || x >= src.width || y >= src.height) continue;
    const i = (y * src.width + x) * 4;
    if (src.data[i + 3] < 250) continue;
    samples.push({ u: u / g.bw, v: v / g.bh, rgb: [src.data[i], src.data[i + 1], src.data[i + 2]] });
  }
  if (samples.length < 24) return null;
  const matrix = Array.from({ length: 3 }, () => Array<number>(6).fill(0));
  for (const s of samples) {
    const basis = [s.u, s.v, 1];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) matrix[r][c] += basis[r] * basis[c];
      for (let c = 0; c < 3; c++) matrix[r][c + 3] += basis[r] * s.rgb[c];
    }
  }
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(matrix[r][col]) > Math.abs(matrix[pivot][col])) pivot = r;
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const d = matrix[col][col];
    if (Math.abs(d) < 1e-8) return null;
    for (let c = col; c < 6; c++) matrix[col][c] /= d;
    for (let r = 0; r < 3; r++) if (r !== col) {
      const factor = matrix[r][col];
      for (let c = col; c < 6; c++) matrix[r][c] -= factor * matrix[col][c];
    }
  }
  const plane = matrix.map((row) => row.slice(3));
  let error = 0, worst = 0;
  for (const s of samples) for (let c = 0; c < 3; c++) {
    const diff = Math.abs(s.rgb[c] - (plane[0][c] * s.u + plane[1][c] * s.v + plane[2][c]));
    error += diff; worst = Math.max(worst, diff);
  }
  if (error / (samples.length * 3) > 2.5 || worst > 10) return null;
  const ink = [1, 3, 5].map((i) => parseInt(foreground.slice(i, i + 2), 16));
  let checked = 0, mismatches = 0;
  for (let row = 0; row < 8; row++) for (let col = 0; col < 16; col++) {
    const u = (col + 0.5) / 16, v = (row + 0.5) / 8;
    const x = Math.round(g.x + u * g.bw * g.cos - v * g.bh * g.sin);
    const y = Math.round(g.y + u * g.bw * g.sin + v * g.bh * g.cos);
    if (x < 0 || y < 0 || x >= src.width || y >= src.height) continue;
    const i = (y * src.width + x) * 4;
    if (src.data[i + 3] < 250) continue;
    if (ink.reduce((sum, c, k) => sum + (src.data[i + k] - c) ** 2, 0) <= 65 ** 2) continue;
    const background = ink.map((_, c) => plane[0][c] * u + plane[1][c] * v + plane[2][c]);
    const ray = ink.map((c, k) => c - background[k]);
    const denominator = ray.reduce((sum, c) => sum + c * c, 0);
    const alpha = denominator ? ray.reduce((sum, c, k) => sum + c * (src.data[i + k] - background[k]), 0) / denominator : 0;
    // Antialiasing is a mixture of ink and background, not evidence of texture.
    const residual = ink.reduce((sum, _, k) => sum + (src.data[i + k] - background[k] - alpha * ray[k]) ** 2, 0);
    if (alpha > 0.02 && alpha <= 1.1 && residual <= 100) continue;
    checked++;
    if (background.some((c, k) => Math.abs(src.data[i + k] - c) > 10)) mismatches++;
  }
  return mismatches <= Math.max(1, checked * 0.03) ? plane : null;
}

function generatedPixel(generated: PNG, x: number, y: number, w: number, h: number, channel: number) {
  const gx = Math.max(0, Math.min(generated.width - 1, (x + 0.5) * generated.width / w - 0.5));
  const gy = Math.max(0, Math.min(generated.height - 1, (y + 0.5) * generated.height / h - 0.5));
  const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(x0 + 1, generated.width - 1), y1 = Math.min(y0 + 1, generated.height - 1);
  const fx = gx - x0, fy = gy - y0;
  const sample = (xx: number, yy: number) => generated.data[(yy * generated.width + xx) * 4 + channel];
  return (sample(x0, y0) * (1 - fx) + sample(x1, y0) * fx) * (1 - fy)
    + (sample(x0, y1) * (1 - fx) + sample(x1, y1) * fx) * fy;
}

/** A fully smooth plate needs no paid image generation. Mixed images still use one generation. */
export function localTextPlate(src: PNG, texts: DeconstructText[]): Uint8Array | null {
  const smooth = texts.every((t) => {
    const g = geometry(t, src.width, src.height);
    if (!g.bw || !g.bh) return false;
    return backgroundPlane(src, g, Math.max(4, Math.min(20, g.bh * 0.4)), t.typography?.fill) !== null;
  });
  return smooth ? composeTextPlate(src, src, texts) : null;
}

/** Keep original pixels outside padded, rotated OCR regions, even if imagegen drifts. */
export function composeTextPlate(src: PNG, generated: PNG, texts: DeconstructText[]): Uint8Array {
  const { width: w, height: h } = src;
  const mask = new Uint8Array(w * h);
  const out = new PNG({ width: w, height: h });
  src.data.copy(out.data);
  for (const t of texts) {
    const g = geometry(t, w, h);
    if (g.bw <= 0 || g.bh <= 0) continue;
    const pad = Math.max(4, Math.min(20, g.bh * 0.4));
    const plane = backgroundPlane(src, g, pad, t.typography?.fill);
    const corners = [[-pad, -pad], [g.bw + pad, -pad], [-pad, g.bh + pad], [g.bw + pad, g.bh + pad]];
    const xs = corners.map(([u, v]) => g.x + u * g.cos - v * g.sin);
    const ys = corners.map(([u, v]) => g.y + u * g.sin + v * g.cos);
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(w, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h, Math.ceil(Math.max(...ys)));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - g.x, dy = y + 0.5 - g.y;
      const u = dx * g.cos + dy * g.sin, v = -dx * g.sin + dy * g.cos;
      const edge = Math.min(u + pad, g.bw + pad - u, v + pad, g.bh + pad - v);
      if (edge <= 0) continue;
      const alpha = Math.round(255 * Math.min(1, edge / Math.max(2, pad * 0.8)));
      if (alpha <= mask[y * w + x]) continue;
      mask[y * w + x] = alpha;
      const a = alpha / 255, i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const value = plane ? plane[0][c] * u / g.bw + plane[1][c] * v / g.bh + plane[2][c]
          : generatedPixel(generated, x, y, w, h, c);
        out.data[i + c] = Math.round(src.data[i + c] * (1 - a) + Math.max(0, Math.min(255, value)) * a);
      }
    }
  }
  // Source alpha remains untouched, including inside inpaint regions.
  return PNG.sync.write(out);
}
