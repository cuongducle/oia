import { StaticCanvas, FabricText } from "fabric";
import type { DeconstructText, SceneCanvas } from "@oia/schema";
import { fittedDeconstructScene } from "../src/renderer/lib/deconstruct-typography.js";
import { glyphScale, inkBounds, rasterizeGlyphs } from "../src/renderer/lib/glyph-raster.js";
import { FontComparisonBudgetExceeded, rankArtworkFonts } from "../src/renderer/lib/font-reference.js";

const SIZE = { width: 512, height: 256 };
const WHITE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==";

function canvasOf() {
  const canvas = document.createElement("canvas");
  Object.assign(canvas, SIZE);
  return canvas;
}
function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Missing canvas context");
  return ctx;
}
function overlap(a: HTMLCanvasElement, b: HTMLCanvasElement) {
  const aa = context(a).getImageData(0, 0, a.width, a.height).data;
  const bb = context(b).getImageData(0, 0, b.width, b.height).data;
  let intersection = 0, union = 0;
  for (let i = 3; i < aa.length; i += 4) {
    const left = aa[i] >= 128, right = bb[i] >= 128;
    intersection += Number(left && right); union += Number(left || right);
  }
  return union ? intersection / union : 0;
}
async function painted(scene: SceneCanvas) {
  const canvas = new StaticCanvas(null, { ...SIZE, enableRetinaScaling: false });
  try {
    await canvas.loadFromJSON(JSON.parse(JSON.stringify(scene)));
    canvas.getObjects().slice(0, 2).forEach(o => o.set("visible", false));
    canvas.renderAll();
    const image = canvasOf();
    context(image).drawImage(canvas.getElement(), 0, 0);
    return image;
  } finally { canvas.dispose(); }
}
function line(text: string, box: DeconstructText["box"], italic = true): DeconstructText {
  return { text, box, typography: { fontFamily: "Be Vietnam Pro", fontWeight: 700, fontStyle: italic ? "italic" : "normal", fill: "#111111", angle: 0, spacingEm: 0, textAlign: "left" } };
}
async function scene(texts: DeconstructText[]) {
  return fittedDeconstructScene({ imageUrl: WHITE, w: SIZE.width, h: SIZE.height, texts });
}

export async function run() {
  const results: Record<string, unknown>[] = [];
  const cases = [
    { text: "VẮNG KHÁCH?", x: 41, y: 42, width: 430, height: 116, italic: true },
    { text: "EM MỜI DÙNG THỬ", x: 61, y: 70, width: 343, height: 48, italic: true },
    { text: "KHÁCH HÀNG MỖI NGÀY", x: 53, y: 60, width: 400, height: 42, italic: true },
    { text: "Tự động tương tác, phản hồi", x: 31, y: 75, width: 180, height: 18, italic: false },
  ];
  for (const sample of cases) {
    const selected = line(sample.text, { x: sample.x / SIZE.width, y: sample.y / SIZE.height, w: sample.width / SIZE.width, h: sample.height / SIZE.height }, sample.italic);
    const image = await painted(await scene([selected]));
    const ink = inkBounds(image);
    if (!ink) throw new Error("Missing painted glyphs");
    // D22 geometry contract: the anchor is exact, no dimension overflows the box,
    // and the bound dimension fills it (the other may letterbox instead of distort).
    const anchorError = Math.max(Math.abs(ink.x - sample.x), Math.abs(ink.y - sample.y));
    const overflow = ink.width - sample.width > 3 || ink.height - sample.height > 3;
    const fillsBound = Math.abs(ink.width - sample.width) <= 3 || Math.abs(ink.height - sample.height) <= 3;
    image.width = image.height = 0;
    if (anchorError > 3 || overflow || !fillsBound) throw new Error(`Painted glyph contract violated: ${sample.text}, ${JSON.stringify({ anchorError, ink, sample: { x: sample.x, y: sample.y, width: sample.width, height: sample.height } })}`);
    results.push({ test: "serialized geometry", text: sample.text, anchorError, ink: [ink.width, ink.height] });
  }

  const selected = line("EM MỜI DÙNG THỬ", { x: 0.18, y: 0.4, w: 0.62, h: 0.2 });
  const base = await painted(await scene([selected]));
  for (const angle of [-8, 22]) {
    if (!selected.typography) throw new Error("Fixture typography missing");
    const rotated = await painted(await scene([{ ...selected, typography: { ...selected.typography, angle } }]));
    const expected = canvasOf(), ctx = context(expected);
    const x = selected.box.x * SIZE.width, y = selected.box.y * SIZE.height;
    ctx.translate(x, y); ctx.rotate(angle * Math.PI / 180); ctx.translate(-x, -y); ctx.drawImage(base, 0, 0);
    const score = overlap(expected, rotated);
    if (score < 0.8) throw new Error(`Rotated glyph transform disagrees with independent canvas rotation: ${score}`);
    results.push({ test: "rotated glyph pixels", angle, iou: score });
    rotated.width = rotated.height = expected.width = expected.height = 0;
  }
  base.width = base.height = 0;

  // Source pixels use Canvas2D directly, never the function under test.
  const source = canvasOf(), ctx = context(source);
  await document.fonts.load('italic 700 60px "Be Vietnam Pro"', "VẮNG KHÁCH?");
  ctx.font = 'italic 700 60px "Be Vietnam Pro"'; ctx.fillStyle = "#111111";
  ctx.fillText("VẮNG KHÁCH?", 30, 150);
  const bounds = inkBounds(source);
  if (!bounds) throw new Error("Missing independently generated reference glyphs");
  const opaque = canvasOf(), opaqueCtx = context(opaque);
  opaqueCtx.fillStyle = "white"; opaqueCtx.fillRect(0, 0, SIZE.width, SIZE.height); opaqueCtx.drawImage(source, 0, 0);
  const bytes = Uint8Array.from(atob(opaque.toDataURL().split(",")[1]), c => c.charCodeAt(0));
  const wrong = line("VẮNG KHÁCH?", { x: bounds.x / SIZE.width, y: bounds.y / SIZE.height, w: bounds.width / SIZE.width, h: bounds.height / SIZE.height });
  if (!wrong.typography) throw new Error("Missing fixture typography");
  wrong.typography.fontFamily = "Georgia";
  const before = await painted(await scene([wrong]));
  const ranked = await rankArtworkFonts(bytes, [wrong], SIZE.width, SIZE.height, () => false);
  const after = await painted(await fittedDeconstructScene({ imageUrl: WHITE, w: SIZE.width, h: SIZE.height, texts: ranked.texts, fits: ranked.fits }));
  const baseline = overlap(source, before), score = overlap(source, after);
  if (score < 0.7 || score < baseline + 0.05) throw new Error(`Final painted font did not improve the wrong serif seed: ${JSON.stringify({ baseline, score, scores: ranked.scores })}`);
  results.push({ test: "wrong seed family corrected, final painted pixels", before: baseline, after: score, family: ranked.texts[0].typography?.fontFamily });
  let budgetRejected = false;
  try { await rankArtworkFonts(bytes, [wrong], SIZE.width, SIZE.height, () => false, [], { budgetMs: 0 }); }
  catch (error) { if (!(error instanceof FontComparisonBudgetExceeded)) throw error; budgetRejected = true; }
  if (!budgetRejected) throw new Error("An exhausted comparison budget was ignored");
  let cancelled = false;
  try { await rankArtworkFonts(bytes, [wrong], SIZE.width, SIZE.height, () => true); }
  catch (error) { if (!(error instanceof DOMException) || error.name !== "AbortError") throw error; cancelled = true; }
  if (!cancelled) throw new Error("A cancelled comparison continued raster work");
  results.push({ test: "comparison timeout and cancellation", budgetRejected, cancelled });
  for (const c of [source, opaque, before, after]) c.width = c.height = 0;

  let rejected = false;
  try { glyphScale({ width: 100, height: 100 }, { width: 1000, height: 10 }); }
  catch { rejected = true; }
  if (rejected) throw new Error("An impossible box must degrade to uniform scale, not throw");
  const uniform = glyphScale({ width: 100, height: 100 }, { width: 1000, height: 10 });
  if (uniform.scaleX !== uniform.scaleY || uniform.scaleX !== 0.1) throw new Error(`Uniform fallback is wrong: ${JSON.stringify(uniform)}`);
  const mild = glyphScale({ width: 100, height: 100 }, { width: 112, height: 100 });
  if (Math.max(mild.scaleX / mild.scaleY, mild.scaleY / mild.scaleX) > 1.25) throw new Error("Anisotropic fill exceeded the distortion budget");
  results.push({ test: "bounded glyph scaling", uniform, mild });
  const oversized = new FabricText("W".repeat(500), { fontSize: 600, originX: "left", originY: "top" });
  try {
    rejected = false;
    try { rasterizeGlyphs(oversized); } catch { rejected = true; }
    if (!rejected) throw new Error("Oversized glyph raster was silently allocated");
  } finally { oversized.dispose(); }
  results.push({ test: "distortion and allocation limits", rejected: true, bounded: true });
  return results;
}
