/**
 * Editor presets.
 * Text, Shapes, and Settings panels plus the text toolbar.
 */

/** BR-ED1: the Text panel has exactly 4 presets. */
export const TEXT_PRESETS = ["textbox", "heading", "subheading", "paragraph"] as const;
export type TextPreset = (typeof TEXT_PRESETS)[number];

export const TEXT_PRESET_SPECS: Record<
  TextPreset,
  { fontSize: number; fontWeight: "normal" | "bold"; label: string }
> = {
  textbox: { fontSize: 18, fontWeight: "normal", label: "Add a textbox" },
  heading: { fontSize: 80, fontWeight: "bold", label: "Add a heading" },
  subheading: { fontSize: 40, fontWeight: "bold", label: "Add a subheading" },
  paragraph: { fontSize: 18, fontWeight: "normal", label: "Paragraph" },
};

/** BR-ED2: the Shapes panel has 9 basic shapes (3 × 3). */
export const SHAPES = [
  "circle", "rectRounded", "rect", "triangleUp", "triangleDown",
  "diamond", "line", "lineDotted", "arrowRight",
] as const;
export type ShapeKind = (typeof SHAPES)[number];

/** BR-ED3: Settings "Recommended Size" presets (px). Stage 0 (Slice 5): Vietnamese marketplace
 *  sizes — sellers think "khung Shopee", not pixel dimensions. Dimensions follow the marketplaces'
 *  current seller guides; re-verified against each seller center when this slice ships.
 *  Codex-channel ratio availability is gated by spike S1's observed set; ratios outside it
 *  route through the zone-anchored crop path (TP.8). */
export const SIZE_PRESETS = {
  "Instagram Post (1:1)": { width: 1080, height: 1080 },
  "Facebook Post (1.91:1)": { width: 1200, height: 630 },
  "YouTube Banner (16:9)": { width: 1920, height: 1080 },
  "YouTube Thumbnail (16:9)": { width: 2560, height: 1440 },
  "Presentation (16:9)": { width: 1920, height: 1080 },
  "Presentation (4:3)": { width: 1024, height: 768 },
  "TikTok (9:16)": { width: 1080, height: 1920 },
  "Shopee Product (1:1)": { width: 1024, height: 1024 },
  "Lazada Product (1:1)": { width: 800, height: 800 },
  "TikTok Shop Product (1:1)": { width: 1080, height: 1080 },
  RedNote: { width: 1242, height: 1660 },
  "A4 (1:1.41)": { width: 2480, height: 3508 },
} as const;
export type SizePresetName = keyof typeof SIZE_PRESETS;

/** Default agent poster size (1360×2048). */
export const DEFAULT_POSTER = { width: 1360, height: 2048 } as const;

/** Custom size with aspect-ratio lock. */
export function resizeWithLock(
  current: { width: number; height: number },
  patch: { width?: number; height: number } | { width: number; height?: number },
): { width: number; height: number } {
  const ratio = current.width / current.height;
  if ("width" in patch && patch.width !== undefined) {
    return { width: patch.width, height: Math.round(patch.width / ratio) };
  }
  const h = (patch as { height: number }).height;
  return { width: Math.round(h * ratio), height: h };
}
