import type { PlanBlock } from "@oia/schema";

/**
 * TP.1/TP.3/TP.8 — the single constants module pairing copy zones between the
 * image-prompt template and textbox placement (prevents prompt/canvas drift).
 *
 * Zone geometry (Stage-0 design, shared with the crop anchor):
 * - top band   = 8–24% of canvas height, full width
 * - side block = right 34% width, 28–72% height
 * Role→zone defaults: headline/title/subtitle → top band; price/discount → side
 * upper; date/name/slogan/unknown → side lower; styleHint overrides the default.
 * Overflow stacks downward with a 4%-height gap, clamped to the canvas.
 */

export type ZoneId = "topBand" | "sideUpper" | "sideLower";

export interface ZoneRect {
  /** ratios of the canvas (0..1) */
  leftR: number;
  topR: number;
  widthR: number;
  heightR: number;
}

export const COPY_ZONES: Record<ZoneId, ZoneRect> = {
  topBand: { leftR: 0.05, topR: 0.08, widthR: 0.9, heightR: 0.16 },
  sideUpper: { leftR: 0.66, topR: 0.28, widthR: 0.3, heightR: 0.22 },
  sideLower: { leftR: 0.66, topR: 0.5, widthR: 0.3, heightR: 0.22 },
};

/** The calm-space clause shared with the clean-plate image prompt (image/codex.ts imports this text's numbers). */
export const CLEAN_PLATE_ZONE_CLAUSE =
  "Keep the top band (upper ~16% of the height) and a right-side column (right ~34% of the width) calm and uncluttered so text placed there stays readable.";

/** styleHint keywords override the role default. */
export function zoneForRole(role: string, styleHint?: string | null): ZoneId {
  const hint = (styleHint ?? "").toLowerCase();
  if (/\btop\b|header|banner strip/.test(hint)) return "topBand";
  if (/\bside\b|\bright\b/.test(hint)) return hint.includes("lower") || hint.includes("bottom") ? "sideLower" : "sideUpper";
  if (/\bbottom\b/.test(hint)) return "sideLower";
  const r = role.toLowerCase();
  if (/headline|^title$|subtitle|slogan/.test(r)) return "topBand";
  if (/price|discount|percent|sale|%/.test(r)) return "sideUpper";
  return "sideLower"; // date / name / unknown
}

/** Default font size (px) per zone role, scaled from canvas height. */
function fontSizeFor(zone: ZoneId, canvasH: number): number {
  switch (zone) {
    case "sideUpper": return Math.round(canvasH * 0.075); // the price is the hero
    case "topBand": return Math.round(canvasH * 0.05);
    default: return Math.round(canvasH * 0.04);
  }
}

export interface PlacedTextBox {
  block: PlanBlock;
  zone: ZoneId;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
}

/** Stack blocks inside their zones (top→down, 4%-height gap), clamped to the canvas. */
export function placeBlocks(blocks: PlanBlock[], canvasW: number, canvasH: number): PlacedTextBox[] {
  const gap = canvasH * 0.04;
  const cursors: Record<ZoneId, number> = {
    topBand: COPY_ZONES.topBand.topR * canvasH,
    sideUpper: COPY_ZONES.sideUpper.topR * canvasH,
    sideLower: COPY_ZONES.sideLower.topR * canvasH,
  };
  const out: PlacedTextBox[] = [];
  for (const block of blocks) {
    const zone = zoneForRole(block.role, block.styleHint);
    const z = COPY_ZONES[zone];
    const width = z.widthR * canvasW;
    const fontSize = fontSizeFor(zone, canvasH);
    const height = Math.max(fontSize * 2.2, canvasH * 0.06); // Textbox height is auto-ish; give generous room
    const left = z.leftR * canvasW;
    let top = cursors[zone];
    // clamp into the canvas
    const maxTop = canvasH * 0.96 - height;
    if (top > maxTop) top = Math.max(0, maxTop);
    cursors[zone] = top + height + gap;
    out.push({ block, zone, left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height), fontSize });
  }
  return out;
}

/**
 * TP.8 size policy — zone-anchored cover-crop for the Codex channel (exact pixels
 * cannot be requested there). Naive cover-crop is REJECTED: it crops into the top
 * band where clean-plate reserves copy zones and can cut the reference product.
 *
 * Policy: keep the side/edge carrying the copy zones (top + right), never crop
 * into the reference product's bounding box (when known), and the canvas keeps
 * its nominal size — the artwork layer is placed to cover with a source-space crop.
 */
export interface CoverCrop {
  /** Source-space crop rect (image px) shown on the canvas. */
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  /** Display scale: cropW·scale === canvasW and cropH·scale === canvasH. */
  scale: number;
}

export function fitCoverWithZones(
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number,
  opts: { protectBox?: { x: number; y: number; w: number; h: number } } = {},
): CoverCrop {
  const imgRatio = imgW / imgH;
  const canvasRatio = canvasW / canvasH;
  const scale = Math.max(canvasW / imgW, canvasH / imgH); // cover
  const cropW = Math.min(imgW, canvasW / scale);
  const cropH = Math.min(imgH, canvasH / scale);

  let cropX = 0;
  let cropY = 0;
  if (Math.abs(imgRatio - canvasRatio) < 0.01) {
    return { cropX: 0, cropY: 0, cropW: imgW, cropH: imgH, scale };
  }
  if (imgRatio > canvasRatio) {
    // image is wider — horizontal overflow: anchor RIGHT (the sideBlock side)
    cropX = imgW - cropW;
    cropY = 0;
  } else {
    // image is taller — vertical overflow: anchor TOP (the topBand side)
    cropX = 0;
    cropY = 0;
  }
  // never crop into the reference product's bounding box (image px) — shift the window if needed
  const b = opts.protectBox;
  if (b) {
    if (imgRatio > canvasRatio && (b.x < cropX || b.x + b.w > cropX + cropW)) {
      cropX = Math.min(Math.max(0, b.x), imgW - cropW);
    }
    if (imgRatio <= canvasRatio && (b.y < cropY || b.y + b.h > cropY + cropH)) {
      cropY = Math.min(Math.max(0, b.y), imgH - cropH);
    }
  }
  return { cropX, cropY, cropW, cropH, scale };
}
