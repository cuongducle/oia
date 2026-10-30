#!/usr/bin/env node
/**
 * D12 — fetch the PINNED codex release into apps/desktop/resources/codex so it
 * ships INSIDE the app (electron-builder extraResources, wired in reorg step 7).
 *
 * Same machinery as the in-app guided install (checksummed download + extract +
 * atomic swap into current/), just pinned to the tag in resources/codex-pin.json
 * instead of rolling latest. The downloaded tree is a build artifact — gitignored.
 *
 * Usage: pnpm --filter @oia/desktop fetch-codex [-- --platform <platform> --arch <arch>]
 * (defaults to the build host's platform/arch; cross-package builds pass both.)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeProvisioner } from "@oia/providers";

const here = path.dirname(fileURLToPath(import.meta.url));
const resourcesDir = path.resolve(here, "../resources");

const pin = JSON.parse(await readFile(path.join(resourcesDir, "codex-pin.json"), "utf8"));
if (!pin.tag || typeof pin.tag !== "string") {
  console.error("codex-pin.json is missing a tag — refusing to fetch an unpinned release");
  process.exit(1);
}

const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const provisioner = new RuntimeProvisioner({
  managedDir: path.join(resourcesDir, "codex"),
  bundledDir: path.join(resourcesDir, "codex"), // self-check must report the JUST-FETCHED pair, not a PATH hit
  platform: flag("platform"),
  arch: flag("arch"),
});

const t0 = Date.now();
const { status, manifest } = await provisioner.install(
  (p) => {
    if (p.phase === "download" && p.pct !== undefined) process.stdout.write(`\r  download ${p.pct}%`);
    else process.stdout.write(`\n  ${p.phase}`);
  },
  { tag: pin.tag },
);
process.stdout.write("\n");
console.log(
  `codex ${manifest.version} (${manifest.target}) → ${path.join(resourcesDir, "codex")} ` +
    `sha256=${manifest.sha256.slice(0, 16)}… in ${Math.round((Date.now() - t0) / 1000)}s`,
);
console.log(`detect: source=${status.source} state=${status.state} version=${status.version ?? "?"}`);
