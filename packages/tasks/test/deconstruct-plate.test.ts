import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { deconstructTextSchema } from "@oia/schema";
import { composeTextPlate, localTextPlate, mergeEraseRegions, prepareDeconstructRegions, readDeconstructPng, refineTextRegions, repairRetainedRegions, retainedTextRegions, sampleTextColors } from "../src/deconstruct-plate.js";

function solid(w: number, h: number, rgb: number[]) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < p.data.length; i += 4) p.data.set([...rgb, 255], i);
  return p;
}
const line = (angle = 0) => deconstructTextSchema.parse({
  text: "thứ bảy vui vẻ!", box: { x: 0.3, y: 0.3, w: 0.4, h: 0.12 },
  typography: { fontFamily: "Be Vietnam Pro", fontWeight: 700, fontStyle: "normal", fill: "#e52233", angle, spacingEm: 0, textAlign: "left" },
});

describe("D22 text plate", () => {
  it("rejects retained ink but accepts removal and does not classify a solid background as ink", () => {
    const src = solid(200, 200, [245, 245, 245]);
    for (let y = 62; y < 80; y++) for (let x = 62; x < 138; x += 3) src.data.set([229, 34, 51, 255], (y * 200 + x) * 4);
    expect(retainedTextRegions(src, src, [line()])).toEqual([0]);
    expect(retainedTextRegions(src, solid(200, 200, [245, 245, 245]), [line()])).toEqual([]);
    expect(retainedTextRegions(solid(200, 200, [229, 34, 51]), solid(200, 200, [229, 34, 51]), [line()])).toEqual([]);
  });

  it.each([
    { name: "recolored strokes", seed: "#e52233", color: [209, 14, 31] },
    { name: "incorrect color seed", seed: "#0000ff", color: [229, 34, 51] },
  ])("rejects $name instead of interpreting a color mismatch as removal", ({ seed, color }) => {
    const src = solid(200, 200, [245, 245, 245]);
    const plate = solid(200, 200, [245, 245, 245]);
    for (let y = 62; y < 80; y++) for (let x = 62; x < 138; x += 3) {
      src.data.set([229, 34, 51, 255], (y * 200 + x) * 4);
      plate.data.set([...color, 255], (y * 200 + x) * 4);
    }
    const selected = line();
    if (!selected.typography) throw new Error("Fixture typography is missing.");
    selected.typography.fill = seed;
    expect(retainedTextRegions(src, plate, [selected])).toEqual([0]);
    expect(retainedTextRegions(src, solid(200, 200, [245, 245, 245]), [selected])).toEqual([]);
  });

  it("rebuilds a flagged smooth region locally and refuses a textured one", () => {
    const src = new PNG({ width: 200, height: 200 });
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
      const flat = x < 100;
      const c = flat ? 245 : (x * 7 + y * 3) % 255; // trái phẳng, phải hoa văn
      src.data.set([c, flat ? 245 : 255 - c, c, 255], (y * 200 + x) * 4);
    }
    for (let y = 60; y < 74; y++) for (let x = 20; x < 90; x += 3) src.data.set([200, 30, 40, 255], (y * 200 + x) * 4);
    for (let y = 160; y < 172; y++) for (let x = 120; x < 180; x += 3) src.data.set([200, 30, 40, 255], (y * 200 + x) * 4);
    const lineAt = (x: number, y: number, w: number, h: number) => deconstructTextSchema.parse({
      text: "SALE", box: { x, y, w, h },
      typography: { fontFamily: "Arial", fontWeight: 400, fontStyle: "normal", fill: "#c81e28", angle: 0, spacingEm: 0, textAlign: "left" },
    });
    const smooth = lineAt(0.1, 0.3, 0.35, 0.07);
    const textured = lineAt(0.6, 0.8, 0.3, 0.06);
    // plate = gốc (chưa xóa gì): cả hai vùng bị flag
    expect(retainedTextRegions(src, src, [smooth, textured])).toEqual([0, 1]);
    const repaired = repairRetainedRegions(src, src, [smooth, textured]);
    expect(repaired).not.toBeNull();
    const after = retainedTextRegions(src, readDeconstructPng(repaired!), [smooth, textured]);
    expect(after).toEqual([1]); // vùng phẳng được dựng lại, vùng hoa văn vẫn thất bại trung thực
    const pixels = readDeconstructPng(repaired!);
    const i = (65 * 200 + 40) * 4;
    expect(Math.abs(pixels.data[i] - 245)).toBeLessThanOrEqual(2); // mực đã thay bằng nền phẳng
  });

  it("merges detector fragments of one visual line into one erase region", () => {
    const line = (x: number, w: number, text = "AB") => deconstructTextSchema.parse({
      text, box: { x, y: 0.3, w, h: 0.05 },
      typography: { fontFamily: "Arial", fontWeight: 400, fontStyle: "normal", fill: "#123456", angle: 0, spacingEm: 0, textAlign: "left" },
    });
    // same band, adjacent: merged
    const merged = mergeEraseRegions([line(0.1, 0.2), line(0.32, 0.2)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].box.w).toBeCloseTo(0.42, 5);
    expect(merged[0].box.h).toBeCloseTo(0.05, 5);
    // different rows: kept separate
    expect(mergeEraseRegions([line(0.1, 0.2), { ...line(0.12, 0.2), box: { x: 0.12, y: 0.5, w: 0.2, h: 0.05 } }])).toHaveLength(2);
    // far apart horizontally on the same band: kept separate
    expect(mergeEraseRegions([line(0.05, 0.1), line(0.6, 0.1)])).toHaveLength(2);
  });

  it("does not move a line to a larger same-color neighboring headline in the search margin", () => {
    const src = solid(200, 200, [245, 245, 245]);
    for (let y = 60; y < 75; y++) for (let x = 60; x < 140; x += 4) src.data.set([229, 34, 51, 255], (y * 200 + x) * 4);
    for (let y = 82; y < 93; y++) for (let x = 60; x < 140; x++) src.data.set([229, 34, 51, 255], (y * 200 + x) * 4);
    const [refined] = refineTextRegions(src, [line()]);
    expect(Math.abs(refined.box.y * 200 - 60)).toBeLessThan(1);
    expect((refined.box.y + refined.box.h) * 200).toBeLessThan(82);
  });
  it("recovers a short label whose full-image box starts inside the word", () => {
    const src = solid(200, 200, [245, 245, 245]);
    for (let y = 60; y < 72; y++) for (let x = 116; x < 153; x += 2) src.data.set([229, 34, 51, 255], (y * 200 + x) * 4);
    const input = { ...line(), text: "dễ dàng", box: { x: 0.65, y: 0.3, w: 0.2, h: 0.08 } };
    const { texts, eraseRegions } = prepareDeconstructRegions(src, [input]);
    expect(texts[0].box.x * 200).toBeLessThanOrEqual(117);
    expect(eraseRegions[0].box.x + eraseRegions[0].box.w).toBeGreaterThanOrEqual(input.box.x + input.box.w);
    const plate = readDeconstructPng(composeTextPlate(src, solid(200, 200, [245, 245, 245]), eraseRegions));
    expect(retainedTextRegions(src, plate, texts)).toEqual([]);
  });

  it("does not copy imagegen drift outside a rotated OCR region; source alpha survives", () => {
    const src = solid(100, 100, [10, 20, 30]);
    src.data[3] = 0;
    src.data.set([255, 255, 255, 255], (40 * 100 + 40) * 4);
    const generated = solid(50, 50, [200, 210, 220]);
    const out = readDeconstructPng(composeTextPlate(src, generated, [line(30)]));
    const pixel = (x: number, y: number) => [...out.data.subarray((y * 100 + x) * 4, (y * 100 + x) * 4 + 4)];
    expect(pixel(0, 0)).toEqual([10, 20, 30, 0]);
    expect(pixel(95, 95)).toEqual([10, 20, 30, 255]);
    expect(pixel(40, 40)).toEqual([10, 20, 30, 255]); // flat background reconstructed, not imagegen's shifted color
    // Inside the rotated rectangle's AABB but not the rectangle itself.
    expect(pixel(65, 31)).toEqual([10, 20, 30, 255]);
    expect([out.width, out.height]).toEqual([100, 100]);
  });

  it("uses generated pixels on a patterned background rather than hallucinating a flat plate", () => {
    const src = solid(100, 100, [10, 20, 30]);
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
      const c = (x * 71 + y * 13) % 255;
      src.data.set([c, 255 - c, c, 255], (y * 100 + x) * 4);
    }
    const out = readDeconstructPng(composeTextPlate(src, solid(50, 50, [200, 210, 220]), [line()]));
    expect([...out.data.subarray((35 * 100 + 45) * 4, (35 * 100 + 45) * 4 + 4)]).toEqual([200, 210, 220, 255]);
  });

  it("expands an underestimated OCR box to include descenders before erasing", () => {
    const src = solid(100, 100, [20, 70, 90]);
    for (let y = 30; y < 46; y++) for (let x = 30; x < 70; x += 4) src.data.set([229, 34, 51, 255], (y * 100 + x) * 4);
    const [refined] = refineTextRegions(src, [line()]);
    expect((refined.box.y + refined.box.h) * 100).toBeGreaterThanOrEqual(46);
    const out = readDeconstructPng(composeTextPlate(src, solid(100, 100, [200, 210, 220]), [refined]));
    expect([...out.data.subarray((45 * 100 + 42) * 4, (45 * 100 + 42) * 4 + 4)]).toEqual([20, 70, 90, 255]);
  });

  it("keeps adjacent same-color lines separate while retaining detached accents", () => {
    const src = solid(200, 200, [20, 70, 90]);
    for (const [start, end] of [[61, 64], [67, 80], [89, 110]]) {
      for (let y = start; y < end; y++) for (let x = 60; x < 140; x += 2) {
        src.data.set([229, 34, 51, 255], (y * 200 + x) * 4);
      }
    }
    // A same-color decorative rail must not connect otherwise separated row bands.
    for (let y = 45; y < 120; y++) src.data.set([229, 34, 51, 255], (y * 200 + 57) * 4);
    const first = { ...line(), box: { x: 0.3, y: 0.3, w: 0.4, h: 0.12 } };
    const second = { ...line(), box: { x: 0.3, y: 0.44, w: 0.4, h: 0.12 } };
    const [a, b] = refineTextRegions(src, [first, second]);
    expect(a.box.y * 200).toBeLessThan(62);
    expect((a.box.y + a.box.h) * 200).toBeLessThan(89);
    expect(b.box.y * 200).toBeGreaterThan(80);
    expect((b.box.y + b.box.h) * 200).toBeGreaterThanOrEqual(110);
  });

  it("reconstructs a gradient without rectangular color seams from imagegen", () => {
    const src = solid(100, 100, [0, 0, 0]);
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) src.data.set([x + 10, y + 20, x + y, 255], (y * 100 + x) * 4);
    src.data.set([255, 255, 255, 255], (35 * 100 + 45) * 4);
    const out = readDeconstructPng(composeTextPlate(src, solid(100, 100, [200, 210, 220]), [line()]));
    const pixel = [...out.data.subarray((35 * 100 + 45) * 4, (35 * 100 + 45) * 4 + 3)];
    pixel.forEach((c, k) => expect(Math.abs(c - [55, 55, 80][k])).toBeLessThanOrEqual(1));
  });

  it("recognizes antialiased ink as a background/foreground mixture, not texture", () => {
    const src = solid(100, 100, [10, 20, 30]);
    for (let y = 31; y < 41; y++) for (let x = 32; x < 68; x++) {
      src.data.set([87, 25, 37, 255], (y * 100 + x) * 4); // 35% of #e52233 over the background
    }
    const plate = localTextPlate(src, [line()]);
    expect(plate).not.toBeNull();
    const p = readDeconstructPng(plate!);
    expect([...p.data.subarray((35 * 100 + 45) * 4, (35 * 100 + 45) * 4 + 3)]).toEqual([10, 20, 30]);
  });

  it("does not flatten a textured interior just because the border is smooth", () => {
    const src = solid(100, 100, [10, 20, 30]);
    for (let y = 32; y < 40; y++) for (let x = 35; x < 65; x++) src.data.set([0, 200, 100, 255], (y * 100 + x) * 4);
    expect(localTextPlate(src, [line()])).toBeNull();
    expect(localTextPlate(solid(100, 100, [10, 20, 30]), [line()])).toBeInstanceOf(Uint8Array);
  });

  it("empty OCR preserves every decoded pixel", () => {
    const src = solid(10, 10, [1, 2, 3]);
    expect(readDeconstructPng(composeTextPlate(src, solid(4, 4, [255, 255, 255]), [])).data).toEqual(src.data);
  });

  it("samples sparse foreground ink rather than the dominant background", () => {
    const src = solid(100, 100, [255, 255, 255]);
    for (let x = 32; x < 60; x++) src.data.set([230, 30, 50, 255], (35 * 100 + x) * 4);
    const [text] = sampleTextColors(src, [line()]);
    expect(text.typography?.fill).toBe("#e61e32");
    expect(text.text).toBe("thứ bảy vui vẻ!");
  });

  it("retains vision estimate when no plausible ink exists; old OCR remains readable", () => {
    const src = solid(100, 100, [255, 255, 255]);
    expect(sampleTextColors(src, [line()])[0].typography?.fill).toBe("#e52233");
    const legacy = { text: "OLD", box: { x: 0, y: 0, w: 1, h: 1 } };
    expect(sampleTextColors(src, [legacy])).toEqual([legacy]);
  });

  it("corrects a WRONG vision seed: the ink cluster is measured, not searched near the seed", () => {
    const src = solid(100, 100, [255, 255, 255]);
    for (let x = 32; x < 60; x++) src.data.set([20, 60, 220, 255], (35 * 100 + x) * 4);
    const [text] = sampleTextColors(src, [line()]);
    expect(text.typography?.fill).toBe("#143cdc");
  });

  it("extracts ink over a gradient background from the ring reference", () => {
    const src = new PNG({ width: 100, height: 100 });
    for (let y = 0; y < 100; y++) {
      const c = Math.round(240 - y * 0.5);
      for (let x = 0; x < 100; x++) src.data.set([c, c, c, 255], (y * 100 + x) * 4);
    }
    for (let x = 32; x < 60; x++) src.data.set([10, 10, 10, 255], (35 * 100 + x) * 4);
    const [text] = sampleTextColors(src, [line()]);
    expect(text.typography?.fill).toBe("#0a0a0a");
  });

  it("low-contrast ink falls back to the vision estimate instead of guessing", () => {
    const src = solid(100, 100, [30, 30, 30]);
    for (let x = 32; x < 60; x++) src.data.set([42, 42, 42, 255], (35 * 100 + x) * 4);
    expect(sampleTextColors(src, [line()])[0].typography?.fill).toBe("#e52233");
  });

  it("white ink on colorful texture wins as the dominant far cluster, not the texture median", () => {
    const src = solid(100, 100, [90, 140, 90]);
    // scatter DISTINCT colors inside the box so no single stray bin can outnumber real ink
    for (let y = 30; y < 42; y += 3) for (let x = 30; x < 70; x += 3) {
      const r = (x * 7 + y * 13) % 256, g = (x * 3 + y * 5) % 256, b = (x * 11 + y * 2) % 256;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) src.data.set([r, g, b, 255], ((y + dy) * 100 + x + dx) * 4);
    }
    for (let y = 34; y < 38; y++) for (let x = 32; x < 60; x++) src.data.set([255, 255, 255, 255], (y * 100 + x) * 4);
    expect(sampleTextColors(src, [line()])[0].typography?.fill).toBe("#ffffff");
  });

  it("rejects oversized, truncated and non-PNG input before decompression", () => {
    const b = PNG.sync.write(solid(1, 1, [0, 0, 0]));
    b.writeUInt32BE(100000, 16); b.writeUInt32BE(100000, 20);
    expect(() => readDeconstructPng(b)).toThrow(/24 megapixel/);
    expect(() => readDeconstructPng(new Uint8Array([1, 2, 3]))).toThrow(/PNG/);
    expect(() => readDeconstructPng(PNG.sync.write(solid(2, 2, [0, 0, 0])).subarray(0, 30))).toThrow();
  });
});
