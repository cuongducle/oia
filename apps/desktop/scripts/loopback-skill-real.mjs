#!/usr/bin/env node
/**
 * REAL e2e of the agent lane: the loopback API with REAL providers + a REAL
 * API key + the actual skill CLI (oia-ppt-translate), the exact surface an
 * external agent uses (matrix gap C2). Owner pre-approved quota 2026-11-10.
 *
 * Usage: node scripts/loopback-skill-real.mjs <input.pptx> <language> <outDir>
 * Bundles src/utility/loopback.ts with esbuild on the fly (it is desktop src,
 * not a package dist), starts it over a REAL ServiceContext, mints a key,
 * then spawns packages/skills/skills/oia-ppt-translate/scripts/task.mjs with
 * OIA_BASE_URL/OIA_API_KEY, exactly as an agent would.
 */
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [, , inputPath, language, outDirArg] = process.argv;
if (!inputPath || !language || !outDirArg) {
  console.error("usage: node scripts/loopback-skill-real.mjs <input.pptx> <language> <outDir>");
  process.exit(64);
}
const root = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(root, "../..");
const outDir = path.resolve(outDirArg);
await mkdir(outDir, { recursive: true });

// loopback.ts is desktop TS source: bundle it for node (no electron imports)
const bundle = path.join(outDir, "loopback-bundle.cjs");
const esbuild = spawnSync("npx", ["esbuild", path.join(root, "src/utility/loopback.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundle}`], { cwd: root, encoding: "utf8" });
if (esbuild.status !== 0) {
  console.error("[lb-real] esbuild failed:", esbuild.stderr);
  process.exit(1);
}
const { startLoopback } = await import(pathToFileURL(bundle).href);
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
const jobEvents = [];
const srv = await startLoopback({
  ctx: () => ctx,
  userDataDir: outDir,
  env: process.env,
  emit: (ev) => jobEvents.push(ev),
});

const key = await ctx.keys.create("loopback-skill-real");
const bytes = new Uint8Array(await readFile(path.resolve(inputPath)));
const uploaded = await ctx.files.put(bytes, "pptx");
const base = `http://127.0.0.1:${srv.port}/api`;
console.log(`[lb-real] loopback on ${base}, deck ${uploaded.url}`);

// THE REAL SKILL, exactly as an agent runs it
const skill = path.join(repo, "packages/skills/skills/oia-ppt-translate/scripts/task.mjs");
const child = spawn(process.execPath, [skill, "--file-url", uploaded.url, "--language", language], {
  env: { ...process.env, OIA_BASE_URL: base, OIA_API_KEY: key.plaintext },
  stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
child.stdout.on("data", (c) => { out += c; process.stdout.write(`[skill] ${c}`); });
child.stderr.on("data", (c) => process.stderr.write(`[skill:err] ${c}`));
const code = await new Promise((resolve) => child.on("close", (c) => resolve(c ?? -1)));

const skillResult = (() => { try { return JSON.parse(out); } catch { return { parseError: out.slice(0, 400) }; } })();
const task = (() => { try { return skillResult.taskId ? ctx.taskStore.get(skillResult.taskId) : null; } catch { return null; } })();
const downloadBytes = (skillResult.taskResult?.download ?? skillResult.download)?.startsWith?.("/api/files/")
  ? (await ctx.files.read((skillResult.taskResult?.download ?? skillResult.download).replace(/^\/api\/files\//, ""))).length
  : 0;
const report = {
  feature: "loopback agent lane + oia-ppt-translate skill (real)",
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
