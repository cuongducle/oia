#!/usr/bin/env node
/**
 * REAL mid-run cancel (matrix gap C4): submit a long real generation, cancel it
 * mid-flight, then verify the three promises the docs make:
 * 1. the record stays honest (failed/cancelled, or succeeded-with-result-kept
 *    if it completed before the cancel landed, B7),
 * 2. the detached codex process tree actually DIES (TP-D5),
 * 3. the shared metered slot is RELEASED (a follow-up task is admitted at once).
 * Owner pre-approved quota 2026-11-10.
 *
 * Usage: node scripts/cancel-real.mjs <outDir>
 */
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const [, , outDirArg] = process.argv;
if (!outDirArg) {
  console.error("usage: node scripts/cancel-real.mjs <outDir>");
  process.exit(64);
}
const root = path.resolve(import.meta.dirname, "..");
const outDir = path.resolve(outDirArg);
await mkdir(outDir, { recursive: true });

// the guarded lane lives in desktop src; bundle it for node like loopback-skill-real
const bundle = path.join(outDir, "loopback-bundle.cjs");
const esbuild = spawnSync("npx", ["esbuild", path.join(root, "src/utility/loopback.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundle}`], { cwd: root, encoding: "utf8" });
if (esbuild.status !== 0) { console.error(esbuild.stderr); process.exit(1); }
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
    CODEX_IMAGE_TIMEOUT_MS: "300000",
  },
});

const codexProcs = () => {
  try {
    return execFileSync("pgrep", ["-f", "resources/codex/current/bin/codex"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch {
    return []; // pgrep exits 1 when none match
  }
};

const srv = await startLoopback({ ctx: () => ctx, userDataDir: outDir, env: process.env, emit: () => {} });
const key = await ctx.keys.create("cancel-real");
const api = async (pathName, init) => (await fetch(`http://127.0.0.1:${srv.port}/api${pathName}`, { ...init, headers: { ...init?.headers, "content-type": "application/json", authorization: key.plaintext } })).json();
console.log("[cancel-real] submitting a 5-slide real presentation THROUGH THE LOOPBACK, will cancel mid-flight…");
const started = (await api("/tasks/generate-presentation", { method: "POST", body: JSON.stringify({ prompt: "5 slide deck về serum retinol, mỗi slide một ảnh sản phẩm", n: 5, language: "vi", source: "agent" }) })).data;
await new Promise((r) => setTimeout(r, 20_000)); // mid-flight: outline done, an image generating
const during = codexProcs();
const cancelOk = (await api("/tasks/cancel", { method: "POST", body: JSON.stringify({ taskId: started.taskId }) })).data?.cancelled === true;
await new Promise((r) => setTimeout(r, 8_000)); // give the abort a chance to reach the tree
const after = codexProcs();

// 3. slot released? a follow-up METERED submit through the SAME guarded lane must
// be ADMITTED (a leaked slot would 429 with the exact busy message)
const slotT0 = Date.now();
const probe = await api("/tasks/generate-poster", { method: "POST", body: JSON.stringify({ prompt: "tiny probe poster after cancel", source: "agent" }) });
const slotReleased = probe.code === 0; // 429/MeteredBusy would be code 429
const probeRec = (await api(`/tasks/${probe.data.taskId}`, { method: "GET" })).data;
const slotWaitMs = Date.now() - slotT0;
await new Promise((r) => setTimeout(r, 60_000)); // let the probe generation settle for its record

const record = (() => { try { return ctx.taskStore.get(started.taskId); } catch { return null; } })();
const honest =
  record?.progress === "failed" && (record.errorClass === "cancelled" || /cancel/i.test(record.msg ?? "")) ||
  record?.progress === "succeeded"; // cancelled AFTER completion keeps the result (B7)
const report = {
  feature: "real mid-run cancel (generate-presentation)",
  cancelAccepted: cancelOk,
  recordProgress: record?.progress ?? null,
  recordErrorClass: record?.errorClass ?? null,
  recordMsg: (record?.msg ?? "").slice(0, 160),
  codexDuring: during.length,
  codexAfterCancel: after.length,
  slotProbeProgress: probeRec?.progress ?? "n/a",
  slotProbeDownload: probeRec?.taskResult?.download ?? null,
  slotWaitMs,
  probeHttpStatus: probe.code,
  elapsedMs: Date.now() - t0,
  quota: ctx.chat.meter.snapshot(),
  verdict: {
    honestRecord: honest,
    treeDied: after.length < during.length || during.length === 0,
    slotReleased,
  },
};
await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
const ok = report.verdict.honestRecord && report.verdict.treeDied && report.verdict.slotReleased;
console.log("[cancel-real]", JSON.stringify(report, null, 2));
await srv.close();
process.exit(ok ? 0 : 1);
