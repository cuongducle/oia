#!/usr/bin/env node
// Real image authoring only. Each brief runs once, no automatic paid retries.
import path from "node:path";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { makeRealCtx } from "./real-lib.mjs";

const [manifestPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !outputPath) throw new Error("Usage: node scripts/template-backgrounds-real.mjs briefs.json output-directory");
const briefs = JSON.parse(await readFile(manifestPath, "utf8"));
const output = path.resolve(outputPath);
await mkdir(output, { recursive: true });
if (await access(path.join(output, "started.json")).then(() => true, () => false)) throw new Error("Refusing to repeat a paid batch. Use a new directory for explicit retries.");
await writeFile(path.join(output, "started.json"), JSON.stringify({ startedAt: new Date().toISOString(), briefs }, null, 2), { flag: "wx" });
const ctx = await makeRealCtx(output);
let current;
let stopping = false;
async function stop() {
  stopping = true;
  if (current) await ctx.taskStore.cancel(current);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const report = [];
try {
  for (const brief of briefs) {
    if (stopping) break;
    console.log(`[template-image] starting ${brief.id}`);
    const submitted = await ctx.taskStore.submit("generate-poster", { prompt: brief.prompt, size: brief.size });
    current = submitted.taskId;
    let final = submitted;
    while (final.progress === "processing") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      final = await ctx.taskStore.get(current);
      if (!final) throw new Error(`Missing task ${current}`);
    }
    const download = final.taskResult?.download;
    if (final.progress === "succeeded" && download?.startsWith("/api/files/")) {
      const bytes = await ctx.files.read(download.slice("/api/files/".length));
      await writeFile(path.join(output, `${brief.id}.png`), bytes, { flag: "wx" });
    }
    report.push({ id: brief.id, task: final, quota: ctx.chat.meter.snapshot() });
    await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    console.log(`[template-image] ${brief.id}: ${final.progress} ${JSON.stringify(ctx.chat.meter.snapshot())}`);
    current = undefined;
    if (final.progress !== "succeeded") throw new Error(`Generation failed for ${brief.id}, stopping without retries`);
  }
} finally {
  if (current) await ctx.taskStore.cancel(current);
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
