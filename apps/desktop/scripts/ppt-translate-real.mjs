#!/usr/bin/env node
/**
 * REAL-quota run of the ppt-translate task through the PRODUCTION TaskStore and
 * the real codex pair (SG-7 real-data gate). Owner approved quota spend for
 * real-data feature runs on 2026-11-10 (recorded in the parity ledger).
 *
 * Usage:
 *   node scripts/ppt-translate-real.mjs <input.pptx> <language> <outDir>
 * Example:
 *   node scripts/ppt-translate-real.mjs \
 *     ../../docs/private/real-runs/2026-11-10-ppt-translate/input-deck.pptx \
 *     Vietnamese ../../docs/private/real-runs/2026-11-10-ppt-translate
 *
 * Artifacts written to <outDir>: output-<language>.pptx + report.json
 * (elapsed, quota meter snapshot, task note/records). Never for CI: it bills
 * real tokens, exactly like OIA_DESKTOP_REAL_SMOKE.
 */
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [, , inputPath, language, outDirArg] = process.argv;
if (!inputPath || !language || !outDirArg) {
  console.error("usage: node scripts/ppt-translate-real.mjs <input.pptx> <language> <outDir>");
  process.exit(64);
}
const root = path.resolve(import.meta.dirname, ".."); // apps/desktop
const outDir = path.resolve(outDirArg);
await mkdir(outDir, { recursive: true });

// The workspace links under apps/desktop/node_modules resolve @oia/services
// to the built dist, the same code the utility process runs in production.
const { createServiceContext } = await import("@oia/services");

const t0 = Date.now();
const ctx = await createServiceContext({
  dataDir: path.join(outDir, "data"),
  env: {
    ...process.env,
    LLM_PROVIDER: "codex",
    IMAGE_PROVIDER: "codex",
    CODEX_BIN: path.join(root, "resources/codex/current/bin/codex"),
    CODEX_PLANNER_TIMEOUT_MS: "240000",
  },
});

const bytes = new Uint8Array(await readFile(path.resolve(inputPath)));
const uploaded = await ctx.files.put(bytes, "pptx");
console.log(`[ppt-real] uploaded ${bytes.length} bytes → ${uploaded.url}`);

const final = await ctx.taskStore.submit("ppt-translate", { fileUrl: uploaded.url, language }, { noWait: true });
const report = {
  feature: "SG-7 ppt-translate",
  input: path.basename(inputPath),
  language,
  elapsedMs: Date.now() - t0,
  progress: final.progress,
  errorClass: final.errorClass ?? null,
  msg: final.msg || null,
  note: final.taskNote ?? null,
  quota: ctx.chat.meter.snapshot(),
};
await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

if (final.progress !== "succeeded" || !final.taskResult?.download) {
  console.error("[ppt-real] FAILED", JSON.stringify(report, null, 2));
  process.exit(1);
}
const outBytes = await ctx.files.read(final.taskResult.download.replace(/^\/api\/files\//, ""));
const outFile = path.join(outDir, `output-${language.toLowerCase()}.pptx`);
await writeFile(outFile, outBytes);
console.log("[ppt-real] OK", JSON.stringify({ ...report, output: path.basename(outFile), bytes: outBytes.length }, null, 2));
process.exit(0);
