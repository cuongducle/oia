#!/usr/bin/env node
/**
 * Generic REAL-quota task runner: submits any task type through the PRODUCTION
 * TaskStore with the real codex pair and saves every result artifact (owner
 * pre-approved quota for real-data runs, 2026-11-10, AGENTS.md).
 *
 * Usage:
 *   node scripts/task-real.mjs <taskType> <paramsJson> <outDir>
 * Any param string of the form "@file:<path>" is uploaded to the run's file
 * store first and replaced by its /api/files URL (references, sources).
 *
 * Example:
 *   node scripts/task-real.mjs image-edit \
 *     '{"reference":["@file:../../docs/private/real-runs/2026-11-10-remove-bg/input-product.png"],"prompt":"put the bottle on a marble table"}' out
 */
import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";

const [, , type, paramsJson, outDirArg] = process.argv;
if (!type || !paramsJson || !outDirArg) {
  console.error("usage: node scripts/task-real.mjs <taskType> <paramsJson> <outDir>");
  process.exit(64);
}
const outDir = path.resolve(outDirArg);
await mkdir(outDir, { recursive: true });
for (const name of ["report.json", "data/task-log.jsonl"]) {
  const exists = await access(path.join(outDir, name)).then(() => true, () => false);
  if (exists) throw new Error(`Refusing to overwrite real-run evidence: ${outDir}. Use a new run directory.`);
}

const { makeRealCtx } = await import("./real-lib.mjs");
const t0 = Date.now();
const ctx = await makeRealCtx(outDir);
if (type === "deconstruct") {
  const evidence = path.join(outDir, "provider");
  await mkdir(evidence, { recursive: true });
  let reads = 0;
  const readImage = ctx.chat.llm.readImage?.bind(ctx.chat.llm);
  if (readImage) ctx.chat.llm.readImage = async (prompt, image, schema, opts) => {
    const name = `read-${reads++}`;
    await writeFile(path.join(evidence, `${name}.png`), image);
    await writeFile(path.join(evidence, `${name}-request.json`), JSON.stringify({ prompt, schema }, null, 2));
    const raw = await readImage(prompt, image, schema, opts);
    await writeFile(path.join(evidence, `${name}.json`), raw);
    return raw;
  };
  const generate = ctx.chat.image.generate.bind(ctx.chat.image);
  ctx.chat.image.generate = async (input) => {
    const output = await generate(input);
    if (output.url.startsWith("data:image/png;base64,")) {
      await writeFile(path.join(evidence, "generated.png"), Buffer.from(output.url.split(",")[1], "base64"));
    }
    return output;
  };
}

// upload @file: placeholders
const params = JSON.parse(paramsJson);
const uploads = [];
async function substitute(node) {
  if (typeof node === "string" && node.startsWith("@file:")) {
    const bytes = new Uint8Array(await readFile(path.resolve(node.slice(6))));
    const up = await ctx.files.put(bytes, (node.split(".").pop() ?? "png").toLowerCase());
    uploads.push({ file: path.basename(node.slice(6)), url: up.url, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    return up.url;
  }
  if (Array.isArray(node)) return Promise.all(node.map(substitute));
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) node[k] = await substitute(node[k]);
  }
  return node;
}
await substitute(params);

console.log(`[task-real] submitting ${type}`, JSON.stringify({ ...params, uploads }));
const final = await ctx.taskStore.submit(type, params, { noWait: true });
await writeFile(path.join(outDir, "final.json"), JSON.stringify(final, null, 2), { flag: "wx" });
const saved = [];
let i = 0;
for (const url of final.taskResult?.download ? [final.taskResult.download] : []) {
  if (!url.startsWith("/api/files/")) continue; // zip bundles are virtual, skip
  const bytes = await ctx.files.read(url.replace(/^\/api\/files\//, ""));
  const name = `${type}-${i++}${path.extname(url) || ".bin"}`;
  await writeFile(path.join(outDir, name), bytes);
  saved.push({ name, bytes: bytes.length });
}
const report = {
  feature: type,
  taskId: final.taskId,
  elapsedMs: Date.now() - t0,
  progress: final.progress,
  errorClass: final.errorClass ?? null,
  msg: final.msg || null,
  note: final.taskNote ?? null,
  uploads,
  saved,
  quota: ctx.chat.meter.snapshot(),
};
await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`[task-real] ${final.progress === "succeeded" ? "OK" : "FAILED"}`, JSON.stringify(report, null, 2));
process.exit(final.progress === "succeeded" ? 0 : 1);
