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
export function refineTextRegions(src: PNG, texts: DeconstructText[], opts: { inkCoverageLimit?: number } = {}): DeconstructText[] {
  // Default 0.5: a seed matching over half the search area is probably the
  // background color. The detector lane's second pass runs with the MEASURED
  // fill and passes a higher limit.
  const inkCoverageLimit = opts.inkCoverageLimit ?? 0.5;
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
    // D22 detector lane: the kernel box (t.inkBox) is the dense text core the
    // detector fired on. Same-color decor rows outside its vertical range
    // (a band edge 8px above VẮNG KHÁCH?) must carry >= 15% of the peak row
    // density to count; Vietnamese diacritic rows INSIDE the kernel range are
    // always kept (a global density floor cut real accents before).
    if (t.inkBox) {
      const kv = [[0, 0], [0, t.inkBox.h * src.height], [t.inkBox.w * src.width, 0], [t.inkBox.w * src.width, t.inkBox.h * src.height]]
        .map(([u, v]) => v * g.cos - u * g.sin);
      const v0 = Math.min(...kv), v1 = Math.max(...kv);
      const margin = (v1 - v0) * 0.8 + step;
      ink = ink.filter((p) => p.v >= v0 - margin && p.v <= v1 + margin);
    }
    // D22: blank row bands separate neighboring lines even when their ink colors match.
    const bands: { start: number; end: number; points: typeof ink }[] = [];
    const maxGap = Math.max(3, g.bh * 0.12);
    const rowCounts = new Map<number, number>();
    for (const p of ink) rowCounts.set(p.v, (rowCounts.get(p.v) ?? 0) + 1);
    if (t.inkBox) {
      const kv = [[0, 0], [0, t.inkBox.h * src.height], [t.inkBox.w * src.width, 0], [t.inkBox.w * src.width, t.inkBox.h * src.height]]
        .map(([u, v]) => v * g.cos - u * g.sin);
      const v0 = Math.min(...kv), v1 = Math.max(...kv);
      const peak = Math.max(1, ...[...rowCounts.values()]);
      ink = ink.filter((p) => (p.v >= v0 && p.v <= v1) || (rowCounts.get(p.v) ?? 0) >= peak * 0.15);
      for (const band of bands) band.points = band.points.filter((p) => ink.includes(p));
    }
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
    if (count < 8 || count > sampledArea * inkCoverageLimit || u1 - u0 < g.bw * 0.4 || v1 - v0 < g.bh * 0.3
      || u1 - u0 > g.bw * 1.4 || v1 - v0 > g.bh * 1.6) return t;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return { ...t, box: {
      x: clamp((g.x + u0 * g.cos - v0 * g.sin) / src.width),
      y: clamp((g.y + u0 * g.sin + v0 * g.cos) / src.height),
      w: clamp((u1 - u0) / src.width), h: clamp((v1 - v0) / src.height),
    } };
  });
}

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
  // D22 detector lane: kernelInkColor reads glyph color from kernel-vs-annulus
  // concentration (a badge smaller than the padded box breaks every ring
  // estimate); vision-read texts keep the shipped sample(refine(box)) path.
  if (texts.some((t) => t.inkBox)) {
    const colored = texts.map((t) => {
      const measured = kernelInkColor(src, t);
      return measured ? { ...t, typography: { ...t.typography!, fill: measured } } : t;
    });
    // measured fill is never the background color: allow bold glyphs to
    // legitimately cover most of the search area while tightening (VẮNG KHÁCH?
    // and HÀNG NGHÌN stayed 1.24-1.28x too tall under the default 0.5 limit).
    const located = refineTextRegions(src, colored.map((t) => ({ ...t, typography: t.typography })), { inkCoverageLimit: 0.95 });
    const eraseRegions = located.map((t, index) => {
      if (Math.abs(t.typography?.angle ?? 0) > 0.5) return t;
      const boxes = [t.box, texts[index].box];
      const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
      return { ...t, box: { x, y,
        w: Math.min(1 - x, Math.max(...boxes.map(b => b.x + b.w)) - x),
        h: Math.min(1 - y, Math.max(...boxes.map(b => b.y + b.h)) - y),
      } };
    });
    return { texts: located, eraseRegions: mergeEraseRegions(eraseRegions) };
  }
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
  return { texts: located, eraseRegions: mergeEraseRegions(eraseRegions) };
}

/** D22 detector lane: DBNet fragments one visual line into overlapping boxes;
 *  sending duplicates confuses the plate generator (run-02 evidence). Merge
 *  same-band neighbors into one union box; per-line render boxes stay separate. */
export function mergeEraseRegions<T extends DeconstructText>(regions: T[]): T[] {
  type Group = { box: { x: number; y: number; w: number; h: number }; first: T };
  const groups: Group[] = [];
  for (const region of regions) {
    const target = groups.find((group) => {
      const a = group.box, b = region.box;
      const bandOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const minHeight = Math.min(a.h, b.h);
      if (bandOverlap < minHeight * 0.55) return false; // different rows
      const gap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
      return gap < minHeight * 1.2; // same visual line, close enough to merge
    });
    if (!target) { groups.push({ box: { ...region.box }, first: region }); continue; }
    const x = Math.min(target.box.x, region.box.x), y = Math.min(target.box.y, region.box.y);
    target.box = {
      x, y,
      w: Math.max(target.box.x + target.box.w, region.box.x + region.box.w) - x,
      h: Math.max(target.box.y + target.box.h, region.box.y + region.box.h) - y,
    };
  }
  return groups.map((group) => ({ ...group.first, box: group.box }));
}

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
