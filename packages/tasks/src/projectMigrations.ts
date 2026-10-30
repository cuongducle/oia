import { OIA_SCHEMA_VERSION, validateProjectForSave, type Project } from "@oia/schema";
import { migrateScene } from "./migrate.js";
import type { FileStore } from "./storage.js";

/**
 * Reorg step 5 — the project-format migration runner.
 *
 * A project file carries `schemaVersion` (absent = 0 = the legacy web format).
 * Each migration step moves the file one version forward; `load()` runs the
 * chain read-tolerantly (a step that fails keeps the project UNMIGRATED but
 * open — the strict refusal still happens at save time), and every save stamps
 * the current version, so the next boot skips the chain entirely.
 */

/** Raised when a step cannot complete — the caller decides read vs strict tolerance. */
export class MigrationError extends Error {
  readonly violations: string[];
  constructor(message: string, violations: string[]) {
    super(message);
    this.name = "MigrationError";
    this.violations = violations;
  }
}

export interface ProjectMigration {
  from: number;
  to: number;
  /** May throw — load keeps the unmigrated project (read-tolerant); save stays strict. */
  migrate(project: Project, files: FileStore): Promise<Project>;
}

/** v0 = legacy web projects (no schemaVersion): scenes may embed base64 data URLs. */
const legacyBase64ToAssets: ProjectMigration = {
  from: 0,
  to: 1,
  async migrate(project, files) {
    for (const page of project.pages) await migrateScene(page.canvas, files);
    const violations = validateProjectForSave(project);
    if (violations.length) {
      throw new MigrationError(
        `v0→v1: ${violations.length} embedded data URL(s) could not be extracted into the asset store`,
        violations,
      );
    }
    return { ...project, schemaVersion: 1 };
  },
};

export const CURRENT_PROJECT_VERSION = OIA_SCHEMA_VERSION;

export const PROJECT_MIGRATIONS: readonly ProjectMigration[] = [legacyBase64ToAssets];

/**
 * Apply consecutive steps starting at `project.schemaVersion ?? 0`. Returns the
 * migrated project with the last applied step's version stamped. A project
 * already at/above every step's `from` passes through untouched (read-tolerant
 * toward future versions). Throws MigrationError — the caller picks tolerance.
 */
export async function migrateProjectToCurrent(
  project: Project,
  files: FileStore,
  steps: readonly ProjectMigration[] = PROJECT_MIGRATIONS,
): Promise<Project> {
  let version = project.schemaVersion ?? 0;
  let current = project;
  for (const step of steps) {
    if (version !== step.from) continue;
    current = await step.migrate(current, files);
    version = step.to;
  }
  return current;
}
