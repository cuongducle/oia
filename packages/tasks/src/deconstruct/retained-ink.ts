import type { PNG } from "pngjs";
import type { DeconstructText } from "@oia/schema";
import { textGeometry as geometry } from "./text-geometry.js";

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
