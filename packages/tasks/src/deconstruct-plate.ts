import { PNG } from "pngjs";
import type { DeconstructText } from "@oia/schema";

// D22: bound decompression before allocating RGBA buffers, including provider output.
export function readDeconstructPng(bytes: Uint8Array): PNG {
  const b = Buffer.from(bytes);
  if (b.length < 24 || !b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("Make text editable requires a PNG image. Export or convert the image to PNG first.");
  }
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (!w || !h || w * h > 24_000_000) throw new Error("The image exceeds the 24 megapixel text-editing limit.");
  return PNG.sync.read(b);
}

function geometry(t: DeconstructText, w: number, h: number) {
  const radians = (t.typography?.angle ?? 0) * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const x = t.box.x * w, y = t.box.y * h, bw = t.box.w * w, bh = t.box.h * h;
  return { x, y, bw, bh, cos, sin };
}

/** D22: vision boxes can clip descenders; verify the ink extent against original pixels. */
export function refineTextRegions(src: PNG, texts: DeconstructText[]): DeconstructText[] {
  return texts.map((t) => {
    if (!t.typography || !t.box.w || !t.box.h) return t;
    const g = geometry(t, src.width, src.height);
    const fill = t.typography.fill;
    const seed = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16));
    const margin = Math.max(6, g.bh * (g.bh < 40 ? 0.7 : 0.4));
    const topMargin = g.bh < 40 ? margin : Math.max(3, g.bh * 0.15);
    const sideMargin = Array.from(t.text).length <= 12
      ? Math.max(3, Math.min(g.bw * 0.4, g.bh * 1.5))
      : Math.max(3, Math.min(g.bw * 0.1, g.bh * 0.8));
    const step = Math.max(1, Math.ceil(Math.sqrt((g.bw + 2 * sideMargin) * (g.bh + 2 * margin) / 120000)));
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity, count = 0;
    let ink: { u: number; v: number }[] = [];
    for (let v = -topMargin; v < g.bh + margin; v += step) for (let u = -sideMargin; u < g.bw + sideMargin; u += step) {
      const x = Math.round(g.x + u * g.cos - v * g.sin), y = Math.round(g.y + u * g.sin + v * g.cos);
      if (x < 0 || y < 0 || x >= src.width || y >= src.height) continue;
      const i = (y * src.width + x) * 4;
      if (src.data[i + 3] < 200) continue;
      const distance = seed.reduce((sum, c, k) => sum + (src.data[i + k] - c) ** 2, 0);
      if (distance > 40 ** 2) continue;
      ink.push({ u, v });
    }
    // D22: recover a clipped word edge, but do not absorb a separate same-color icon.
    const columns = new Map<number, number>();
    for (const p of ink) columns.set(p.u, (columns.get(p.u) ?? 0) + 1);
    const occupied = [...columns].filter(([, count]) => count >= 2).map(([u]) => u);
    const gap = Math.max(3, g.bh * 0.12);
    let leftLimit = 0, rightLimit = g.bw;
    for (const u of occupied.filter(u => u < 0).sort((a, b) => b - a)) {
      if (leftLimit - u > gap + step) break;
      leftLimit = u;
    }
    for (const u of occupied.filter(u => u > g.bw).sort((a, b) => a - b)) {
      if (u - rightLimit > gap + step) break;
      rightLimit = u;
    }
    ink = ink.filter(p => p.u >= leftLimit && p.u <= rightLimit);
    // D22: blank row bands separate neighboring lines even when their ink colors match.
    const bands: { start: number; end: number; points: typeof ink }[] = [];
    const maxGap = Math.max(3, g.bh * 0.12);
    const rowCounts = new Map<number, number>();
    for (const p of ink) rowCounts.set(p.v, (rowCounts.get(p.v) ?? 0) + 1);
    const minRowInk = Math.max(g.bw >= 30 ? 2 : 1, Math.ceil(g.bw * 0.01 / step));
    for (const p of ink) {
      if ((rowCounts.get(p.v) ?? 0) < minRowInk) continue;
      const band = bands[bands.length - 1];
      if (!band || p.v - band.end > maxGap + step) bands.push({ start: p.v, end: p.v, points: [p] });
      else { band.end = p.v; band.points.push(p); }
    }
    // D22: a larger neighboring headline must not steal the OCR line's box.
    const overlap = (b: typeof bands[number]) => Math.max(0, Math.min(g.bh, b.end + step) - Math.max(0, b.start));
    const candidates = bands.filter((b) => overlap(b) >= Math.min(g.bh * 0.25, (b.end - b.start + step) * 0.5));
    const band = candidates.sort((a, b) => {
      const coverage = (b: typeof bands[number]) => overlap(b) / (b.end - b.start + step);
      return coverage(b) - coverage(a) || b.points.length - a.points.length;
    })[0] ?? (g.bh < 40 ? bands.sort((a, b) => Math.abs((a.start + a.end) / 2 - g.bh / 2) - Math.abs((b.start + b.end) / 2 - g.bh / 2))[0] : undefined);
    for (const { u, v } of band?.points ?? []) {
      u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u + step + 0.5); v1 = Math.max(v1, v + step + 0.5); count++;
    }
    // A speck matching the seed is not evidence for replacing a whole line's box.
    const sampledArea = (g.bw + 2 * sideMargin) * (g.bh + 2 * margin) / (step * step);
    if (count < 8 || count > sampledArea * 0.5 || u1 - u0 < g.bw * 0.4 || v1 - v0 < g.bh * 0.3
      || u1 - u0 > g.bw * 1.4 || v1 - v0 > g.bh * 1.6) return t;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return { ...t, box: {
      x: clamp((g.x + u0 * g.cos - v0 * g.sin) / src.width),
      y: clamp((g.y + u0 * g.sin + v0 * g.cos) / src.height),
      w: clamp((u1 - u0) / src.width), h: clamp((v1 - v0) / src.height),
    } };
  });
}

/** Measure the ink color from pixels: the cluster far from the LOCAL background, never the vision seed. */
export function sampleTextColors(src: PNG, texts: DeconstructText[]): DeconstructText[] {
  return texts.map((t) => {
    if (!t.typography) return t;
    const style = t.typography;
    const g = geometry(t, src.width, src.height);
    const pad = Math.max(2, g.bh * 0.25);
    const ring: number[][] = [];
    const ringStep = Math.max(1, Math.ceil((g.bw + 2 * pad) / 96));
    for (let v = -pad; v < g.bh + pad; v += ringStep) {
      const bandRow = v < 0 || v >= g.bh;
      for (let u = -pad; u < g.bw + pad; u += ringStep) {
        if (!bandRow && u >= 0 && u < g.bw) continue;
        const x = Math.round(g.x + u * g.cos - v * g.sin), y = Math.round(g.y + u * g.sin + v * g.cos);
        if (x < 0 || y < 0 || x >= src.width || y >= src.height) continue;
        const i = (y * src.width + x) * 4;
        if (src.data[i + 3] < 250) continue;
        ring.push([src.data[i], src.data[i + 1], src.data[i + 2]]);
      }
    }
    if (ring.length >= 12) {
      const bg = [0, 1, 2].map((c) => [...ring].sort((a, b) => a[c] - b[c])[Math.floor(ring.length / 2)][c]);
      const inks: number[][] = [];
      const step = Math.max(1, Math.ceil(Math.sqrt(g.bw * g.bh / 16000)));
      for (let v = 0; v < g.bh; v += step) for (let u = 0; u < g.bw; u += step) {
        const x = Math.round(g.x + u * g.cos - v * g.sin), y = Math.round(g.y + u * g.sin + v * g.cos);
        if (x < 0 || y < 0 || x >= src.width || y >= src.height) continue;
        const i = (y * src.width + x) * 4;
        if (src.data[i + 3] < 200) continue;
        const rgb = [src.data[i], src.data[i + 1], src.data[i + 2]];
        // Only pixels clearly past the background qualify as ink; the band between keeps anti-aliased edges out.
        if (rgb.reduce((d, c, k) => d + (c - bg[k]) ** 2, 0) < 70 ** 2) continue;
        inks.push(rgb);
      }
      if (inks.length >= 3) {
        // Textured backgrounds scatter many stray "far" colors; the ink is the DOMINANT cluster among them.
        const bins = new Map<number, number[][]>();
        for (const rgb of inks) {
          const key = ((rgb[0] >> 4) << 8) | ((rgb[1] >> 4) << 4) | (rgb[2] >> 4);
          bins.set(key, [...(bins.get(key) ?? []), rgb]);
        }
        const ranked = [...bins.values()].sort((a, b) => b.length - a.length);
        const seed = [1, 3, 5].map((i) => parseInt(style.fill.slice(i, i + 2), 16));
        const supported = ranked.find(bin => bin.length >= Math.max(8, ranked[0].length * 0.5)
          && seed.reduce((s, c, k) => s + (bin[0][k] - c) ** 2, 0) < 65 ** 2);
        const winner = supported ?? ranked[0], runnerUp = ranked[1] ?? [];
        // D22: confirmed seed-colored ink wins over a large patch of exposed background.
        if (winner && winner.length >= 8 && (supported || winner.length >= 1.5 * runnerUp.length)
          && winner.length < Math.ceil(g.bw / step) * Math.ceil(g.bh / step) * 0.5) {
          const fill = "#" + [0, 1, 2].map((c) => {
            const sorted = winner.map((p) => p[c]).sort((a, b) => a - b);
            return Math.round(sorted[Math.floor(sorted.length / 2)]).toString(16).padStart(2, "0");
          }).join("");
          return { ...t, typography: { ...style, fill } };
        }
      }
    }
    // Degenerate box or low-contrast ink: the vision estimate is the only remaining evidence.
    return t;
  });
}

/** D22: reject surviving stroke contrast, including recolored glyphs. Not an OCR completeness proof. */
export function retainedTextRegions(src: PNG, plate: PNG, texts: DeconstructText[]): number[] {
  if (src.width !== plate.width || src.height !== plate.height) throw new Error("Text plate dimensions do not match the source.");
  const distance = (image: PNG, a: number, b: number) => Math.hypot(
    image.data[a] - image.data[b], image.data[a + 1] - image.data[b + 1], image.data[a + 2] - image.data[b + 2],
  );
  return texts.flatMap((t, index) => {
    const g = geometry(t, src.width, src.height);
    const fill = t.typography?.fill;
    const ink = fill ? [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16)) : null;
    const step = Math.max(1, Math.ceil(Math.sqrt(g.bw * g.bh / 16000)));
    const positions: number[] = [];
    let matching = 0;
    const nearInk = (i: number) => ink !== null && Math.hypot(...ink.map((c, k) => src.data[i + k] - c)) <= 45;
    for (let v = 0; v < g.bh; v += step) for (let u = 0; u < g.bw; u += step) {
      const x = Math.round(g.x + u * g.cos - v * g.sin), y = Math.round(g.y + u * g.sin + v * g.cos);
      if (x < 0 || y < 0 || x >= src.width || y >= src.height) continue;
      const i = (y * src.width + x) * 4;
      if (src.data[i + 3] < 200) continue;
      positions.push(i);
      if (nearInk(i)) matching++;
    }
    // An unsupported/dominant seed is not permission to accept an unchanged image.
    const supported = matching >= 12 && matching < positions.length * 0.65;
    let edges = 0, retained = 0;
    for (const i of positions) {
      if (supported && !nearInk(i)) continue;
      const x = i / 4 % src.width, y = Math.floor(i / 4 / src.width);
      let strongest = 0, neighbor = -1;
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= src.width || yy >= src.height) continue;
        const j = (yy * src.width + xx) * 4;
        if (src.data[j + 3] < 200) continue;
        const contrast = distance(src, i, j);
        if (contrast > strongest) { strongest = contrast; neighbor = j; }
      }
      if (strongest < 45 || neighbor < 0) continue;
      edges++;
      if (distance(plate, i, neighbor) >= Math.max(20, strongest * 0.2)) retained++;
    }
    return edges >= 8 && retained >= 8 && retained / edges > 0.15 ? [index] : [];
  });
}

export function prepareDeconstructRegions(src: PNG, texts: DeconstructText[]) {
  const located = sampleTextColors(src, refineTextRegions(src, texts));
  // Erase must cover both the measured ink and the seed box; a clipped seed box
  // must not leave edge ink behind while the renderer trusts the measured one.
  const eraseRegions = located.map((t, index) => {
    if (Math.abs(t.typography?.angle ?? 0) > 0.5) return t;
    const boxes = [t.box, texts[index].box];
    const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
    return { ...t, box: { x, y,
      w: Math.min(1 - x, Math.max(...boxes.map(b => b.x + b.w)) - x),
      h: Math.min(1 - y, Math.max(...boxes.map(b => b.y + b.h)) - y),
    } };
  });
  return { texts: located, eraseRegions };
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
