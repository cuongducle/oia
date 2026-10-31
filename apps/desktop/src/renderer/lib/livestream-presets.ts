/**
 * C3 — Live-commerce overlay presets, template pack, and safe-zone data
 * (live-overlay-presets.md). Data only, no component imports: consumed by the
 * Workspace "New" menu, the Editor Templates panel, and the guide overlay.
 *
 * Honesty rules (LV-10): only the two cover presets are "official" — overlay
 * sizes are OBS practice, never a platform requirement; zone numbers carry
 * their confidence label and the sources live in the design doc.
 */
import type { FabricObject, SceneCanvas, Template } from "@oia/schema";

const SCENE_VERSION = "6.9.1"; // matches every scene this app writes

function clip(w: number, h: number, fill: string): FabricObject {
  return { type: "Rect", name: "clip", left: 0, top: 0, width: w, height: h, fill, selectable: false };
}

export interface LiveArtboard {
  id: string;
  label: string;
  sub: string;
  projectName: string;
  w: number;
  h: number;
  /** transparent overlay vs. opaque cover — LV-3. */
  transparent: boolean;
  /** Only covers cite an official platform spec — LV-10. */
  official: boolean;
}

/** Workspace "New" preset menu entries — LV-2. Blank canvas is handled separately (default artboard). */
export const LIVE_ARTBOARDS: LiveArtboard[] = [
  {
    id: "live-overlay-916",
    label: "Livestream overlay",
    sub: "1080 × 1920 · transparent · for OBS & streaming apps",
    projectName: "Livestream overlay",
    w: 1080,
    h: 1920,
    transparent: true,
    official: false,
  },
  {
    id: "shopee-live-cover",
    label: "Shopee live cover",
    sub: "500 × 500 · official spec",
    projectName: "Shopee live cover",
    w: 500,
    h: 500,
    transparent: false,
    official: true,
  },
  {
    id: "tiktok-live-cover",
    label: "TikTok live cover",
    sub: "1080 × 1920 · official spec",
    projectName: "TikTok live cover",
    w: 1080,
    h: 1920,
    transparent: false,
    official: true,
  },
];

/** The clip Rect is the document ground truth (TP.3) — fill "transparent" is a
 * legal artboard ground since C3 (LV-3). */
export function liveArtboardScene(a: LiveArtboard): SceneCanvas {
  return { version: SCENE_VERSION, objects: [clip(a.w, a.h, a.transparent ? "transparent" : "white")] };
}

// ---------------------------------------------------------------------------
// Safe-zone guides (LV-5): fractions of the artboard, so they scale with it.
// Numbers + sources: live-overlay-presets.md "Nguồn safe-zone".
// ---------------------------------------------------------------------------

export type ZoneEdge = "top" | "bottom" | "left" | "right";

export interface SafeZone {
  edge: ZoneEdge;
  /** Blocked band height (top/bottom) or width (left/right) as a fraction of that dimension. */
  fraction: number;
}

export interface LiveGuide {
  platform: "tiktok" | "shopee";
  label: string;
  note: string;
  confidence: "measured" | "estimate";
  zones: SafeZone[];
}

export const LIVE_GUIDES: Record<"tiktok" | "shopee", LiveGuide> = {
  tiktok: {
    platform: "tiktok",
    label: "TikTok",
    note: "Community-measured — TikTok publishes no official overlay spec.",
    confidence: "measured",
    zones: [
      { edge: "top", fraction: 0.0677 }, // ~130 px on 1080×1920
      { edge: "bottom", fraction: 0.25 }, // ~480 px
      { edge: "left", fraction: 0.0556 }, // ~60 px
      { edge: "right", fraction: 0.1111 }, // ~120 px
    ],
  },
  shopee: {
    platform: "shopee",
    label: "Shopee",
    note: "Estimated from the app's UI layout — no public measurement exists.",
    confidence: "estimate",
    zones: [
      { edge: "top", fraction: 0.0625 }, // ~120 px
      { edge: "bottom", fraction: 0.2708 }, // ~520 px
      { edge: "right", fraction: 0.1296 }, // ~140 px
    ],
  },
};

// ---------------------------------------------------------------------------
// Overlay template pack (LV-8) — native text on a transparent 1080×1920
// artboard. All content sits inside the TikTok safe band (top 130 … 1440) so a
// freshly applied template never lands in a blocked zone by default.
// Seller copy is Vietnamese (D8: content-level); colors reuse app tokens
// (--danger #dc2626, --accent #7050e5, --ink #242529, --success-ink #2f6e4b).
// ---------------------------------------------------------------------------

const W = 1080;
const H = 1920;

function text(value: string, x: number, y: number, width: number, size: number, color: string, extra: Record<string, unknown> = {}): FabricObject {
  return { type: "Textbox", text: value, left: x, top: y, width, fontSize: size, fill: color, fontFamily: "Be Vietnam Pro", textAlign: "center", ...extra };
}

function livestreamTemplate(id: string, name: string, objects: FabricObject[]): Template {
  return {
    id: `live-${id}`,
    name,
    authorName: "Oia Studio",
    featured: false,
    tipCredits: 0,
    category: "livestream",
    createdAt: 0,
    scene: { version: SCENE_VERSION, objects: [clip(W, H, "transparent"), ...objects] },
  };
}

export const LIVESTREAM_TEMPLATES: Template[] = [
  livestreamTemplate("flash-sale", "Flash sale price", [
    { type: "Rect", left: 90, top: 760, width: 900, height: 400, rx: 24, ry: 24, fill: "#dc2626" },
    text("FLASH SALE", 90, 806, 900, 44, "#ffffff", { fontWeight: 700, charSpacing: 120 }),
    text("299.000₫", 90, 886, 900, 42, "#ffd9d9", { linethrough: true }),
    text("199.000₫", 90, 962, 900, 118, "#ffffff", { fontWeight: 800, lineHeight: 0.95 }),
  ]),
  livestreamTemplate("freeship", "Freeship badge", [
    { type: "Rect", left: 90, top: 1170, width: 640, height: 150, rx: 75, ry: 75, fill: "#2f6e4b" },
    text("FREESHIP ĐƠN 0Đ", 90, 1207, 640, 52, "#ffffff", { fontWeight: 800, charSpacing: 40 }),
    text("Áp dụng cho mọi đơn hôm nay", 90, 1348, 640, 34, "#2f6e4b"),
  ]),
  livestreamTemplate("countdown", "Countdown frame", [
    text("DEAL CHỈ TRONG", 90, 810, 900, 42, "#242529", { charSpacing: 100, fontWeight: 600 }),
    { type: "Rect", left: 90, top: 900, width: 260, height: 180, rx: 20, ry: 20, fill: "#7050e5" },
    { type: "Rect", left: 410, top: 900, width: 260, height: 180, rx: 20, ry: 20, fill: "#7050e5" },
    { type: "Rect", left: 730, top: 900, width: 260, height: 180, rx: 20, ry: 20, fill: "#7050e5" },
    text("11", 90, 928, 260, 92, "#ffffff", { fontWeight: 800 }),
    text("59", 410, 928, 260, 92, "#ffffff", { fontWeight: 800 }),
    text("09", 730, 928, 260, 92, "#ffffff", { fontWeight: 800 }),
    text("giờ", 90, 1092, 260, 32, "#242529" ),
    text("phút", 410, 1092, 260, 32, "#242529" ),
    text("giây", 730, 1092, 260, 32, "#242529" ),
  ]),
];
