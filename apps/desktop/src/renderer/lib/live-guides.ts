/**
 * C3 — safe-zone guide math + preference (live-overlay-presets.md LV-4..LV-6,
 * LV-11). Pure functions: the Editor renders the returned rects as a DOM
 * layer (never fabric objects — guides cannot enter a scene by construction).
 */
import { LIVE_GUIDES, type SafeZone } from "./livestream-presets.js";

export type GuidePlatform = "tiktok" | "shopee" | "off";

export interface GuideRect {
  edge: "top" | "bottom" | "left" | "right";
  /** Pixel rect on the artboard (pre-zoom). */
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Blocked bands in artboard pixels — one rect per zone, always inside the canvas. */
export function guideRects(zones: SafeZone[], w: number, h: number): GuideRect[] {
  return zones.map((z) => {
    // Round to whole artboard pixels — the measured TikTok bands are 130/480/60/120
    // on 1080×1920, and 0.0677×1920 must land on exactly 130, not 129.98.
    const span = Math.round(Math.max(0, Math.min(z.fraction, 1) * (z.edge === "top" || z.edge === "bottom" ? h : w)));
    switch (z.edge) {
      case "top":
        return { edge: z.edge, left: 0, top: 0, width: w, height: span };
      case "bottom":
        return { edge: z.edge, left: 0, top: h - span, width: w, height: span };
      case "left":
        return { edge: z.edge, left: 0, top: 0, width: span, height: h };
      case "right":
        return { edge: z.edge, left: w - span, top: 0, width: span, height: h };
    }
  });
}

export function guideFor(platform: Exclude<GuidePlatform, "off">) {
  return LIVE_GUIDES[platform];
}

/** UI preference (not a record) — same pattern as the outline-gate switch (OC-6).
 * Default OFF (LV-11): guides are an aid, not a warning the user never asked for. */
export const GUIDE_STORAGE_KEY = "oia.liveGuides";
export const GUIDE_DEFAULT: GuidePlatform = "off";

export function readGuidePref(storage: Pick<Storage, "getItem"> = globalThis.localStorage): GuidePlatform {
  let raw: string | null;
  try {
    raw = storage.getItem(GUIDE_STORAGE_KEY);
  } catch {
    return GUIDE_DEFAULT; // denied/broken storage never blocks editing — the pref is cosmetic
  }
  if (raw === "tiktok" || raw === "shopee" || raw === "off") return raw;
  return GUIDE_DEFAULT;
}

export function writeGuidePref(p: GuidePlatform, storage: Pick<Storage, "setItem"> = globalThis.localStorage): void {
  try {
    storage.setItem(GUIDE_STORAGE_KEY, p);
  } catch {
    // A read-only or full storage never blocks editing — the pref is cosmetic.
  }
}
