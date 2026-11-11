/** DBNet text-line detector (D22 detector lane, owner decision 2026-11-11).
 *
 * Architecture mirrors SAM/Lens: the ONNX session runs in the native sidecar
 * (ORT does not belong inside an Electron-linked process); preprocess and the
 * DB postprocess live here in pure TS, deterministic and unit-testable.
 * Parameters reproduce RapidOCR's wheel config, the exact setup benchmarked
 * 45/45 on the owner image (docs/private/real-runs/2026-11-11-text-detectors):
 * limit_side_len 736 "min", thresh 0.3, box_thresh 0.5, unclip 1.6, dilation.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import type { DetectedTextLine, TextDetector } from "@oia/tasks";
import { f32ToB64, b64ToF32, type SegmentRunner } from "./segmentation/runner.js";

export const DET_LIMIT_SIDE = 736;
const THRESH = 0.3;
const BOX_THRESH = 0.5;
const UNCLIP_RATIO = 1.6;
const MAX_CANDIDATES = 1000;
const MIN_SIZE = 3;

interface Manifest { files: Record<string, string> }

/** RapidOCR DetPreProcess: upscale so the shorter side >= 736, round to /32,
 *  normalize (x/255 - 0.5)/0.5, NCHW. Returns the tensor and the model grid. */
export function detTensor(src: PNG): { data: Float32Array; width: number; height: number } {
  let ratio = 1;
  if (Math.min(src.height, src.width) < DET_LIMIT_SIDE) ratio = DET_LIMIT_SIDE / Math.min(src.height, src.width);
  // Python round() rounds ties to even; matching it keeps grid parity with the
  // benchmarked RapidOCR setup (JS Math.round would go one 32-step up on ties).
  const to32 = (v: number) => {
    const steps = v / 32, floor = Math.floor(steps);
    const rounded = steps - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(steps);
    return Math.max(32, rounded * 32);
  };
  const width = to32(src.width * ratio);
  const height = to32(src.height * ratio);
  const data = new Float32Array(3 * width * height);
  const sx = src.width / width, sy = src.height / height;
  const sample = (x: number, y: number) => {
    const xx = Math.min(src.width - 1, Math.max(0, x)), yy = Math.min(src.height - 1, Math.max(0, y));
    return (yy * src.width + xx) * 4;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // bilinear on the RGBA source, like cv2.resize's default interpolation
    const fx = (x + 0.5) * sx - 0.5, fy = (y + 0.5) * sy - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    for (let c = 0; c < 3; c++) {
      const v = (i: number) => src.data[i + c];
      const value = v(sample(x0, y0)) * (1 - ax) * (1 - ay) + v(sample(x0 + 1, y0)) * ax * (1 - ay)
        + v(sample(x0, y0 + 1)) * (1 - ax) * ay + v(sample(x0 + 1, y0 + 1)) * ax * ay;
      data[c * width * height + y * width + x] = (value / 255 - 0.5) / 0.5;
    }
  }
  return { data, width, height };
}

function convexHull(points: [number, number][]): [number, number][] {  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 4) return pts;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

type Quad = [[number, number], [number, number], [number, number], [number, number]];

/** Minimum-area rectangle via rotating calipers over the hull. */
function minAreaRect(hull: [number, number][]): Quad {
  let best: { area: number; quad: Quad } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i], q = hull[(i + 1) % hull.length];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const ux = dx / len, uy = dy / len, vx = -uy, vy = ux;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const c of hull) {
      const u = (c[0] - p[0]) * ux + (c[1] - p[1]) * uy, v = (c[0] - p[0]) * vx + (c[1] - p[1]) * vy;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      const corner = (u: number, v: number) => [p[0] + u * ux + v * vx, p[1] + u * uy + v * vy] as [number, number];
      best = { area, quad: [corner(minU, minV), corner(maxU, minV), corner(maxU, maxV), corner(minU, maxV)] };
    }
  }
  return best ? best.quad : [hull[0], hull[0], hull[0], hull[0]];
}

// Rotating-calipers helpers exported for unit tests (pure geometry, no model).
export function hullPoints(points: [number, number][]) {
  return convexHull(points);
}
export function minAreaQuad(hull: [number, number][]): Quad {
  return minAreaRect(hull);
}
export function orientQuadForText(quad: Quad): Quad | null {
  return orientQuad(quad);
}
export function expandQuad(quad: Quad): Quad {
  return unclipRect(quad);
}

/** minAreaRect corners carry no reliable traversal order. Rebuild the quad
 *  BY PROJECTION onto the long axis (the text direction): order-independent,
 *  then keep the axis pointing rightward. Steeper than 45deg is vertical
 *  text, out of scope, dropped honestly (the synthetic 50deg bar pins this). */
function orientQuad(quad: Quad): Quad | null {
  const side = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [p0, p1] = side(quad[0], quad[1]) >= side(quad[1], quad[2]) ? [quad[0], quad[1]] : [quad[1], quad[2]];
  const length = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  if (length < 1e-9) return null;
  let ux = (p1[0] - p0[0]) / length, uy = (p1[1] - p0[1]) / length;
  let vx = -uy, vy = ux;
  const angle = Math.atan2(uy, ux) * 180 / Math.PI;
  if (angle > 90 || angle < -90) { ux = -ux; uy = -uy; vx = -vx; vy = -vy; }
  if (Math.abs(Math.atan2(uy, ux) * 180 / Math.PI) > 45) return null;
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const c of quad) {
    const u = (c[0] - p0[0]) * ux + (c[1] - p0[1]) * uy;
    const v = (c[0] - p0[0]) * vx + (c[1] - p0[1]) * vy;
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  const corner = (u: number, v: number) => [p0[0] + u * ux + v * vx, p0[1] + u * uy + v * vy] as [number, number];
  return [corner(minU, minV), corner(maxU, minV), corner(maxU, maxV), corner(minU, maxV)];
}

function polygonScore(probs: Float32Array, mapW: number, mapH: number, quad: Quad): number {
  const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(mapW - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(mapH - 1, Math.ceil(Math.max(...ys)));
  let sum = 0, count = 0;
  const inside = (x: number, y: number) => {
    // even-odd rule against the quad's four edges
    let hits = 0;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const [xi, yi] = quad[i], [xj, yj] = quad[j];
      if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hits++;
    }
    return hits % 2 === 1;
  };
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (inside(x + 0.5, y + 0.5)) { sum += probs[y * mapW + x]; count++; }
  }
  return count ? sum / count : 0;
}

/** Expand a rectangle outward by d = area * ratio / perimeter on every side
 *  (the min-box of pyclipper's rounded offset of a rectangle). */
function unclipRect(quad: Quad): Quad {
  const [tl, tr, , bl] = quad;
  const w = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]), h = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
  const area = w * h, perimeter = 2 * (w + h);
  const d = perimeter > 0 ? area * UNCLIP_RATIO / perimeter : 0;
  const ux = w > 0 ? [(tr[0] - tl[0]) / w, (tr[1] - tl[1]) / w] : [1, 0];
  const vx = h > 0 ? [(bl[0] - tl[0]) / h, (bl[1] - tl[1]) / h] : [0, 1];
  const corner = (su: number, sv: number, du: number, dv: number) => [
    tl[0] + (su + du * d) * ux[0] + (sv + dv * d) * vx[0],
    tl[1] + (su + du * d) * ux[1] + (sv + dv * d) * vx[1],
  ] as [number, number];
  return [corner(0, 0, -1, -1), corner(w, 0, 1, -1), corner(w, h, 1, 1), corner(0, h, -1, 1)];
}

/** Detector quad -> the renderer's contract: the tight rect BEFORE rotation
 *  (fractions), rotated clockwise by `angle` about x,y. Computes BOTH the
 *  padded placement box (post-unclip) and the kernel ink box (pre-unclip). */
export function quadToLine(quad: Quad, inkQuad: Quad, imgW: number, imgH: number, score: number): DetectedTextLine | null {
  const [tl, tr] = quad;
  const angle = Math.atan2(tr[1] - tl[1], tr[0] - tl[0]) * 180 / Math.PI;
  if (Math.abs(angle) > 45) return null; // vertical text is out of scope, dropped honestly
  const toRect = (q: Quad) => {
    const rad = angle * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const us = q.map((p) => (p[0] - tl[0]) * cos + (p[1] - tl[1]) * sin);
    const vs = q.map((p) => -(p[0] - tl[0]) * sin + (p[1] - tl[1]) * cos);
    const u0 = Math.min(...us), v0 = Math.min(...vs);
    const originX = tl[0] + u0 * cos - v0 * sin, originY = tl[1] + u0 * sin + v0 * cos;
    return {
      x: originX / imgW, y: originY / imgH,
      w: (Math.max(...us) - u0) / imgW, h: (Math.max(...vs) - v0) / imgH,
    };
  };
  return { box: toRect(quad), inkBox: toRect(inkQuad), angle: Math.round(angle * 100) / 100, score };
}

/** The DB postprocess on a sigmoid probability map; grid -> original scale. */
export function dbLinesFromProbMap(probs: Float32Array, mapW: number, mapH: number, imgW: number, imgH: number): DetectedTextLine[] {
  const binary = new Uint8Array(mapW * mapH);
  for (let i = 0; i < probs.length; i++) binary[i] = Number(probs[i] > THRESH);
  // use_dilation: 2x2 dilation glues broken strokes into one component
  const dilated = new Uint8Array(binary);
  for (let y = 0; y + 1 < mapH; y++) for (let x = 0; x + 1 < mapW; x++) {
    const i = y * mapW + x;
    if (binary[i] || binary[i + 1] || binary[i + mapW] || binary[i + mapW + 1]) {
      dilated[i] = 1; dilated[i + 1] = 1; dilated[i + mapW] = 1; dilated[i + mapW + 1] = 1;
    }
  }
  const visited = new Uint8Array(mapW * mapH);
  const lines: DetectedTextLine[] = [];
  const queue = new Int32Array(mapW * mapH);
  let candidates = 0;
  for (let seed = 0; seed < dilated.length; seed++) {
    if (!dilated[seed] || visited[seed]) continue;
    if (++candidates > MAX_CANDIDATES) break;
    let head = 0, tail = 0;
    queue[tail++] = seed; visited[seed] = 1;
    const points: [number, number][] = [];
    while (head < tail) {
      const i = queue[head++];
      const x = i % mapW, y = (i / mapW) | 0;
      points.push([x, y]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= mapW || yy >= mapH) continue;
        const j = yy * mapW + xx;
        if (dilated[j] && !visited[j]) { visited[j] = 1; queue[tail++] = j; }
      }
    }
    const hull = convexHull(points);
    if (hull.length < 3) continue;
    const mini = orientQuad(minAreaRect(hull));
    if (!mini) continue; // vertical text, out of scope
    const side = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (Math.min(side(mini[0], mini[1]), side(mini[0], mini[3])) < MIN_SIZE) continue;
    const score = polygonScore(probs, mapW, mapH, mini);
    if (score < BOX_THRESH) continue;
    // expanding an ordered rectangle keeps its order: no re-hull needed
    const expanded = unclipRect(mini);
    if (Math.min(side(expanded[0], expanded[1]), side(expanded[0], expanded[3])) < MIN_SIZE + 2) continue;
    const scaled = expanded.map(([x, y]) => [
      Math.min(imgW, Math.max(0, Math.round(x * imgW / mapW))),
      Math.min(imgH, Math.max(0, Math.round(y * imgH / mapH))),
    ]) as Quad;
    if (Math.min(side(scaled[0], scaled[1]), side(scaled[0], scaled[3])) <= MIN_SIZE) continue;
    const kernel = mini.map(([x, y]) => [
      Math.min(imgW, Math.max(0, Math.round(x * imgW / mapW))),
      Math.min(imgH, Math.max(0, Math.round(y * imgH / mapH))),
    ]) as Quad;
    const line = quadToLine(scaled, kernel, imgW, imgH, score);
    if (line && line.box.w * imgW > MIN_SIZE && line.box.h * imgH > MIN_SIZE) lines.push(line);
  }
  // reading order: band by height, then left to right
  return lines.sort((a, b) => Math.round(a.box.y / Math.max(0.01, a.box.h * 1.5)) - Math.round(b.box.y / Math.max(0.01, b.box.h * 1.5)) || a.box.x - b.box.x);
}

export class DbNetTextDetector implements TextDetector {
  constructor(
    private readonly dir: string,
    private readonly runner: SegmentRunner,
  ) {}

  private verified: Promise<void> | null = null;
  private ensure() {
    this.verified ??= (async () => {
      const manifest = JSON.parse(await readFile(path.join(this.dir, "manifest.json"), "utf8")) as Manifest;
      const bytes = await readFile(path.join(this.dir, "det.onnx"));
      if (createHash("sha256").update(bytes).digest("hex") !== manifest.files["det.onnx"]) {
        throw new Error("text detector model checksum mismatch");
      }
    })().catch((e) => { this.verified = null; throw e; });
    return this.verified;
  }

  async detect(input: { png: Uint8Array; signal: AbortSignal }): Promise<DetectedTextLine[]> {
    input.signal.throwIfAborted();
    await this.ensure();
    const image = PNG.sync.read(Buffer.from(input.png));
    if (image.width * image.height > 24_000_000) throw new Error("The image exceeds the 24 megapixel text-editing limit.");
    const tensor = detTensor(image);
    const resp = await this.runner.request({
      op: "det",
      det_dir: this.dir,
      pixels: { dims: [1, 3, tensor.height, tensor.width], data: f32ToB64(tensor.data) },
    });
    input.signal.throwIfAborted();
    if (resp.op !== "det") throw new Error(`det runner failed: ${JSON.stringify(resp).slice(0, 120)}`);
    const probs = b64ToF32(resp.probs.data);
    const [, , mapH, mapW] = resp.probs.dims;
    return dbLinesFromProbMap(probs, mapW, mapH, image.width, image.height);
  }
}
