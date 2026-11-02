import { CREATE_SIZES } from "./create-sheet.js";

/**
 * UI v1.1 R6 — the composer's size pill resolves to real dimensions the same way
 * the Create sheet's "Start from a size" lane does: platform presets grouped the
 * way sellers name them, plus the plain ratios. One source of truth (CREATE_SIZES);
 * only the official covers keep the ★ (LV-10) when shown as options.
 */

export const SIZE_GROUPS: { name: string; items: { id: string; label: string; w: number; h: number; official: boolean }[] }[] =
  CREATE_SIZES.map((g) => ({ name: g.name, items: g.items.map((a) => ({ id: a.id, label: a.label, w: a.w, h: a.h, official: a.official })) }));

const PLATFORM: Record<string, { w: number; h: number }> = Object.fromEntries(
  SIZE_GROUPS.flatMap((g) => g.items.map((a) => [a.id, { w: a.w, h: a.h }])),
);

/** "auto" → null (provider default); plain ratios → their generator dims; platform ids → the preset's pixels. */
export function sizeDims(key: string, ratios: Record<string, [number, number] | null>): [number, number] | null {
  if (key === "auto") return null;
  if (key in ratios) return ratios[key];
  const p = PLATFORM[key];
  return p ? [p.w, p.h] : null;
}

export function sizeLabel(key: string): string | null {
  for (const g of SIZE_GROUPS) {
    const hit = g.items.find((a) => a.id === key);
    if (hit) return hit.label;
  }
  return null;
}
