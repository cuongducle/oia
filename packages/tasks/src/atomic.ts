import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * TP.7 (Slice 3) — atomic JSON persistence for the file-backed stores.
 *
 * A crash mid-`writeFile` on `projects.json` used to corrupt EVERY project in one
 * shot (whole-file rewrite). Now: temp file + rename, with retry/backoff on
 * `EPERM`/`EBUSY` (Windows antivirus and indexers can hold the target mid-rename),
 * and a single-writer promise chain per file so concurrent save() calls serialize
 * instead of interleaving writes.
 */

export type RenameFn = (from: string, to: string) => Promise<void>;

/** Retryable rename errors: transient locks, not real failures. */
const RETRYABLE_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

export async function renameWithRetry(
  from: string,
  to: string,
  opts: { attempts?: number; impl?: RenameFn } = {},
): Promise<void> {
  const attempts = opts.attempts ?? 5;
  const impl = opts.impl ?? rename;
  for (let i = 0; i < attempts; i++) {
    try {
      await impl(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (!RETRYABLE_CODES.has(code) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 20 * 2 ** i)); // 20/40/80/160ms backoff
    }
  }
}

/** Per-file single-writer chains — concurrent writers serialize, never interleave. */
const chains = new Map<string, Promise<unknown>>();

/** Remove orphaned temp siblings (`.name.tmp-*`) left by a crash between write and rename. */
export async function sweepTempFiles(file: string): Promise<void> {
  try {
    const dir = path.dirname(file);
    const base = `.${path.basename(file)}.tmp-`;
    for (const f of await readdir(dir)) {
      if (f.startsWith(base)) await rm(path.join(dir, f), { force: true }).catch(() => {});
    }
  } catch {
    /* directory may not exist yet */
  }
}

export async function atomicWriteJson(file: string, data: unknown): Promise<void> {
  const prev = chains.get(file) ?? Promise.resolve();
  const job = prev.catch(() => {}).then(async () => {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp-${randomUUID()}`);
    await writeFile(tmp, JSON.stringify(data, null, 2));
    try {
      await renameWithRetry(tmp, file);
    } catch (err) {
      await rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  });
  chains.set(file, job);
  try {
    await job;
  } finally {
    if (chains.get(file) === job) chains.delete(file);
  }
}

/**
 * TP.7 read side — durable load for the array-backed JSON stores.
 *
 * The old pattern was `try { parse } catch { items = [] }`: one unparseable byte
 * (disk hiccup, partial write from an older non-atomic code path, manual edit)
 * blanked the store in memory, and the NEXT autosave wrote `[]` over the real
 * file — silent total data loss. Atomic writes only prevent torn files; they do
 * not protect an already-corrupt one from being overwritten.
 *
 * Now: missing file → null (a fresh start is legitimate); unreadable → throw
 * (never guess over EACCES/EISDIR); corrupt (unparseable or not an array) → the
 * file is RENAMED to `<name>.corrupt-<ts>` so every byte survives for manual
 * recovery, a loud error names both files, and the store starts empty ONLY
 * after the corrupt bytes are safe on disk. If even the quarantine rename
 * fails we throw rather than risk saving `[]` over the data.
 */
export async function loadJsonArrayDurable<T>(file: string): Promise<T[] | null> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined; // fall through to quarantine
  }
  if (Array.isArray(parsed)) return parsed as T[];

  const quarantine = `${file}.corrupt-${Date.now()}`;
  await renameWithRetry(file, quarantine);
  console.error(
    `[store] ${path.basename(file)} was corrupt (unparseable or not a JSON array) — ` +
      `moved to ${path.basename(quarantine)}; starting empty rather than overwriting your data. ` +
      `Recover what you need from the quarantined file.`,
  );
  return null;
}
