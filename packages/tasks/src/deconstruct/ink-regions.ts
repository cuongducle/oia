import type { PNG } from "pngjs";
import type { DeconstructText } from "@oia/schema";
import { textGeometry as geometry } from "./text-geometry.js";

/** D22: vision boxes can clip descenders; verify the ink extent against original pixels. */
export function refineTextRegions(src: PNG, texts: DeconstructText[], opts: { inkCoverageLimit?: number } = {}): DeconstructText[] {
  // Default 0.5: a seed matching over half the search area is probably the
  // background color. The detector lane's second pass runs with the MEASURED
  // fill and passes a higher limit.
  const inkCoverageLimit = opts.inkCoverageLimit ?? 0.5;
  return texts.map((t) => {
    if (!t.typography || !t.box.w || !t.box.h) return t;
    const g = geometry(t.inkBox ? { ...t, box: t.inkBox } : t, src.width, src.height);
    const fill = t.typography.fill;
    const seed = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16));
    // D22: detector kernels exclude stroke ends and detached accents on ALL sides.
    const margin = t.inkBox ? Math.max(6, g.bh * 1.2) : Math.max(6, g.bh * (g.bh < 40 ? 0.7 : 0.4));
    const topMargin = t.inkBox || g.bh < 40 ? margin : Math.max(3, g.bh * 0.15);
    const sideMargin = t.inkBox ? Math.max(3, g.bh) : Array.from(t.text).length <= 12
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
    // D22: sparse accents outside the kernel are ink, not decorative noise.
    const bands: { start: number; end: number; points: typeof ink }[] = [];
    const maxGap = Math.max(3, g.bh * (t.inkBox ? 0.2 : 0.12));
    const rowCounts = new Map<number, number>();
    for (const p of ink) rowCounts.set(p.v, (rowCounts.get(p.v) ?? 0) + 1);
    const minRowInk = t.inkBox ? 2 : Math.max(g.bw >= 30 ? 2 : 1, Math.ceil(g.bw * 0.01 / step));
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
    if (count < 8 || count > sampledArea * inkCoverageLimit || u1 - u0 < g.bw * 0.4 || v1 - v0 < g.bh * 0.3
      || u1 - u0 > g.bw * 1.4 || v1 - v0 > g.bh * (t.inkBox ? 3.4 : 1.6)) return t;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return { ...t, box: {
      x: clamp((g.x + u0 * g.cos - v0 * g.sin) / src.width),
      y: clamp((g.y + u0 * g.sin + v0 * g.cos) / src.height),
      w: clamp((u1 - u0) / src.width), h: clamp((v1 - v0) / src.height),
    } };
  });
}
