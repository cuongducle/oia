import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const yml = readFileSync(path.resolve(here, "../electron-builder.yml"), "utf8");
const pkg = JSON.parse(readFileSync(path.resolve(here, "../package.json"), "utf8")) as { scripts: Record<string, string> };

/** The value on `key:` inside a top-level `section:` block (two-space indented). */
function field(section: string, key: string): string | undefined {
  const block = yml.match(new RegExp(`^${section}:\\n((?:[ #].*\\n|\\n)*)`, "m"))?.[1] ?? "";
  return block.match(new RegExp(`^  ${key}:\\s*([^#\\n]+)`, "m"))?.[1]?.trim();
}

/** Step 7 / T8 packaging pin. A quiet edit here ships a weaker binary, so the
 *  release-relevant settings are pinned, not just reviewed. The packaged-app proof
 *  (fuse wire read back from the binary, RUN_AS_NODE ignored) is recorded in the
 *  reorg plan — this test guards the config that produces it. */
describe("electron-builder packaging pin", () => {
  it("flips the Electron fuses that turn the app into a general Node runtime", () => {
    expect(field("electronFuses", "runAsNode")).toBe("false");
    expect(field("electronFuses", "enableNodeOptionsEnvironmentVariable")).toBe("false");
    expect(field("electronFuses", "enableNodeCliInspectArguments")).toBe("false");
    expect(field("electronFuses", "enableEmbeddedAsarIntegrityValidation")).toBe("true");
    expect(field("electronFuses", "onlyLoadAppFromAsar")).toBe("true");
    expect(field("electronFuses", "resetAdHocDarwinSignature")).toBe("true"); // unsigned arm64 must still launch
  });

  it("ships the pinned codex pair on every platform (D12)", () => {
    expect(yml).toMatch(/extraResources:\n\s+- from: resources\/codex\n\s+to: codex/);
    expect(pkg.scripts["dist:mac"]).toMatch(/^node scripts\/fetch-codex\.mjs &&/);
    expect(pkg.scripts["dist:win"]).toMatch(/^node scripts\/fetch-codex\.mjs --platform win32 --arch x64 &&/);
  });

  it("Windows installer is per-user, no admin, and never deletes user data (CUJ-D1/D2)", () => {
    expect(yml).toMatch(/^win:\n(?:.*\n)*?\s+- target: nsis\n\s+arch:\n\s+- x64/m);
    expect(field("nsis", "perMachine")).toBe("false");
    expect(field("nsis", "allowElevation")).toBe("false");
    expect(field("nsis", "deleteAppDataOnUninstall")).toBe("false");
  });
});
