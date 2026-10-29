import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
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
