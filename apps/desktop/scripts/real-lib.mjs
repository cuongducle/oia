#!/usr/bin/env node
/**
 * Shared bootstrap for the REAL-quota harnesses (owner pre-approved, AGENTS.md
 * 2026-11-10). Every *-real.mjs script used to copy-paste this ~30-line setup
 * with three different outDir conventions; one home now.
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

export const REPO = path.resolve(import.meta.dirname, "../..");
export const DESKTOP = path.resolve(import.meta.dirname, "..");
export const CODEX_BIN = path.join(DESKTOP, "resources/codex/current/bin/codex");

/** The env that selects the REAL pinned codex pair (both providers, no mock mixing). */
export function realEnv(extra = {}) {
  return {
    ...process.env,
    LLM_PROVIDER: "codex",
    IMAGE_PROVIDER: "codex",
    CODEX_BIN,
    CODEX_PLANNER_TIMEOUT_MS: "240000",
    CODEX_IMAGE_TIMEOUT_MS: "300000",
    ...extra,
  };
}

/** A real ServiceContext over <outDir>/data. */
export async function makeRealCtx(outDir, extraEnv = {}) {
  const { createServiceContext } = await import("@oia/services");
  return createServiceContext({ dataDir: path.join(outDir, "data"), env: realEnv(extraEnv) });
}

/** Bundle src/utility/loopback.ts (desktop TS, no package dist) for plain-node use.
 *  Built into a TEMP dir, never into the evidence dir (400KB build artifacts
 *  do not belong in evidence). */
export async function bundleLoopback() {
  const dir = mkdtempSync(path.join(tmpdir(), "oia-lb-bundle-"));
  const out = path.join(dir, "loopback.cjs");
  const res = spawnSync("npx", ["esbuild", path.join(DESKTOP, "src/utility/loopback.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${out}`], { cwd: DESKTOP, encoding: "utf8" });
  if (res.status !== 0) throw new Error(`esbuild loopback failed: ${res.stderr}`);
  const { startLoopback } = await import(pathToFileURL(out).href);
  return { startLoopback, bundlePath: out };
}
