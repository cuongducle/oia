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
import { execFileSync } from "node:child_process";

const [, , outDirArg] = process.argv;
if (!outDirArg) {
  console.error("usage: node scripts/cancel-real.mjs <outDir>");
  process.exit(64);
}
const outDir = path.resolve(outDirArg);
await mkdir(outDir, { recursive: true });

const { makeRealCtx, bundleLoopback } = await import("./real-lib.mjs");
const { startLoopback } = await bundleLoopback();
const t0 = Date.now();
const ctx = await makeRealCtx(outDir, { CODEX_IMAGE_TIMEOUT_MS: "300000" });

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
const slotWaitMs = Date.now() - slotT0;
// A3: read the probe record AFTER it settles (a snapshot at "processing"
// promised more than the evidence showed); poll to terminal, bounded
let probeRec = null;
for (let i = 0; i < 90; i++) {
  probeRec = (await api(`/tasks/${probe.data.taskId}`, { method: "GET" })).data;
  if (probeRec && probeRec.progress !== "processing") break;
  await new Promise((r) => setTimeout(r, 2000));
}

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
