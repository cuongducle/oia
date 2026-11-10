/** SAM 3 int8 local engine (D21) over the SIDECAR runner (option A,
 *  segmentation-process-plan.md): vision once per image (cached by content
 *  hash on BOTH sides), text+decoder per prompt (~1-2 s). Tensor wiring and
 *  quality were validated in the SurgePix feature audit PoC (IoU 0.994 vs the
 *  PyTorch BF16 reference); the runner mirrors this file's index wiring, keep
 *  them in sync. BPE tokenize + preprocess + mask postprocess stay HERE; only
 *  the ORT session runs live in the native process (in-process ORT SIGTRAPs
 *  under Chromium's macOS malloc shim, see the plan doc). */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import type { Segmenter } from "@oia/tasks";
import { createClipTokenizer } from "./clip-bpe.js";
import { composeCutout, maskBox, preprocess, upsampleMask } from "./compose.js";
import { f32ToB64, b64ToF32, SegmentRunner, type SegmentRuntime } from "./runner.js";
import { SEGMENT_MODELS, type SegmentModelManager } from "./models.js";

const GRID = 288;
const SCORE_MIN = 0.5;

export class Sam3Segmenter implements Segmenter {
  private tokenizer: Awaited<ReturnType<typeof createClipTokenizer>> | null = null;
  private modelsDir: string | null = null;
  /** engine-side mirror of the runner's vision cache: key -> runner generation */
  private cache = new Map<string, number>();

  constructor(
    private readonly manager: SegmentModelManager,
    private readonly runtime: SegmentRuntime,
    private readonly runner: SegmentRunner = new SegmentRunner(runtime),
  ) {}

  private async ensure(): Promise<void> {
    if (this.tokenizer && this.modelsDir) return;
    const st = await this.manager.ensureStatus();
    if (st.state !== "ready") throw new Error("the segmentation model is not installed yet");
    const dir = st.dir;
    await this.runner.request({ op: "ping" }); // spawn + ORT load + prove the pipe
    this.tokenizer = createClipTokenizer(
      (await readFile(path.join(dir, "tokenizer-vocab.json"))).toString("utf8"),
      (await readFile(path.join(dir, "tokenizer-merges.txt"))).toString("utf8"),
    );
    this.modelsDir = dir;
  }

  async segment(input: { png: Uint8Array; prompt: string; signal: AbortSignal }) {
    await this.ensure();
    const modelsDir = this.modelsDir;
    if (!modelsDir || !this.tokenizer) throw new Error("the segmentation model is not installed yet");

    const png = PNG.sync.read(Buffer.from(input.png));
    const w = png.width, h = png.height;
    const pixels = preprocess(new Uint8Array(png.data), w, h);

    // vision once per image content: the runner caches the FPN outputs under
    // this key; a runner restart (generation bump) empties its side
    const key = createHash("sha256").update(input.png).digest("hex").slice(0, 24);
    if (this.cache.get(key) !== this.runner.generation) {
      await this.runner.request({
        op: "vision",
        models_dir: modelsDir,
        key,
        pixels: { dims: [1, 3, 1008, 1008], data: f32ToB64(pixels) },
      });
      if (input.signal.aborted) throw new DOMException("aborted", "AbortError");
      this.cache.delete(this.cache.keys().next().value ?? key); // keep ≤2
      this.cache.set(key, this.runner.generation);
    }

    const ids = this.tokenizer.encodePhrase(input.prompt);
    const attn = ids.map((x) => (x === 0 ? 0 : 1));
    const t = await this.runner.request({ op: "text", models_dir: modelsDir, input_ids: ids, attn });
    if (t.op !== "text") throw new Error("segment runner: expected text response");
    if (input.signal.aborted) throw new DOMException("aborted", "AbortError");

    const d = await this.runner.request({
      op: "decode",
      models_dir: modelsDir,
      vision_key: key,
      text_features: { dims: t.text_features.dims, data: t.text_features.data },
      attn,
    });
    if (d.op !== "decode") throw new Error("segment runner: expected decode response");
    if (input.signal.aborted) throw new DOMException("aborted", "AbortError");

    const masks = b64ToF32(d.masks.data);
    const logits = b64ToF32(d.logits.data);
    const scores: number[] = Array.from(logits, (x) => 1 / (1 + Math.exp(-x)));
    const hits = scores.map((score, i) => ({ score, i })).filter((o) => o.score > SCORE_MIN).sort((a, b) => b.score - a.score).slice(0, 8);

    const out: { box: [number, number, number, number]; score: number; cutout: Uint8Array }[] = [];
    const maskGrid = new Float32Array(GRID * GRID);
    for (const { score, i } of hits) {
      maskGrid.set(masks.subarray(i * GRID * GRID, (i + 1) * GRID * GRID));
      const mask = upsampleMask(maskGrid, GRID, w, h);
      const box = maskBox(mask, w, h);
      if ((box[2] - box[0]) * (box[3] - box[1]) < 0.0004) continue; // dust, <0.04% of the frame
      out.push({ box, score, cutout: composeCutout(new Uint8Array(png.data), mask, w, h) });
    }
    return out;
  }
}

/** names referenced by SEGMENT_MODELS for tree-shaking friendliness in tests */
export const SEGMENT_MODEL_FILES = SEGMENT_MODELS.map((m) => m.name);
