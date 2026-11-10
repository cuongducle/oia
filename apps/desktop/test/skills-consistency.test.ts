import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Skill scripts have NO runtime test harness, and the 2026-11-13 bulk
 * "sync-mode output" patch broke two of them for exactly that reason: the
 * inserted refetch used /api/tasks/ inside files whose own poll loop uses
 * /tasks/ (404 → r.data null → TypeError AFTER the paid work finished, the
 * agent sees a crash and may retry = quota). This test pins the invariants a
 * skill file must hold so the next bulk edit cannot ship the same way:
 *  1. the file parses (node --check),
 *  2. every tasks-URL template in ONE file uses the SAME base-path convention,
 *  3. every file that polls a task also has the final-record refetch.
 */

const skillsRoot = path.resolve(import.meta.dirname, "../../../packages/skills/skills");
const scriptFiles: string[] = [];
for (const dir of readdirSync(skillsRoot)) {
  const scripts = path.join(skillsRoot, dir, "scripts");
  if (!statSync(scripts, { throwIfNo: false })?.isDirectory()) continue;
  for (const f of readdirSync(scripts)) {
    if (f.endsWith(".mjs") && f !== "env.mjs" && f !== "check_env.mjs") scriptFiles.push(path.join(scripts, f));
  }
}

describe("skill scripts consistency (bulk-patch regression, 2026-11-13)", () => {
  it("found the skill scripts (guard: the glob is not silently empty)", () => {
    expect(scriptFiles.length).toBeGreaterThanOrEqual(13);
  });

  for (const file of scriptFiles) {
    const rel = path.relative(skillsRoot, file);
    it(`${rel}: parses, one URL convention, refetch after sync-mode submit`, () => {
      const src = readFileSync(file, "utf8");
      // 1. syntax (catches TS-in-.mjs and surgery accidents)
      expect(() => execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }), `${rel} must parse`).not.toThrow();
      // 2. ONE tasks-URL convention per file (`/tasks/` and `/api/tasks/` are
      // both valid across the fleet, but mixing them inside one file 404s)
      const conventions = [...new Set([...src.matchAll(/cfg\.baseUrl\}(\/api)?\/tasks/g)].map((m) => m[0]))];
      expect(conventions.length, `${rel} mixes task URL conventions: ${conventions.join(" vs ")}`).toBeLessThanOrEqual(1);
      // 3. polling without the refetch loses taskResult/download on sync-mode submits
      const polls = /progress === "processing"/.test(src);
      const refetches = /taskResult === undefined/.test(src);
      expect(polls ? refetches : true, `${rel} polls a task but never refetches the final record`).toBe(true);
    });
  }
});
