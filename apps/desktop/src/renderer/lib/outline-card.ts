import type { PlanPage } from "@oia/schema";

/**
 * C1 outline gate — the card's edit model, pure part
 * (docs/designs/outline-gate.md). DOM-free so the row ops and the preference
 * read/write are unit-testable; Home renders what these build.
 *
 * `OutlineRow` mirrors `PlanPage` — the card edits the SAME shape the planner
 * returns and phase 2 sends back. No second type drifting beside the contract.
 */

/** OC-6: the default is a DECISION (spec Q2) — a named constant, greppable. */
export const OUTLINE_GATE_DEFAULT = true;
/** UI preference (not a record) — localStorage, one versioned key, no store sprawl. */
export const OUTLINE_STORAGE_KEY = "oia.outlineGate";

export type OutlineRow = PlanPage;

export const OUTLINE_MIN_PAGES = 1;
export const OUTLINE_MAX_PAGES = 9; // the composer's page cap

export function editPage(rows: OutlineRow[], index: number, patch: Partial<OutlineRow>): OutlineRow[] {
  if (index < 0 || index >= rows.length) return rows;
  return rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
}

export function removePage(rows: OutlineRow[], index: number): OutlineRow[] {
  if (rows.length <= OUTLINE_MIN_PAGES || index < 0 || index >= rows.length) return rows; // never zero pages
  return rows.filter((_, i) => i !== index);
}

export function addPage(rows: OutlineRow[]): OutlineRow[] {
  if (rows.length >= OUTLINE_MAX_PAGES) return rows; // the composer's cap holds
  return [...rows, { title: "New page", summary: "What this page shows" }];
}

export function movePage(rows: OutlineRow[], index: number, dir: -1 | 1): OutlineRow[] {
  const to = index + dir;
  if (index < 0 || index >= rows.length || to < 0 || to >= rows.length) return rows;
  const next = rows.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Every row must carry a real title + summary — planPageSchema would reject a
 * blank row at phase 2, so the button refuses BEFORE the planner turn. */
export function outlineRowsValid(rows: OutlineRow[]): boolean {
  return rows.every((r) => r.title.trim().length > 0 && r.summary.trim().length > 0);
}

/** OC-9: the cost label is one string from one source — "N pages ≈ N images". */
export function outlineCostLabel(n: number): string {
  return `${n} page${n === 1 ? "" : "s"} ≈ ${n} image${n === 1 ? "" : "s"}`;
}

/** Corrupt/absent stored value falls back to the default — a broken key never
 * silently disables the owner-decided gate. */
export function readOutlineGatePref(storage: Pick<Storage, "getItem"> = globalThis.localStorage): boolean {
  const raw = storage.getItem(OUTLINE_STORAGE_KEY);
  if (raw === "on") return true;
  if (raw === "off") return false;
  return OUTLINE_GATE_DEFAULT;
}

export function writeOutlineGatePref(on: boolean, storage: Pick<Storage, "setItem"> = globalThis.localStorage): void {
  try {
    storage.setItem(OUTLINE_STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* private mode / disabled storage: the toggle works for this session, just not remembered */
  }
}

/** The chatRun reply (invoke) and the outline event (webContents.send) cross
 *  IPC channels that Electron does not order between, so the renderer can hold
 *  the "outline" outcome before the event lands. Grace-poll the ref; null after
 *  the window is a REAL miss and the caller must surface the error. */
export async function waitForOutline(
  get: () => PlanPage[] | null | undefined,
  ms = 2000,
  pollMs = 50,
): Promise<PlanPage[] | null> {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise((r) => setTimeout(r, pollMs))) {
    const hit = get();
    if (hit?.length) return hit;
  }
  const last = get();
  return last?.length ? last : null;
}
