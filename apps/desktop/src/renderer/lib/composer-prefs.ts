import { AUTO_REFINE_DEFAULT, STYLE_PRESETS, type StylePresetId } from "@oia/schema";

/**
 * DA, composer switch preferences (designer-agent-loop.md DA-4/DA-5).
 * UI preferences, NOT records: localStorage, one versioned key each, corrupt
 * values fall back to the decided default (readOutlineGatePref pattern, a
 * broken key must never silently flip an owner decision).
 *
 * Auto refine defaults ON (owner Q1, 2026-11-06): switching OFF persists, and a
 * missing/corrupt key restores ON, the cost label (DA-5) rides with it.
 * Research defaults ON (owner, 2026-11-06 · after REAL_SMOKE: +7s/job, notes
 * with sources; S1.5's provisional OFF is overridden). Same persistence rule.
 */

export const AUTO_REFINE_STORAGE_KEY = "oia.autoRefine";
export const RESEARCH_STORAGE_KEY = "oia.research";
export const RESEARCH_DEFAULT = true;

export function readAutoRefinePref(storage: Pick<Storage, "getItem"> = globalThis.localStorage): boolean {
  const raw = storage.getItem(AUTO_REFINE_STORAGE_KEY);
  if (raw === "on") return true;
  if (raw === "off") return false;
  return AUTO_REFINE_DEFAULT;
}

export function writeAutoRefinePref(on: boolean, storage: Pick<Storage, "setItem"> = globalThis.localStorage): void {
  try {
    storage.setItem(AUTO_REFINE_STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* private mode / disabled storage: the toggle works for this session, just not remembered */
  }
}

export function readResearchPref(storage: Pick<Storage, "getItem"> = globalThis.localStorage): boolean {
  const raw = storage.getItem(RESEARCH_STORAGE_KEY);
  if (raw === "on") return true;
  if (raw === "off") return false;
  return RESEARCH_DEFAULT;
}

export function writeResearchPref(on: boolean, storage: Pick<Storage, "setItem"> = globalThis.localStorage): void {
  try {
    storage.setItem(RESEARCH_STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* private mode / disabled storage: the toggle works for this session, just not remembered */
  }
}

export const STYLE_STORAGE_KEY = "oia.style";

/** Style preset choice ("" = Auto). Corrupt/unknown values fall back to Auto,
 *  a stale id from a removed preset must never 400 the chat request. */
export function readStylePref(storage: Pick<Storage, "getItem"> = globalThis.localStorage): StylePresetId | "" {
  const raw = storage.getItem(STYLE_STORAGE_KEY) ?? "";
  const hit = STYLE_PRESETS.find((p) => p.id === raw);
  return hit ? hit.id : "";
}

export function writeStylePref(id: string, storage: Pick<Storage, "setItem" | "removeItem"> = globalThis.localStorage): void {
  try {
    if (id) storage.setItem(STYLE_STORAGE_KEY, id);
    else storage.removeItem(STYLE_STORAGE_KEY);
  } catch {
    /* private mode / disabled storage: works for this session, not remembered */
  }
}
