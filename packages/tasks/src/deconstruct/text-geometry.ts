import type { DeconstructText } from "@oia/schema";

export function textGeometry(t: DeconstructText, w: number, h: number) {
  const radians = (t.typography?.angle ?? 0) * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const x = t.box.x * w, y = t.box.y * h, bw = t.box.w * w, bh = t.box.h * h;
  return { x, y, bw, bh, cos, sin };
}
