#!/usr/bin/env node
/**
 * REAL-quota end-to-end for the D22 detector lane (owner decision 2026-11-11,
 * owner pre-approved real-run quota 2026-11-10).
 *
 *   node scripts/deconstruct-textdet-real.mjs <input.png> <outDir>
 *
 * The REAL deconstruct task runs through createServiceContext with the REAL
 * DbNetTextDetector injected (native sidecar + pinned model), codex providers,
 * and honest failures. Evidence is refuse-to-overwrite and input-pinned by
 * SHA-256. Output layout stays compatible with deconstruct-render-real.mjs.
 */
import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

const [, , inputArg, outDirArg] = process.argv;
if (!inputArg || !outDirArg) {
  console.error("usage: node scripts/deconstruct-textdet-real.mjs <input.png> <outDir>");
  process.exit(64);
}
const input = path.resolve(inputArg);
const outDir = path.resolve(outDirArg);
await mkdir(outDir, { recursive: true });
for (const name of ["report.json", "final.json"]) {
  if (await access(path.join(outDir, name)).then(() => true, () => false)) {
    throw new Error(`Refusing to overwrite real-run evidence: ${outDir}. Use a new run directory.`);
  }
}

const desktop = path.resolve(import.meta.dirname, "..");
const bundleDir = path.join(outDir, ".bundle");
await mkdir(bundleDir, { recursive: true });
await build({
  stdin: {
    resolveDir: desktop,
    contents: `
      import { DbNetTextDetector } from ${JSON.stringify(path.join(desktop, "src/utility/textdet.ts"))};
      import { SegmentRunner, resolveSegmentRuntime } from ${JSON.stringify(path.join(desktop, "src/utility/segmentation/runner.ts"))};
      import path from "node:path";
      export const makeDetector = (platformDir) => {
        const rt = resolveSegmentRuntime(platformDir);
        if (!rt) throw new Error("segment sidecar runtime missing: run pnpm --filter @oia/desktop prepare-segment");
        return new DbNetTextDetector(path.join(${JSON.stringify(desktop)}, "resources/textdet"), new SegmentRunner(rt));
      };
    `,
  },
  bundle: true, format: "cjs", platform: "node", outfile: path.join(bundleDir, "detector.cjs"),
});
const { createRequire } = await import("node:module");
const nodeRequire = createRequire(path.join(desktop, "package.json"));
const { makeDetector } = nodeRequire(path.join(bundleDir, "detector.cjs"));
const platform = `${process.platform}-${process.arch}`;

const original = new Uint8Array(await readFile(input));
const sha256 = createHash("sha256").update(original).digest("hex");
const { makeRealCtx } = await import("./real-lib.mjs");
const detector = makeDetector(path.join(desktop, "resources/segment", platform));
const ctx = await makeRealCtx(outDir, { OIA_TEXTDET_DIR: path.join(desktop, "resources/textdet") });
// inject the detector exactly the way the utility process does
ctx.taskStore.register("deconstruct", (await import("@oia/tasks")).makeDeconstruct({
  store: ctx.files, image: ctx.chat.image, llm: ctx.chat.llm, textDetector: detector,
}));

const t0 = Date.now();
const upload = await ctx.files.put(original, "png");
const task = await ctx.taskStore.submit("deconstruct", { fileUrl: upload.url }, { noWait: true, jobId: "textdet-real" });
const record = await ctx.taskStore.get(task.taskId);

const plate = record.progress === "succeeded" ? await ctx.files.read(record.taskResult.download.replace(/^\/api\/files\//, "")) : null;
if (plate) await writeFile(path.join(outDir, "deconstruct-0.png"), plate);
await writeFile(path.join(outDir, "final.json"), JSON.stringify({
  taskId: record.taskId,
  progress: record.progress,
  errorClass: record.errorClass ?? null,
  taskResult: plate ? { download: "/api/files/local/deconstruct-0.png", texts: record.taskResult.texts } : record.taskResult,
  taskNote: record.taskNote ?? null,
}, null, 2));
await writeFile(path.join(outDir, "report.json"), JSON.stringify({
  scope: "Detector-lane real run: DBNet sidecar owns geometry, one classify read + crop-sheet reads + one plate generation max. Same processor as the product (makeDeconstruct with the injected textDetector).",
  feature: "deconstruct-textdet",
  taskId: record.taskId,
  progress: record.progress,
  errorClass: record.errorClass ?? null,
  msg: record.errorMsg ?? record.taskNote ?? null,
  originalSha256: sha256,
  uploads: [{ file: path.basename(input), url: upload.url, bytes: original.length, sha256 }],
  saved: plate ? [{ name: "deconstruct-0.png", bytes: plate.length }] : [],
  texts: record.taskResult?.texts?.length ?? 0,
  note: record.taskNote ?? null,
  modelSha256: createHash("sha256").update(await readFile(path.join(desktop, "resources/textdet/det.onnx"))).digest("hex"),
  elapsedMs: Date.now() - t0,
  quota: ctx.chat.meter.snapshot(),
}, null, 2));
console.log(`[textdet-real] ${record.progress} texts=${record.taskResult?.texts?.length ?? 0} elapsed=${Date.now() - t0}ms`);
console.log(JSON.stringify({ quota: ctx.chat.meter.snapshot(), note: record.taskNote, errorClass: record.errorClass ?? null }));
process.exit(record.progress === "succeeded" ? 0 : 1);
