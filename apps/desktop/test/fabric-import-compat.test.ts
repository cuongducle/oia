import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * F4-fix enforcement — the fabric 7 center-origin default broke every scene render
 * until fabricV6OriginDefaults() restored v6 semantics. That fix lives in
 * @oia/canvas and runs at module scope — which means every file that imports
 * fabric directly is safe ONLY IF it also pulls in @oia/canvas (or calls the
 * helper). That invariant held "by accident of the import graph" (self-review);
 * this gate makes it structural: a new direct fabric consumer that forgets the
 * compat fails here, not in a shipped render.
 */

const FABRIC_IMPORT = /(?:from\s+|"fabric"\s*import|import\(\s*)"fabric"|import\(\s*"fabric"\s*\)/;

function listSource(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) listSource(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(f.name) && !f.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

describe("every direct fabric consumer goes through the v6 origin compat", () => {
  it("no file imports fabric without also importing @oia/canvas (or the helper)", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const dirs = [
      path.join(repoRoot, "apps/desktop/src"),
      path.join(repoRoot, "packages/agent/src"),
      path.join(repoRoot, "packages/tasks/src"),
    ];
    const files = dirs.flatMap((d) => listSource(d));
    expect(files.length).toBeGreaterThan(10); // the scan must actually scan

    const offenders: string[] = [];
    let fabricConsumers = 0;
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!/["']fabric["']/.test(src)) continue; // not a fabric consumer
      if (/from\s+["']fabric["']/.test(src) === false && /import\(\s*["']fabric["']\s*\)/.test(src) === false && !src.includes('import * as fabric from "fabric"')) continue;
      if (!FABRIC_IMPORT.test(src)) continue;
      fabricConsumers++;
      const exempt = file.includes(path.join("packages/canvas/src")) && path.basename(file) !== "index.ts"; // the fix's own home
      const safe = src.includes("@oia/canvas") || src.includes("fabricV6OriginDefaults");
      if (!exempt && !safe) offenders.push(path.relative(repoRoot, file));
    }

    expect(fabricConsumers).toBeGreaterThanOrEqual(3); // scanner sanity: the known consumers exist
    expect(offenders).toEqual([]);
  });
});
