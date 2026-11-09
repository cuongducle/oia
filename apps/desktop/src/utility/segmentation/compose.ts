/** Pure post-processing for segment-image (D21): mask logits → cutout PNG bytes.
 *  Everything here is synchronous and dependency-free except pngjs (encode),
 *  so the quality-critical math is unit-testable without any model file. */
import { PNG } from "pngjs";

/** bilinear sample from a 288×288 mask grid to source resolution (no aligned
 *  corners, the same scheme the PoC validated against the reference). */
export function upsampleMask(logits: Float32Array, grid: number, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const gx = (grid - 1) / Math.max(1, w - 1);
  const gy = (grid - 1) / Math.max(1, h - 1);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(grid - 1.0001, y * gy);
    const y0 = Math.floor(fy), y1 = Math.min(grid - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(grid - 1.0001, x * gx);
      const x0 = Math.floor(fx), x1 = Math.min(grid - 1, x0 + 1), wx = fx - x0;
      const a = logits[y0 * grid + x0], b = logits[y0 * grid + x1];
      const c = logits[y1 * grid + x0], d = logits[y1 * grid + x1];
      out[y * w + x] = (a + (b - a) * wx + (c - a) * wy + (a - b - c + d) * wx * wy) > 0 ? 255 : 0;
    }
  }
  return out;
}

/** RGBA cutout: original pixels, mask as alpha. Sizes must match (both come from
 *  the same decoded PNG). Returns PNG bytes ready for the file store. */
export function composeCutout(rgba: Uint8Array, mask: Uint8Array, w: number, h: number): Uint8Array {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = rgba[i * 4];
    png.data[i * 4 + 1] = rgba[i * 4 + 1];
    png.data[i * 4 + 2] = rgba[i * 4 + 2];
    png.data[i * 4 + 3] = mask[i];
  }
  return PNG.sync.write(png);
}

/** Squash-resize RGBA to 1008×1008 and normalize to (x-0.5)/0.5 CHW float32,
 *  the exact preprocessing the ONNX PoC validated. */
export function preprocess(rgba: Uint8Array, w: number, h: number): Float32Array {
  const S = 1008, n = S * S, out = new Float32Array(3 * n);
  const fx = w / S, fy = h / S;
  for (let y = 0; y < S; y++) {
    const sy = Math.min(h - 1, Math.floor((y + 0.5) * fy));
    for (let x = 0; x < S; x++) {
      const sx = Math.min(w - 1, Math.floor((x + 0.5) * fx));
      const si = (sy * w + sx) * 4, di = y * S + x;
      out[di] = (rgba[si] / 255 - 0.5) / 0.5;
      out[n + di] = (rgba[si + 1] / 255 - 0.5) / 0.5;
      out[2 * n + di] = (rgba[si + 2] / 255 - 0.5) / 0.5;
    }
  }
  return out;
}

/** Tight-ish box fractions (xyxy, 0..1) from a binary mask; full frame if empty. */
export function maskBox(mask: Uint8Array, w: number, h: number): [number, number, number, number] {
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < x0) return [0, 0, 1, 1];
  return [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h];
}
