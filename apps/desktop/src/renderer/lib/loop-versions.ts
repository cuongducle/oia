/**
 * SIL (single-image-loop.md) version store: the loop's session history rules,
 * extracted from the view because they are the exact logic that once shipped
 * the "Edit 3 on a first generate" bug. Pure and unit-tested.
 *
 * Rules (B7: only real jobs push entries):
 * - ONE slot per job: a job may yield several canvases (auto refine rounds
 *   re-generate); later candidates REPLACE the job's slot, the last canvas is
 *   the winner the designer yields.
 * - A null jobId never replaces (events that arrived before the job id
 *   latched cannot be proven to belong to the previous slot).
 * - Labels: generates say "Generated", edits count "Edit N" by the stack size
 *   at push time (N starts at 1 when one version exists).
 */

export interface VersionSlot {
  dataUrl: string;
  width: number;
  height: number;
  label: string;
  jobId: string | null;
}

export function mergeVersion(
  versions: VersionSlot[],
  flat: { dataUrl: string; width: number; height: number },
  jobId: string | null,
  kind: "generate" | "edit",
): VersionSlot[] {
  const last = versions[versions.length - 1];
  if (last && jobId !== null && last.jobId === jobId) {
    return [...versions.slice(0, -1), { ...flat, label: last.label, jobId }];
  }
  const label = kind === "edit" ? `Edit ${versions.length}` : "Generated";
  return [...versions, { ...flat, label, jobId }];
}
