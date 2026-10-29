/**
 * Stage 0 (A2 remediation) — copy-zone geometry lives HERE, in the dependency-free
 * schema package, as the single source of truth shared by:
 * - the clean-plate image prompt (providers/image/codex builds its clause from these numbers)
 * - the textbox placement (agent/copy-zones consumes the same ratios)
 * The prompt text is DERIVED from the geometry, so the two can never drift apart.
 */

export interface ZoneGeometry {
  /** top band: 8–24% of canvas height, full width */
  topBand: { topR: number; heightR: number; widthR: number; leftR: number };
  /** side block: right 34% width, 28–72% height (upper/lower halves) */
  sideBlock: { leftR: number; widthR: number; topR: number; heightR: number };
}

export const COPY_ZONE_GEOMETRY: ZoneGeometry = {
  topBand: { leftR: 0.05, topR: 0.08, widthR: 0.9, heightR: 0.16 },
  sideBlock: { leftR: 0.66, widthR: 0.34, topR: 0.28, heightR: 0.44 },
};

/** The clean-plate calm-space clause, derived from the geometry — never hand-copied. */
export function cleanPlateZoneClause(geo: ZoneGeometry = COPY_ZONE_GEOMETRY): string {
  const bandPct = Math.round(geo.topBand.heightR * 100);
  const sidePct = Math.round(geo.sideBlock.widthR * 100);
  return (
    `Keep the top band (upper ~${bandPct}% of the height) and a right-side column ` +
    `(right ~${sidePct}% of the width) calm and uncluttered so text placed there stays readable.`
  );
}
