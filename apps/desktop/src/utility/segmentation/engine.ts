/** SAM 3 int8 local engine (D21): vision once per image (cached by content
 *  hash), text+decoder per prompt (~1-2 s). The pipeline shape and the tensor
 *  wiring were validated in the SurgePix feature audit PoC (IoU 0.994 vs the
 *  PyTorch BF16 reference on the product photo). */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import type { Segmenter } from "@oia/tasks";
import { createClipTokenizer } from "./clip-bpe.js";
import { composeCutout, maskBox, preprocess, upsampleMask } from "./compose.js";
import { SEGMENT_MODELS, type SegmentModelManager } from "./models.js";

type OrtModule = typeof import("onnxruntime-node");
type Session = Awaited<ReturnType<OrtModule["InferenceSession"]["create"]>>;

const GRID = 288;
const SCORE_MIN = 0.5;

export class Sam3Segmenter implements Segmenter {
  private ort: OrtModule | null = null;
  private sessions: { vision: Session; text: Session; decoder: Session } | null = null;
  private tokenizer: Awaited<ReturnType<typeof createClipTokenizer>> | null = null;
  /** last 2 images: sha → vision outputs (repeat prompts skip the 6-8 s encode) */
  private cache = new Map<string, Record<string, import("onnxruntime-node").Tensor>>();

  constructor(private readonly manager: SegmentModelManager) {}

  private async ensure(): Promise<void> {
    if (this.sessions) return;
    const st = await this.manager.ensureStatus();
    if (st.state !== "ready") throw new Error("the segmentation model is not installed yet");
    const dir = st.dir;
    // native module: lazy so the utility process boots without onnxruntime loaded
    this.ort ??= (await import("onnxruntime-node")) as OrtModule;
    const file = (name: string) => path.join(dir, name);
    const opts = { executionProviders: ["cpu"], graphOptimizationLevel: "all" } as const;
    this.sessions = {
      vision: await this.ort.InferenceSession.create(file("vision_encoder_int8.onnx"), opts),
      text: await this.ort.InferenceSession.create(file("text_encoder_int8.onnx"), opts),
      decoder: await this.ort.InferenceSession.create(file("decoder_int8.onnx"), opts),
    };
    this.tokenizer = createClipTokenizer(
      (await readFile(file("tokenizer-vocab.json"))).toString("utf8"),
      (await readFile(file("tokenizer-merges.txt"))).toString("utf8"),
    );
  }

  async segment(input: { png: Uint8Array; prompt: string; signal: AbortSignal }) {
    await this.ensure();
    const s = this.sessions;
    const ort = this.ort!;
    if (!s || !this.tokenizer) throw new Error("the segmentation model is not installed yet");

    const png = PNG.sync.read(Buffer.from(input.png));
    const w = png.width, h = png.height;
    const pixels = preprocess(new Uint8Array(png.data), w, h);

    // vision once per image content (cache hit = prompt round in ~1-2 s)
    const key = createHash("sha256").update(input.png).digest("hex").slice(0, 24);
    let vis = this.cache.get(key);
    if (!vis) {
      const t0 = Date.now();
      vis = await s.vision.run({ [s.vision.inputNames[0]]: new ort.Tensor("float32", pixels, [1, 3, 1008, 1008]) });
      if (input.signal.aborted) throw new DOMException("aborted", "AbortError");
      this.cache.delete(this.cache.keys().next().value ?? key); // keep ≤2
      this.cache.set(key, vis);
      void t0;
    }

    const ids = this.tokenizer.encodePhrase(input.prompt);
    const inputIds = new ort.Tensor("int64", BigInt64Array.from(ids, (x) => BigInt(x)), [1, 32]);
    const attn = new ort.Tensor("int64", BigInt64Array.from(ids.map((x) => (x === 0 ? 0n : 1n)), (x) => x), [1, 32]);
    const tOut = await s.text.run({ input_ids: inputIds, attention_mask: attn });
    const feed: Record<string, import("onnxruntime-node").Tensor> = {
      fpn_hidden_state_0: vis[s.vision.outputNames[0]],
      fpn_hidden_state_1: vis[s.vision.outputNames[1]],
      fpn_hidden_state_2: vis[s.vision.outputNames[2]],
      fpn_position_encoding_2: vis[s.vision.outputNames[6]],
      text_features: tOut[s.text.outputNames[0]],
      attention_mask: attn,
    };
    const dFeed: Record<string, import("onnxruntime-node").Tensor> = {};
    for (const n of s.decoder.inputNames) if (feed[n] !== undefined) dFeed[n] = feed[n];
    const dOut = await s.decoder.run(dFeed);
    if (input.signal.aborted) throw new DOMException("aborted", "AbortError");

    const masks = dOut[s.decoder.outputNames[0]];
    const boxes = dOut[s.decoder.outputNames[1]];
    const logits = dOut[s.decoder.outputNames[2]];
    const scores: number[] = Array.from(logits.data as Float32Array, (x) => 1 / (1 + Math.exp(-x)));
    const hits = scores.map((score, i) => ({ score, i })).filter((o) => o.score > SCORE_MIN).sort((a, b) => b.score - a.score).slice(0, 8);

    const out: { box: [number, number, number, number]; score: number; cutout: Uint8Array }[] = [];
    const maskGrid = new Float32Array(GRID * GRID);
    for (const { score, i } of hits) {
      maskGrid.set((masks.data as Float32Array).subarray(i * GRID * GRID, (i + 1) * GRID * GRID));
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
