#!/usr/bin/env node
/**
 * REAL e2e of the agent lane with an ACTUAL skill CLI (matrix A: loopback+skill).
 * Generic: any skill script, any args; `@file:<path>` args are uploaded to the
 * run's store and replaced by their /api/files URL first.
 *
 * Usage:
 *   node scripts/loopback-skill-real.mjs <skillScript.mjs> <outDir> [args...]
 * Example (the skill that the 2026-11-13 bulk patch broke, proving the fix):
 *   node scripts/loopback-skill-real.mjs \
 *     ../../packages/skills/skills/oia-image-edit/scripts/image_edit.mjs out \
 *     --prompt "put the bottle on a marble table" --reference @file:photo.png
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const argv = process.argv.slice(2);
const skillArg = argv[0];
const outDirArg = argv[1];
const skillArgs = argv.slice(2);
if (!skillArg || !outDirArg) {
  console.error("usage: node scripts/loopback-skill-real.mjs <skillScript.mjs> <outDir> [args...]");
  process.exit(64);
}
const skillScript = path.resolve(skillArg);
const outDir = path.resolve(outDirArg);
await mkdir(outDir, { recursive: true });

const { makeRealCtx, bundleLoopback } = await import("./real-lib.mjs");
const t0 = Date.now();
const ctx = await makeRealCtx(outDir);
const jobEvents = [];
const { startLoopback } = await bundleLoopback();
const srv = await startLoopback({ ctx: () => ctx, userDataDir: outDir, env: process.env, emit: (ev) => jobEvents.push(ev) });

// upload @file: placeholders (same contract as task-real.mjs)
const uploads = [];
const finalArgs = await Promise.all(skillArgs.map(async (a) => {
  if (!a.startsWith("@file:")) return a;
  const bytes = new Uint8Array(await readFile(path.resolve(a.slice(6))));
  const up = await ctx.files.put(bytes, (a.split(".").pop() ?? "png").toLowerCase());
  uploads.push({ file: path.basename(a.slice(6)), url: up.url, bytes: bytes.length });
  return up.url;
}));

const key = await ctx.keys.create("loopback-skill-real");
const base = `http://127.0.0.1:${srv.port}/api`;
console.log(`[lb-real] loopback on ${base}, skill ${path.basename(skillScript)}`, JSON.stringify(uploads));

const child = spawn(process.execPath, [skillScript, ...finalArgs], {
  env: { ...process.env, OIA_BASE_URL: base, OIA_API_KEY: key.plaintext },
  stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
child.stdout.on("data", (c) => { out += c; process.stdout.write(`[skill] ${c}`); });
child.stderr.on("data", (c) => process.stderr.write(`[skill:err] ${c}`));
const code = await new Promise((resolve) => child.on("close", (c) => resolve(c ?? -1)));

const skillResult = (() => { try { return JSON.parse(out); } catch { return { parseError: out.slice(0, 400) }; } })();
const task = (() => { try { return skillResult.taskId ? ctx.taskStore.get(skillResult.taskId) : null; } catch { return null; } })();
const download = task?.taskResult?.download ?? null;
const downloadBytes = download?.startsWith("/api/files/")
  ? (await ctx.files.read(download.replace(/^\/api\/files\//, ""))).length
  : 0;
const report = {
  feature: `loopback agent lane + ${path.basename(path.dirname(path.dirname(skillScript)))} skill (real)`,
  skillExit: code,
  skillOk: skillResult.ok === true,
  taskId: skillResult.taskId ?? null,
  progress: task?.progress ?? null,
  note: task?.taskNote ?? null,
  downloadBytes,
  agentJobEvents: jobEvents.map((e) => `${e.event}:${e.taskType}:${e.lane}`),
  elapsedMs: Date.now() - t0,
  quota: ctx.chat.meter.snapshot(),
};
await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log("[lb-real]", JSON.stringify(report, null, 2));
await srv.close();
process.exit(report.skillOk && report.progress === "succeeded" && downloadBytes > 0 ? 0 : 1);
