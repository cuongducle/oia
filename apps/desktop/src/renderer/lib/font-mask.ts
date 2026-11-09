export interface InkMask { width: number; height: number; data: Uint8Array }

function validate(mask: InkMask) {
  if (mask.width < 1 || mask.height < 1 || mask.data.length !== mask.width * mask.height) throw new Error("Invalid font mask grid");
}

/** Count all candidate ink, including pixels outside the crop, to penalize clipping. */
export function fontMaskPlacement(source: InkMask, candidate: InkMask, x = 0, y = 0, radius = 1) {
  validate(source); validate(candidate);
  const pixels: { x: number; y: number }[] = [];
  let sourceCount = 0;
  for (const v of source.data) sourceCount += Number(v > 0);
  for (let i = 0; i < candidate.data.length; i++) if (candidate.data[i]) pixels.push({ x: i % candidate.width, y: Math.floor(i / candidate.width) });
  let best = { score: 0, x, y };
  if (sourceCount < 8 || pixels.length < 8) return best;
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    let intersection = 0;
    for (const p of pixels) {
      const xx = p.x + x + dx, yy = p.y + y + dy;
      if (xx >= 0 && yy >= 0 && xx < source.width && yy < source.height && source.data[yy * source.width + xx]) intersection++;
    }
    const score = intersection / (sourceCount + pixels.length - intersection);
    if (score > best.score) best = { score, x: x + dx, y: y + dy };
  }
  return best;
}

/** D23: the same upright grid is used for the source and every candidate. */
export function fontMaskScore(source: InkMask, candidate: InkMask): number {
  if (source.width !== candidate.width || source.height !== candidate.height) throw new Error("Font masks must share a grid");
  return fontMaskPlacement(source, candidate).score;
}
