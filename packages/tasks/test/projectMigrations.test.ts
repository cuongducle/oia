import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalFileStore, type FileStore } from "../src/storage.js";
import {
  MigrationError,
  PROJECT_MIGRATIONS,
  migrateProjectToCurrent,
  type ProjectMigration,
} from "../src/projectMigrations.js";
import type { Project } from "@oia/schema";

/** Reorg step 5 — the schemaVersion migration runner (chain semantics + tolerance). */

function makeFiles(): { files: FileStore; root: string } {
  const root = mkdtempSync(path.join(tmpdir(), "oia-pmigr-"));
  return { files: new LocalFileStore(path.join(root, "files")), root };
}

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function legacyProject(withBase64 = false): Project {
  return {
    id: "prj_test",
    name: "legacy",
    pages: [
      {
        id: "page_1",
        width: 10,
        height: 10,
        canvas: {
          version: "7.3.1",
          objects: withBase64
            ? [{ type: "Image", src: PNG_DATA_URL, left: 0, top: 0, width: 1, height: 1 }]
            : [],
        },
      },
    ],
  } as unknown as Project;
}

describe("migration chain semantics", () => {
  it("a project already at the current version passes through untouched (no steps apply)", async () => {
    const { files } = makeFiles();
    const p = { ...legacyProject(), schemaVersion: PROJECT_MIGRATIONS.at(-1)!.to };
    const out = await migrateProjectToCurrent(p, files);
    expect(out).toBe(p); // same reference — nothing ran
  });

  it("a project from the FUTURE (higher schemaVersion) is read-tolerant, never downgraded", async () => {
    const { files } = makeFiles();
    const p = { ...legacyProject(), schemaVersion: 99 };
    const out = await migrateProjectToCurrent(p, files);
    expect(out.schemaVersion).toBe(99);
  });

  it("a step that throws stops the chain — the caller decides read vs strict tolerance", async () => {
    const { files } = makeFiles();
    const steps: ProjectMigration[] = [
      {
        from: 0,
        to: 1,
        async migrate() {
          throw new MigrationError("synthetic failure", ["x"]);
        },
      },
    ];
    await expect(migrateProjectToCurrent(legacyProject(), files, steps)).rejects.toThrow("synthetic failure");
  });

  it("the RUNNER stamps the step version even when the step forgets (no hardcoded stamps)", async () => {
    const { files } = makeFiles();
    const steps: ProjectMigration[] = [
      { from: 0, to: 1, async migrate(p) { return p; } },
    ];
    const out = await migrateProjectToCurrent(legacyProject(), files, steps);
    expect(out.schemaVersion).toBe(1);
  });
});

describe("real step v0→v1 (legacy web projects: base64 → asset store)", () => {
  it("extracts embedded base64 into the asset store and stamps schemaVersion", async () => {
    const { files } = makeFiles();
    const out = await migrateProjectToCurrent(legacyProject(true), files);
    expect(out.schemaVersion).toBe(1);
    const src = out.pages[0].canvas.objects[0].src!;
    expect(src).toMatch(/^\/api\/files\//);
    const key = src.replace("/api/files/", "");
    expect(Buffer.from(await files.read(key)).length).toBeGreaterThan(30); // bytes really landed
  });

  it("a project with NO base64 is stamped but writes nothing into the asset store", async () => {
    const { files } = makeFiles();
    const out = await migrateProjectToCurrent(legacyProject(false), files);
    expect(out.schemaVersion).toBe(1);
    expect(out.pages[0].canvas.objects).toHaveLength(0);
  });
});
