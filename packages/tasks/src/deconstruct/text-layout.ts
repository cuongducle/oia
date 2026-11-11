import type { PNG } from "pngjs";
import type { DeconstructText } from "@oia/schema";
import { kernelInkColor, sampleTextColors } from "./ink-color.js";
import { refineTextRegions } from "./ink-regions.js";

export function prepareDeconstructRegions(src: PNG, texts: DeconstructText[]) {
  // D22 detector lane: kernelInkColor reads glyph color from kernel-vs-annulus
  // concentration (a badge smaller than the padded box breaks every ring
  // estimate); vision-read texts keep the shipped sample(refine(box)) path.
  if (texts.some((t) => t.inkBox)) {
    const colored = texts.map((t) => {
      const measured = kernelInkColor(src, t);
      return measured ? { ...t, typography: { ...t.typography!, fill: measured } } : t;
    });
    // D22: measured colors permit dense bold strokes; disconnected accents
    // still belong to the line even when they cover very few pixels per row.
    const located = refineTextRegions(src, colored, { inkCoverageLimit: 0.95 });
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
