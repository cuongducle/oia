#!/usr/bin/env node
/**
 * F4 — the dependency audit gate for what we SHIP.
 *
 * Plain `pnpm audit` fails on the frozen reference apps (apps/web pulls next's
 * postcss + fabric-6/tar chains; packages/db pulls drizzle) which are deleted
 * in reorg step 6 — a gate that is always red on them is a gate nobody reads.
 * This gate fails when a HIGH/CRITICAL advisory touches anything we actually
 * ship (every workspace project except the frozen set).
 *
 * Acknowledged advisories need a reason and a removal path, or they are just
 * an ignore list that rots.
 */
import { spawnSync } from "node:child_process";

/** Deleted in reorg step 6 — their transitive vulns die with them. */
const FROZEN = new Set(["apps__web", "packages__db"]);

/** advisory → why it is currently accepted, and what removes it. */
const ACKNOWLEDGED = {
  "GHSA-mrhx-c7xc-m3w5":
    "zod 3 memory-exhaust on oversized constrained collections — patch exists only in zod 4 (no 3.x fix). " +
    "Exposure here: authenticated loopback bodies (50MB cap) and our own renderer IPC (25MB cap); failure is a " +
    "recoverable process crash. Removed by the zod-4 migration task in docs/designs/desktop-only-reorg.md.",
};

// audit exits non-zero whenever ANY vuln exists (incl. frozen-only) — the stdout
// JSON is what we judge, not the exit code.
const proc = spawnSync("pnpm", ["audit", "--prod", "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const advisories = JSON.parse(proc.stdout || "{}").advisories ?? {};

const failures = [];
for (const a of Object.values(advisories)) {
  const adv = a;
  if (adv.severity !== "high" && adv.severity !== "critical") continue;
  const projects = new Set();
  for (const finding of adv.findings ?? []) {
    for (const p of finding.paths ?? []) projects.add(p.split(">")[0]);
  }
  const shipped = [...projects].filter((p) => !FROZEN.has(p));
  if (shipped.length === 0) continue; // frozen-only: dies with step 6
  if (ACKNOWLEDGED[adv.github_advisory_id]) {
    console.log(`acknowledged ${adv.github_advisory_id} (${adv.module_name}) — ${ACKNOWLEDGED[adv.github_advisory_id]}`);
    continue;
  }
  failures.push(`${adv.severity.toUpperCase()} ${adv.module_name} ${adv.github_advisory_id} in ${shipped.join(", ")}`);
}

if (failures.length > 0) {
  console.error("SHIPPED-TREE AUDIT FAILED:");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("shipped-tree audit OK (frozen reference projects excluded; acknowledged advisories listed above)");
