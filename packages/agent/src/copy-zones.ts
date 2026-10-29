import type { PlanBlock } from "@oia/schema";
import { COPY_ZONE_GEOMETRY, cleanPlateZoneClause } from "@oia/schema";

/**
 * TP.1/TP.3/TP.8 — placement pairs with the clean-plate prompt through the SHARED
 * geometry in @oia/schema (COPY_ZONE_GEOMETRY) — the single source of truth both the
 * prompt clause and this placement derive from, so they cannot drift apart.
 *
 * Zone geometry (Stage-0 design, shared with the crop anchor):
 * - top band   = 8–24% of canvas height, full width
 * - side block = right 34% width, 28–72% height (upper/lower halves)
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

const G = COPY_ZONE_GEOMETRY;
export const COPY_ZONES: Record<ZoneId, ZoneRect> = {
  topBand: { leftR: G.topBand.leftR, topR: G.topBand.topR, widthR: G.topBand.widthR, heightR: G.topBand.heightR },
  sideUpper: { leftR: G.sideBlock.leftR, topR: G.sideBlock.topR, widthR: G.sideBlock.widthR * 0.88, heightR: G.sideBlock.heightR / 2 },
  sideLower: { leftR: G.sideBlock.leftR, topR: G.sideBlock.topR + G.sideBlock.heightR / 2 + 0.01, widthR: G.sideBlock.widthR * 0.88, heightR: G.sideBlock.heightR / 2 - 0.01 },
};

/** The calm-space clause shared with the clean-plate image prompt — re-exported from
 *  @oia/schema (derived from the geometry; never hand-copied). */
export const CLEAN_PLATE_ZONE_CLAUSE = cleanPlateZoneClause();

/** styleHint keywords override the role default — Vietnamese sellers get Vietnamese
 *  hints from the planner ("trên", "bên phải", "dưới"…), so both languages match. */
export function zoneForRole(role: string, styleHint?: string | null): ZoneId {
  const hint = (styleHint ?? "").toLowerCase();
  if (/\btop\b|header|banner strip|tr\u00ean|\u0111\u1ec9nh|\u0111\u1ea7u trang/.test(hint)) return "topBand";
  if (/d\u01b0\u1edbi|\u0111\u00e1y|cu\u1ed1i/.test(hint)) return "sideLower";
  if (/\bside\b|\bright\b|b\u00ean ph\u1ea3i|ph\u1ea3i|g\u00f3c ph\u1ea3i/.test(hint)) {
    return /lower|bottom/.test(hint) ? "sideLower" : "sideUpper";
  }
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
): CoverCrop {
  const imgRatio = imgW / imgH;
  const canvasRatio = canvasW / canvasH;
  const scale = Math.max(canvasW / imgW, canvasH / imgH); // cover
  const cropW = Math.min(imgW, canvasW / scale);
  const cropH = Math.min(imgH, canvasH / scale);

  if (Math.abs(imgRatio - canvasRatio) < 0.01) {
    return { cropX: 0, cropY: 0, cropW: imgW, cropH: imgH, scale };
  }
  if (imgRatio > canvasRatio) {
    // image is wider — horizontal overflow: anchor RIGHT (the sideBlock side)
    return { cropX: imgW - cropW, cropY: 0, cropW, cropH, scale };
  }
  // image is taller — vertical overflow: anchor TOP (the topBand side)
  return { cropX: 0, cropY: 0, cropW, cropH, scale };
}

// NOTE (A7, deferred honestly): "never crop into the reference product's bounding box"
// requires knowing where the product landed in the GENERATED image — no detector exists
// pre-generation and none ships in Stage 0. When a product-bbox source exists (desktop
// era candidate: reference-position echo from the model, or a detection step), add the
// window-shift logic back HERE, next to the anchors above.
