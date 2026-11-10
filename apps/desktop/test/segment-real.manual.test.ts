import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Sam3Segmenter } from "../src/utility/segmentation/engine.js";
import { SegmentModelManager } from "../src/utility/segmentation/models.js";
import { resolveSegmentRuntime, SegmentRunner } from "../src/utility/segmentation/runner.js";

/**
 * MANUAL REAL-MODEL GATE (never in the normal suite): the FULL split-layer
 * pipeline through the REAL sidecar runner (option A,
 * segmentation-process-plan.md): real 880 MB models, real Rust binary, real
 * pipe, real ORT 1.31.1. Run explicitly:
 *   pnpm --filter @oia/desktop exec vitest run test/segment-real.manual.test.ts
 * Requires the models dir (populated by the app's first-run download) and
 * `node scripts/prepare-segment.mjs` for the runner. This is the gate that
 * once proved in-process ORT works in plain Node; now it proves the sidecar
 * produces the same quality through the new architecture.
 */
const MODELS_DIR = process.env.OIA_SEGMENT_MODELS_DIR ?? path.join(process.env.HOME ?? "", "Desktop/oia-sam-e2e/models/sam3");
const ARTWORK = process.env.OIA_SEGMENT_ARTWORK ?? "/tmp/serum.png";
const RUNTIME = resolveSegmentRuntime(path.resolve("resources/segment", `${process.platform}-${process.arch}`));

// Manual gate: never in the normal suite (CI has no 880 MB models, no
// prepared sidecar). Opt in: OIA_RUN_REAL_SEGMENT=1 pnpm --filter @oia/desktop
// exec vitest run test/segment-real.manual.test.ts
const maybe = process.env.OIA_RUN_REAL_SEGMENT === "1" ? describe : describe.skip;

maybe("SAM 3 real model through the sidecar (manual)", () => {
  it("segments a real artwork via the native runner", async () => {
    expect(RUNTIME, "sidecar runtime missing; run node scripts/prepare-segment.mjs").not.toBeNull();
    const manager = new SegmentModelManager(MODELS_DIR);
    const st = await manager.ensureStatus();
    console.log("[seg-real] model status:", JSON.stringify(st));
    expect(st.state).toBe("ready");

    const seg = new Sam3Segmenter(manager, RUNTIME!, new SegmentRunner(RUNTIME!));
    const png = await readFile(ARTWORK);
    const t0 = Date.now();
    const out = await seg.segment({ png: new Uint8Array(png), prompt: "bottle", signal: new AbortController().signal });
    console.log(`[seg-real] segment took ${Date.now() - t0}ms, hits=${out.length}`);
    for (const o of out) console.log("[seg-real] box:", o.box.map((v) => v.toFixed(3)).join(" "), "score:", o.score.toFixed(3));
    expect(out.length).toBeGreaterThanOrEqual(1);
    // same object the plain-Node in-process run found (reference: score 0.939,
    // box 0.544 0.299 0.730 0.641): the sidecar must not change quality
    const best = out[0];
    expect(best.score).toBeGreaterThan(0.8);
    for (const [i, v] of best.box.entries()) {
      expect(Math.abs(v - [0.544, 0.299, 0.730, 0.641][i])).toBeLessThan(0.02);
    }

    // prompt round 2 on the SAME image: the vision cache (both sides) makes it fast
    const t1 = Date.now();
    const again = await seg.segment({ png: new Uint8Array(png), prompt: "product", signal: new AbortController().signal });
    console.log(`[seg-real] second prompt took ${Date.now() - t1}ms, hits=${again.length}`);
    expect(Date.now() - t1).toBeLessThan(20_000);
  }, 300_000);
});
