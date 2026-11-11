import { describe, expect, it } from "vitest";
import { detTensor, dbLinesFromProbMap, quadToLine } from "../src/utility/textdet.js";
import { PNG } from "pngjs";

function blank(w: number, h: number) {
  const png = new PNG({ width: w, height: h });
  png.data.fill(255);
  return png;
}

/** Draw a rotated filled bar (a synthetic text line) onto a prob map grid. */
function barProbMap(mapW: number, mapH: number, x: number, y: number, w: number, h: number, angleDeg: number, value = 0.9) {
  const probs = new Float32Array(mapW * mapH);
  const rad = angleDeg * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  for (let yy = 0; yy < mapH; yy++) for (let xx = 0; xx < mapW; xx++) {
    const u = (xx - x) * cos + (yy - y) * sin, v = -(xx - x) * sin + (yy - y) * cos;
    if (u >= 0 && u <= w && v >= 0 && v <= h) probs[yy * mapW + xx] = value;
  }
  return probs;
}

describe("DBNet postprocess (textdet.ts)", () => {
  const W = 480, H = 320;

  it("an axis-aligned bar becomes one horizontal line with the right box", () => {
    const probs = barProbMap(W, H, 100, 100, 200, 30, 0);
    const lines = dbLinesFromProbMap(probs, W, H, W * 2, H * 2);
    expect(lines).toHaveLength(1);
    const { box, angle, score } = lines[0];
    expect(angle).toBe(0);
    expect(score).toBeGreaterThan(0.5);
    // unclip (1.6) grows the box by d = area*1.6/perimeter on every side:
    // a 200x30 grid bar grows ~21px per side -> ~486x148 image px at 2x scale
    expect(box.x * W * 2).toBeGreaterThan(140);
    expect(box.x * W * 2).toBeLessThan(175);
    expect(box.w * W * 2).toBeGreaterThan(460);
    expect(box.w * W * 2).toBeLessThan(520);
    expect(box.h * H * 2).toBeGreaterThan(130);
    expect(box.h * H * 2).toBeLessThan(165);
  });

  it("a 20 degree bar reports the skew and stays tight", () => {
    const probs = barProbMap(W, H, 60, 120, 300, 24, 20);
    const lines = dbLinesFromProbMap(probs, W, H, W * 2, H * 2);
    expect(lines).toHaveLength(1);
    expect(Math.abs(lines[0].angle - 20)).toBeLessThan(1.5);
    expect(lines[0].box.w * W * 2).toBeGreaterThan(630);
    expect(lines[0].box.w * W * 2).toBeLessThan(700);
  });

  it("a bar steeper than 45 degrees is dropped as vertical/out-of-scope instead of exploding", () => {
    const probs = barProbMap(W, H, 150, 20, 200, 24, 50); // long side at +50deg
    const lines = dbLinesFromProbMap(probs, W, H, W * 2, H * 2);
    expect(lines).toHaveLength(0);
  });

  it("a faint component below box_thresh is rejected", () => {
    const loud = barProbMap(W, H, 100, 100, 200, 30, 0, 0.9);
    const faint = barProbMap(W, H, 100, 200, 200, 30, 0, 0.2);
    const lines = dbLinesFromProbMap(new Float32Array(loud.map((v, i) => Math.max(v, faint[i]))), W, H, W * 2, H * 2);
    expect(lines).toHaveLength(1);
  });

  it("two bars produce two lines in reading order", () => {
    const probs = new Float32Array(W * H);
    const a = barProbMap(W, H, 40, 40, 120, 20, 0), b = barProbMap(W, H, 40, 200, 120, 20, 0);
    for (let i = 0; i < probs.length; i++) probs[i] = Math.max(a[i], b[i]);
    const lines = dbLinesFromProbMap(probs, W, H, W * 2, H * 2);
    expect(lines).toHaveLength(2);
    expect(lines[0].box.y).toBeLessThan(lines[1].box.y);
  });

  it("quadToLine matches the renderer ink-rect-before-rotation contract", () => {
    const line = quadToLine([[10, 20], [110, 40], [100, 60], [0, 40]], 200, 100, 0.9);
    if (!line) throw new Error("expected a line");
    const angle = Math.atan2(20, 100) * 180 / Math.PI;
    expect(line.angle).toBeCloseTo(angle, 1);
    const rad = line.angle * Math.PI / 180;
    // the ink rect rotated back about (x,y) must cover the quad's corners
    const x = line.box.x * 200, y = line.box.y * 100, w = line.box.w * 200, h = line.box.h * 100;
    const corners: [number, number][] = [[10, 20], [110, 40], [100, 60], [0, 40]];
    for (const [qx, qy] of corners) {
      const u = (qx - x) * Math.cos(rad) + (qy - y) * Math.sin(rad);
      const v = -(qx - x) * Math.sin(rad) + (qy - y) * Math.cos(rad);
      expect(u).toBeGreaterThanOrEqual(-0.5);
      expect(u).toBeLessThanOrEqual(w + 0.5);
      expect(v).toBeGreaterThanOrEqual(-0.5);
      expect(v).toBeLessThanOrEqual(h + 0.5);
    }
  });
});

describe("detTensor (RapidOCR DetPreProcess parity)", () => {
  it("upscales the shorter side to 736 and rounds to /32", () => {
    const wide = detTensor(blank(600, 200));
    expect([wide.width, wide.height]).toEqual([2208, 736]);
    const square = detTensor(blank(1254, 1254));
    expect([square.width, square.height]).toEqual([1248, 1248]);
    const big = detTensor(blank(2000, 1000));
    expect([big.width, big.height]).toEqual([1984, 992]); // Python round(62.5) = 62, ties to even
  });

  it("normalizes to (x/255 - 0.5)/0.5 in CHW order", () => {
    const png = blank(64, 64);
    png.data.set([255, 0, 128, 255], 0); // first pixel: R=255, G=0, B=128
    const tensor = detTensor(png);
    const { width, height, data } = tensor;
    expect(data[0]).toBeCloseTo(1, 3); // R=255 -> (1 - 0.5)/0.5 = 1
    expect(data[width * height]).toBeCloseTo(-1, 3); // G=0 -> -1
    expect(data[2 * width * height]).toBeCloseTo((128 / 255 - 0.5) / 0.5, 2); // B=128
    expect(data[1]).toBeCloseTo(1, 3); // white pixel, channel 0
  });
});
