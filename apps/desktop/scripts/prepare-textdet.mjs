#!/usr/bin/env node
/**
 * Prepare the DBNet text-line detector model (D22 detector lane, owner
 * decision 2026-11-11): downloads the PINNED PP-OCRv4 mobile det ONNX
 * (Apache-2.0, same bytes as the RapidOCR wheel benchmarked on the owner
 * image, 45/45 lines in 1.2s) plus its license into
 * resources/textdet/. electron-builder ships that dir as extraResources;
 * dev resolves the same path. Idempotent; refuses a checksum mismatch
 * and never leaves a half-populated dir (temp + rename).
 *
 * OIA_TEXTDET_MODEL=<file> copies a local file instead of downloading
 * (offline machines); the pinned checksum still applies.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODEL_URL = "https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx";
const LICENSE_URL = "https://raw.githubusercontent.com/RapidAI/RapidOCR/main/LICENSE";
const MODEL_SHA256 = "d2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9";
const LICENSE_SHA256 = "3e0af25fdd06aa9586ae97adb00ea927ebe5a3805ac77d2d3a81ce5f55693333";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "..", "resources", "textdet");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`download failed: ${url} -> ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

console.log("prepare-textdet: fetching the pinned DBNet det model (4.7 MB)…");
const model = process.env.OIA_TEXTDET_MODEL
  ? new Uint8Array(readFileSync(process.env.OIA_TEXTDET_MODEL))
  : await fetchBytes(MODEL_URL);
if (sha256(model) !== MODEL_SHA256) {
  throw new Error(`det model checksum mismatch: got ${sha256(model)}, expected ${MODEL_SHA256}; refusing to ship`);
}
const license = await fetchBytes(LICENSE_URL).catch(() => null);
if (license && sha256(license) !== LICENSE_SHA256) throw new Error("license checksum mismatch; refusing to ship");

const staged = `${outDir}.tmp-${process.pid}`;
rmSync(staged, { recursive: true, force: true });
mkdirSync(staged, { recursive: true });
writeFileSync(path.join(staged, "det.onnx"), model);
if (license) writeFileSync(path.join(staged, "LICENSE"), license);
writeFileSync(path.join(staged, "manifest.json"), JSON.stringify({
  files: { "det.onnx": MODEL_SHA256 },
  source: MODEL_URL,
  input: "x", output: "sigmoid_0.tmp_0",
  license: "Apache-2.0 (PaddleOCR PP-OCRv4 det via RapidOCR)",
  preprocessing: { limitSideLen: 736, limitType: "min", mean: 0.5, std: 0.5 },
  postprocessing: { thresh: 0.3, boxThresh: 0.5, unclipRatio: 1.6, maxCandidates: 1000 },
}, null, 2) + "\n");
rmSync(outDir, { recursive: true, force: true });
renameSync(staged, outDir); // atomic-ish: never a half-populated textdet dir
console.log(`prepare-textdet: ${outDir} ready (det.onnx + manifest + LICENSE)`);
if (!existsSync(path.join(outDir, "LICENSE"))) console.warn("prepare-textdet: license text could not be fetched (offline?); the manifest still records the license");
