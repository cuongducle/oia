import type { WebImportCounts } from "@oia/tasks";

/** The one sentence a finished web `.data` import reports (Workspace + Settings › Data). */
export function webImportSummary(counts: WebImportCounts): string {
  const n = (k: number, one: string) => (k ? `${k} ${one}${k === 1 ? "" : "s"}` : null);
  const parts = [
    n(counts.projects, "project"),
    n(counts.sessions, "conversation"),
    n(counts.assets, "image"),
    n(counts.brandKits, "brand kit"),
    n(counts.templates, "template"),
  ].filter(Boolean);
  return parts.length ? `Imported ${parts.join(", ")}.` : "Nothing new to import, everything was already here.";
}
