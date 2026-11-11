// Offline layout regression: preserve recorded text/kernel pairing and paid plate.
// Usage: node scripts/deconstruct-layout-replay.mjs <original.png> <texts.json> <plate.png> <newDir>
import path from "node:path";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { atomicWriteJson, renameWithRetry } from "@oia/tasks";
import { deconstructTextSchema } from "@oia/schema";
import { prepareDeconstructRegions, readDeconstructPng } from "../../../packages/tasks/dist/deconstruct-plate.js";

const [, , originalArg, textsArg, plateArg, outputArg] = process.argv;
if (!originalArg || !textsArg || !plateArg || !outputArg) {
  throw new Error("usage: deconstruct-layout-replay.mjs <original.png> <texts.json> <plate.png> <newDir>");
}
const original = path.resolve(originalArg), output = path.resolve(outputArg);
const [image, seeds, plate] = await Promise.all([readFile(original), readFile(textsArg), readFile(plateArg)]);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const texts = JSON.parse(seeds.toString("utf8")).map(t => deconstructTextSchema.parse(t));
if (!texts.length || texts.some(t => !t.inkBox)) {
  throw new Error("Recorded detector inkBox is required on every line; do not silently rematch old OCR outputs.");
}
const src = readDeconstructPng(image), background = readDeconstructPng(plate);
if (src.width !== background.width || src.height !== background.height) throw new Error("Plate dimensions differ from original.");
const prepared = prepareDeconstructRegions(src, texts);
// An existing output directory is evidence, including an interrupted run.
await mkdir(output);
await atomicWriteJson(path.join(output, "provenance.json"), {
  scope: "Offline production layout refinement and renderer; recorded paid plate unchanged, not a fresh detector/provider or Editor run.",
  inputSha256: sha(image), seedSha256: sha(seeds), plateSha256: sha(plate),
  seedSource: path.resolve(textsArg), plateSource: path.resolve(plateArg),
  additionalPaidCalls: 0, artifactStatus: "Not quality accepted",
});
await atomicWriteJson(path.join(output, "texts-final.json"), prepared.texts);
await atomicWriteJson(path.join(output, "erase-regions.json"), prepared.eraseRegions);
const staged = path.join(output, ".plate.tmp.png");
await writeFile(staged, plate, { flag: "wx" });
await renameWithRetry(staged, path.join(output, "deconstruct-0.png"));
const result = spawnSync(process.execPath, [path.join(import.meta.dirname, "deconstruct-render-real.mjs"), output, original, "--diagnostic"], { stdio: "inherit", timeout: 240000, windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Layout replay exited ${result.status}`);
