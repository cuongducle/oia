import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Sam3Segmenter } from "../src/utility/segmentation/engine.js";
import { SegmentModelManager } from "../src/utility/segmentation/models.js";

/**
 * MANUAL REAL-MODEL GATE (never in the normal suite): runs SAM 3 int8 on the
 * downloaded 880 MB models against a real artwork, in PLAIN NODE. Purpose:
 * isolate the packaged-app utility crash (exit code 5, 2026-11-10 SG-1 e2e)
 * from onnxruntime-node itself. Run explicitly:
 *   pnpm --filter @oia/desktop exec vitest run test/segment-real.manual.test.ts
 * Requires the models dir (populated by the app's first-run download).
 */
const MODELS_DIR = process.env.OIA_SEGMENT_MODELS_DIR ?? path.join(process.env.HOME ?? "", "Desktop/oia-sam-e2e/models/sam3");
const ARTWORK = process.env.OIA_SEGMENT_ARTWORK ?? "/tmp/serum.png";

describe("SAM 3 real model (manual)", () => {
  it("segments a real artwork in plain Node (crash isolation for SG-1 e2e)", async () => {
    const manager = new SegmentModelManager(MODELS_DIR);
    const st = await manager.ensureStatus();
    console.log("[seg-real] model status:", JSON.stringify(st));
    expect(st.state).toBe("ready");
    const seg = new Sam3Segmenter(manager);
    const png = await readFile(ARTWORK);
    const t0 = Date.now();
    const out = await seg.segment({ png: new Uint8Array(png), prompt: "bottle", signal: new AbortController().signal });
    console.log(`[seg-real] segment took ${Date.now() - t0}ms, hits=${out.length}`);
    for (const o of out) console.log("[seg-real] box:", o.box.map((v: number) => v.toFixed(3)).join(" "), "score:", o.score.toFixed(3));
    expect(Array.isArray(out)).toBe(true);
  }, 300_000);
});
