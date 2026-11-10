#!/usr/bin/env node
/**
 * Prepare the SAM sidecar runtime (segmentation-process-plan.md, option A):
 * builds apps/desktop/segment-runner (cargo, release) and copies it plus the
 * PINNED libonnxruntime (from the onnxruntime-node package, so the runner
 * executes the exact ORT the app was tested with) into
 * resources/segment/<platform>-<arch>/. electron-builder ships that dir as
 * extraResources; dev builds resolve the same path.
 *
 * CI dist jobs run this before electron-builder on each OS; locally it needs
 * a Rust toolchain (cargo). Idempotent; refuses to half-write (temp + rename).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, "..");
const plat = `${process.platform}-${process.arch}`;
const outDir = path.join(app, "resources", "segment", plat);
const exe = process.platform === "win32" ? "oia-segment-runner.exe" : "oia-segment-runner";
const ortLib = process.platform === "win32" ? "onnxruntime.dll" : process.platform === "linux" ? "libonnxruntime.so" : "libonnxruntime.1.dylib";
const ortSrc = path.join(app, "node_modules", "onnxruntime-node", "bin", "napi-v6", process.platform, process.arch, ortLib);

function die(msg) {
  console.error(`prepare-segment: ${msg}`);
  process.exit(1);
}

if (!existsSync(path.join(app, "segment-runner", "Cargo.toml"))) die("segment-runner crate missing");
if (!existsSync(ortSrc)) die(`pinned ORT library not found at ${ortSrc} (run pnpm install first)`);

console.log(`prepare-segment: building oia-segment-runner (${plat})…`);
execFileSync("cargo", ["build", "--release"], { cwd: path.join(app, "segment-runner"), stdio: "inherit" });

const built = path.join(app, "segment-runner", "target", "release", exe);
if (!existsSync(built)) die(`cargo did not produce ${built}`);

mkdirSync(outDir, { recursive: true });
const staged = `${outDir}.tmp-${process.pid}`;
rmSync(staged, { recursive: true, force: true });
mkdirSync(staged, { recursive: true });
copyFileSync(built, path.join(staged, exe));
copyFileSync(ortSrc, path.join(staged, ortLib));
rmSync(outDir, { recursive: true, force: true });
renameSync(staged, outDir); // atomic-ish: never a half-populated segment dir
console.log(`prepare-segment: ${outDir} ready (${exe} + ${ortLib})`);
