import type { PNG } from "pngjs";
import type { DeconstructText } from "@oia/schema";
import { textGeometry as geometry } from "./text-geometry.js";

/** Shared 4-bit binning with near-neighbor merge: antialiasing splits ONE ink
 *  color across adjacent bins (the red of "VẮNG KHÁCH?" never dominated its
 *  own sibling bin before this merge existed). */
function clusterPixels(pixels: number[][]): number[][][] {
  const bins = new Map<number, number[][]>();
  for (const rgb of pixels) {
    const key = ((rgb[0] >> 4) << 8) | ((rgb[1] >> 4) << 4) | (rgb[2] >> 4);
    bins.set(key, [...(bins.get(key) ?? []), rgb]);
  }
  const keys = [...bins.keys()];
  const parent = new Map(keys.map((k) => [k, k] as const));
  const find = (k: number): number => { while (parent.get(k) !== k) k = parent.get(k)!; return k; };
  const centerOf = (k: number) => [(k >> 8) & 15, (k >> 4) & 15, k & 15].map((v) => v * 16 + 8);
  for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) {
    const ca = centerOf(keys[a]), cb = centerOf(keys[b]);
    if (Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]) <= 40) parent.set(find(keys[a]), find(keys[b]));
  }
  const clusters = new Map<number, number[][]>();
  for (const k of keys) {
    const root = find(k);
    clusters.set(root, [...(clusters.get(root) ?? []), ...bins.get(k)!]);
  }
  return [...clusters.values()].sort((a, b) => b.length - a.length);
}


/** D22 detector lane ink color. Ring estimates around the PADDED box straddle
 *  badge/band edges; the strips immediately above and below the KERNEL box are
 *  the line's own background (badge, band or page). Ink = the largest merged
 *  cluster inside the kernel clearly past that background. */
export function kernelInkColor(src: PNG, text: DeconstructText): string | null {
  if (!text.inkBox || !text.typography) return null;
  const kernel = geometry({ ...text, box: text.inkBox }, src.width, src.height);
  const rad = (text.typography.angle ?? 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  if (kernel.bw < 2 || kernel.bh < 2) return null;
  const strip = kernel.bh * 0.35;
  const at = (u: number, v: number) => {
    const x = Math.round(kernel.x + u * kernel.cos - v * kernel.sin);
    const y = Math.round(kernel.y + u * kernel.sin + v * kernel.cos);
    if (x < 0 || y < 0 || x >= src.width || y >= src.height) return null;
    const i = (y * src.width + x) * 4;
    return src.data[i + 3] < 200 ? null : [src.data[i], src.data[i + 1], src.data[i + 2]];
  };
  const step = Math.max(1, Math.ceil(kernel.bw / 96));
  const background: number[][] = [];
  const inside: number[][] = [];
  for (let u = 0; u <= kernel.bw; u += step) {
    for (const v0 of [-strip, kernel.bh]) {
      for (let d = 0; d < strip; d += Math.max(1, step)) {
        const px = at(u, v0 + (v0 < 0 ? -d : d));
        if (px) background.push(px);
      }
    }
  }
  const innerStep = Math.max(1, Math.ceil(Math.sqrt(kernel.bw * kernel.bh / 12000)));
  for (let v = 0; v < kernel.bh; v += innerStep) for (let u = 0; u < kernel.bw; u += innerStep) {
    const px = at(u, v);
    if (px) inside.push(px);
  }
  if (background.length < 8 || inside.length < 8) return null;
  const bgCluster = clusterPixels(background)[0];
  if (!bgCluster) return null;
  const bg = [0, 1, 2].map((c) => bgCluster.reduce((s, p) => s + p[c], 0) / bgCluster.length);
  const far = inside.filter((p) => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]) >= 70);
  if (far.length < 8) return null;
  const winner = clusterPixels(far)[0];
  if (!winner || winner.length < 8 || winner.length > inside.length * 0.95) return null;
  // Antialias blends dilute a plain median toward the background; the ink truth
  // lives at the far end: median of the quartile FARTHEST from the background.
  const byDistance = [...winner].sort((a, b) =>
    Math.hypot(b[0] - bg[0], b[1] - bg[1], b[2] - bg[2]) - Math.hypot(a[0] - bg[0], a[1] - bg[1], a[2] - bg[2]));
  const core = byDistance.slice(0, Math.max(4, Math.ceil(winner.length * 0.25)));
  const fill = "#" + [0, 1, 2].map((c) => {
    const sorted = core.map((p) => p[c]).sort((a, b) => a - b);
    return Math.round(sorted[Math.floor(sorted.length / 2)]).toString(16).padStart(2, "0");
  }).join("");
  return fill;
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
        // Textured backgrounds scatter many stray "far" colors; the ink is the
        // DOMINANT merged cluster among them (clusterPixels folds antialiasing
        // siblings so one ink color can actually dominate its own fragments).
        const ranked = clusterPixels(inks);
        const seed = [1, 3, 5].map((i) => parseInt(style.fill.slice(i, i + 2), 16));
        const supported = ranked.find(bin => bin.length >= Math.max(8, ranked[0].length * 0.5)
          && seed.reduce((s, c, k) => s + (bin[0][k] - c) ** 2, 0) < 65 ** 2);
        const winner = supported ?? ranked[0], runnerUp = ranked[1] ?? [];
        // D22: confirmed seed-colored ink wins over a large patch of exposed background.
        if (winner && winner.length >= 8 && (supported || winner.length >= 1.5 * runnerUp.length)
          && winner.length < Math.ceil(g.bw / step) * Math.ceil(g.bh / step) * 0.65) {
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
