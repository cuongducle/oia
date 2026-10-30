import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { brandKitSchema, projectSchema, templateSchema, type BrandKit, type Project, type Template } from "@oia/schema";
import type { LocalFileStore } from "./storage.js";
import type { BrandKitStore } from "./brandkits.js";
import type { ChatSessionStore, ProjectStore, StoredMessage } from "./projects.js";
import type { TemplateStore } from "./templates.js";

/**
 * Reorg step 5 — import a self-hosted WEB app's `.data` directory into the desktop
 * store. The owner has real data there; this is the one-way bridge before the web
 * app is deleted (step 6).
 *
 * Rules:
 * - The SOURCE is read-only (it is the owner's only copy — nothing in it moves).
 * - Two-phase: validate every source file BEFORE mutating the desktop store, so a
 *   broken source aborts with nothing half-imported.
 * - Desktop wins on id collisions; a re-run imports nothing new (idempotent).
 * - Assets are copied under their ORIGINAL keys: legacy md5-named files stay
 *   byte-identical, and every `/api/files/<key>` reference already stored in the
 *   source JSON keeps resolving. hydrate() re-indexes them through the legacy lanes.
 * - api-keys.json is deliberately NOT imported (machine-local agent credentials).
 */

export interface WebImportCounts {
  assets: number;
  assetsSkipped: number;
  projects: number;
  projectsSkipped: number;
  projectsInvalid: number;
  sessions: number;
  brandKits: number;
  brandKitsInvalid: number;
  templates: number;
  templatesInvalid: number;
}

export class DataImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataImportError";
  }
}

export interface WebImportTarget {
  files: LocalFileStore;
  projects: ProjectStore;
  chatSessions: ChatSessionStore;
  brandKits: BrandKitStore;
  templates: TemplateStore;
}

type SessionEntry = [number, { id: number; name: string; messages: StoredMessage[]; createdAt: number; updatedAt: number }];

function pickSchemaKeys(raw: Record<string, unknown>, shape: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) if (key in raw) out[key] = raw[key];
  return out;
}

/** Never mutate the source to quarantine a corrupt file — abort loudly instead. */
async function readSourceArray<T>(file: string, what: string): Promise<T[] | null> {
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new DataImportError(`the source ${what} (${path.basename(file)}) is corrupt (unparseable JSON) — nothing was imported. Fix or remove the file and try again.`);
  }
  if (!Array.isArray(parsed)) {
    throw new DataImportError(`the source ${what} (${path.basename(file)}) is corrupt (not a JSON array) — nothing was imported.`);
  }
  return parsed as T[];
}

/** Accept the `.data` folder itself or its parent (the folder the user naturally picks). */
export function resolveWebDataDir(sourceDir: string): string {
  const markers = (d: string) =>
    existsSync(path.join(d, "projects.json")) || existsSync(path.join(d, "chat-sessions.json")) || existsSync(path.join(d, "files", "uploads"));
  if (markers(sourceDir)) return sourceDir;
  const child = path.join(sourceDir, ".data");
  if (markers(child)) return child;
  throw new DataImportError(`"${sourceDir}" does not look like a web app data folder — expected projects.json, chat-sessions.json, or files/uploads inside it.`);
}

async function* walkFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (entry.isFile()) yield full;
  }
}

export async function importWebData(opts: { sourceDir: string; target: WebImportTarget }): Promise<WebImportCounts> {
  const source = resolveWebDataDir(opts.sourceDir);
  const t = opts.target;

  // ── phase 1: read + validate everything, mutate nothing ──────────────────────
  const rawProjects = await readSourceArray<Project>(path.join(source, "projects.json"), "projects.json");
  const projects: Project[] = [];
  let projectsInvalid = 0;
  for (const raw of rawProjects ?? []) {
    const parsed = projectSchema.safeParse(raw);
    if (parsed.success) projects.push(parsed.data);
    else {
      projectsInvalid++;
      console.error(`[import] source project entry failed schema validation (${parsed.error.issues[0]?.path.join(".")}) — skipped`);
    }
  }

  const rawSessions = await readSourceArray<SessionEntry>(path.join(source, "chat-sessions.json"), "chat-sessions.json");
  const sessions: SessionEntry[] = [];
  for (const raw of rawSessions ?? []) {
    if (Array.isArray(raw) && typeof raw[0] === "number" && raw[1] && typeof raw[1] === "object" && Array.isArray(raw[1].messages)) {
      sessions.push([raw[0], raw[1]]);
    } else {
      console.error("[import] source chat-session entry has an unexpected shape — skipped");
    }
  }

  const rawKits = await readSourceArray<BrandKit>(path.join(source, "brandkits.json"), "brandkits.json");
  const kits: BrandKit[] = [];
  let brandKitsInvalid = 0;
  for (const raw of rawKits ?? []) {
    // brandKitSchema is .strict() but web-era files carry extra metadata keys (updatedAt)
    // — pick only the schema's own fields rather than rejecting real data.
    const candidate = pickSchemaKeys(raw as Record<string, unknown>, brandKitSchema.shape);
    const parsed = brandKitSchema.safeParse(candidate);
    if (parsed.success) kits.push(parsed.data);
    else {
      brandKitsInvalid++;
      console.error(`[import] source brand kit failed schema validation (${parsed.error.issues[0]?.path.join(".")}) — skipped`);
    }
  }

  const rawTemplates = await readSourceArray<Template>(path.join(source, "templates.json"), "templates.json");
  const templates: Template[] = [];
  let templatesInvalid = 0;
  for (const raw of rawTemplates ?? []) {
    const parsed = templateSchema.safeParse(raw);
    if (parsed.success) templates.push(parsed.data);
    else {
      templatesInvalid++;
      console.error(`[import] source template failed schema validation (${parsed.error.issues[0]?.path.join(".")}) — skipped`);
    }
  }

  if (!rawProjects && !rawSessions && !rawKits && !rawTemplates && !existsSync(path.join(source, "files", "uploads"))) {
    throw new DataImportError(`"${source}" contains nothing importable — no projects, sessions, brand kits, templates, or assets found.`);
  }

  // ── phase 2: apply — copy assets under their original keys, then merge stores ─
  const counts: WebImportCounts = {
    assets: 0, assetsSkipped: 0,
    projects: 0, projectsSkipped: 0, projectsInvalid,
    sessions: 0,
    brandKits: 0, brandKitsInvalid,
    templates: 0, templatesInvalid,
  };

  const srcUploads = path.join(source, "files");
  if (existsSync(srcUploads)) {
    for await (const file of walkFiles(srcUploads)) {
      const rel = path.relative(srcUploads, file);
      const dest = path.join(t.files.root, rel);
      if (existsSync(dest)) {
        counts.assetsSkipped++; // same content-addressed name → assume same content
        continue;
      }
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, await readFile(file));
      counts.assets++;
    }
    await t.files.hydrate(); // re-index: legacy md5 lanes resolve imported keys
  }

  for (const p of projects) counts.projects += (await t.projects.addImported(p)) ? 1 : 0;
  counts.projectsSkipped = projects.length - counts.projects;
  counts.sessions = await t.chatSessions.importSessions(sessions);
  for (const k of kits) counts.brandKits += (await t.brandKits.addImported(k)) ? 1 : 0;
  for (const tpl of templates) counts.templates += (await t.templates.addImported(tpl)) ? 1 : 0;

  return counts;
}
