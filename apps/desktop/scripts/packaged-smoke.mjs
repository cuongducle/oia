#!/usr/bin/env node
/**
 * SG-2 (surgepix-parity-todo.md): smoke a PACKAGED Oia build against a
 * throwaway userData dir, never the real profile.
 *
 * The app side needs no test hooks beyond what production already ships:
 *   OIA_USER_DATA_DIR=<abs dir>     validated (absolute, not the default dir),
 *                                   probed with a write, honored when packaged
 *   OIA_DESKTOP_PACKAGED_SMOKE=1    the ONLY test mode a packaged build may run,
 *                                   and the OIA_DESKTOP_ prefix default-denies
 *                                   real providers, so it can never bill quota
 *
 * Three scenarios, all must pass:
 *   1. happy:   fresh temp dir, app boots renderer + utility + one mock task
 *   2. refuse:  a RELATIVE path must fail fast with the marker line, non-zero
 *   3. refuse:  an unwritable path must fail fast with the marker line, non-zero
 *
 * Usage:
 *   node scripts/packaged-smoke.mjs [path-to-Oia-executable]
 *   (default: dist/mac-arm64/Oia.app/Contents/MacOS/Oia, overridable because
 *   the dmg mounts elsewhere and Windows uses a different layout)
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DEFAULT_BIN = path.resolve("dist/mac-arm64/Oia.app/Contents/MacOS/Oia");
const bin = path.resolve(process.argv[2] ?? process.env.OIA_PACKAGED_APP ?? DEFAULT_BIN);
const REFUSAL_MARKER = "[user-data] refusing to start";

/** Run one packaged-smoke scenario. Resolves { code, out }. */
function runScenario(name, env, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(bin, [], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const tick = setTimeout(() => {
      out += `\n[packaged-smoke.mjs] TIMEOUT after ${timeoutMs}ms, killing`;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (c) => { out += c.toString(); process.stdout.write(`[${name}] ${c}`); });
    child.stderr.on("data", (c) => { out += c.toString(); process.stderr.write(`[${name}] ${c}`); });
    child.on("close", (code) => { clearTimeout(tick); resolve({ code: code ?? -1, out }); });
  });
}

const results = [];

/** The cookie-encryption fuse (electron-builder electronFuses) makes Electron
 * read its "<name> Safe Storage" key from the macOS keychain. Every LOCAL build
 * is ad-hoc signed with a FRESH identity, so a key created by an earlier build
 * no longer ACL-matches and macOS throws a MODAL SecurityAgent prompt that
 * blocks boot forever (no window, no log). A scripted smoke must clear that
 * stale item first; the smoke binary then creates its own. HARMLESS for real
 * data: Oia stores no site cookies, codex auth lives in CODEX_HOME. Signed
 * releases (SG-12) get a stable identity and stop needing this. Non-mac: no-op. */
function clearStaleSafeStorageKey() {
  if (process.platform !== "darwin") return;
  const del = spawnSync("security", ["delete-generic-password", "-s", "Oia Safe Storage"], { encoding: "utf8" });
  console.log(`[packaged-smoke.mjs] stale keychain key cleared: ${del.status === 0 ? "yes" : "none present"}`);
}
clearStaleSafeStorageKey();

// ---- 1. happy path ---------------------------------------------------------
const dataDir = mkdtempSync(path.join(tmpdir(), "oia-packaged-smoke-"));
const happy = await runScenario("happy", { OIA_USER_DATA_DIR: dataDir, OIA_DESKTOP_PACKAGED_SMOKE: "1" }, 120_000);
const happyOk = happy.code === 0 && happy.out.includes("DESKTOP_PACKAGED_SMOKE OK");
results.push({ name: "boot+utility+mock task in the override dir", ok: happyOk, code: happy.code });
if (!happyOk) console.error(`[packaged-smoke.mjs] HAPPY PATH FAILED (code ${happy.code})`);

// ---- 2. relative path must be refused fast ---------------------------------
const relative = await runScenario("relative", { OIA_USER_DATA_DIR: "relative/oia-dir", OIA_DESKTOP_PACKAGED_SMOKE: "1" }, 30_000);
const relativeOk = relative.code !== 0 && relative.out.includes(REFUSAL_MARKER) && relative.out.includes("absolute");
results.push({ name: "relative OIA_USER_DATA_DIR refused with the marker", ok: relativeOk, code: relative.code });
if (!relativeOk) console.error(`[packaged-smoke.mjs] RELATIVE REFUSAL FAILED (code ${relative.code})`);

// ---- 3. unwritable path must be refused fast -------------------------------
// A FILE where a directory is needed: mkdir -p fails with ENOTDIR on every OS.
const blockerFile = path.join(tmpdir(), `oia-ps-blocker-${process.pid}`);
writeFileSync(blockerFile, "not a dir");
const unwritableDir = path.join(blockerFile, "userData");
const unwritable = await runScenario("unwritable", { OIA_USER_DATA_DIR: unwritableDir, OIA_DESKTOP_PACKAGED_SMOKE: "1" }, 30_000);
const unwritableOk = unwritable.code !== 0 && unwritable.out.includes(REFUSAL_MARKER) && unwritable.out.includes("not writable");
results.push({ name: "unwritable OIA_USER_DATA_DIR refused with the marker", ok: unwritableOk, code: unwritable.code });
if (!unwritableOk) console.error(`[packaged-smoke.mjs] UNWRITABLE REFUSAL FAILED (code ${unwritable.code})`);
rmSync(blockerFile, { force: true });

// ---- verdict ---------------------------------------------------------------
for (const r of results) console.log(`[packaged-smoke.mjs] ${r.ok ? "PASS" : "FAIL"} ${r.name} (exit ${r.code})`);
if (results.every((r) => r.ok)) {
  console.log("PACKAGED_SMOKE OK (3/3)");
  process.exit(0);
}
console.error("PACKAGED_SMOKE FAILED");
process.exit(1);
