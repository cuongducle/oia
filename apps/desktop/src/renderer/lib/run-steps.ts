import { outlineCostLabel } from "./outline-card.js";

/**
 * UI v1.1 R3 — one progress vocabulary for every metered flow. The agent streams
 * its internal role names (taskMeta.content); sellers see what is happening
 * instead. Unknown names pass through rather than vanish.
 */
export type StepState = "done" | "running" | "pending";
export interface RunStep { label: string; state: StepState }

const LABELS: Record<string, string> = {
  "Designer Agent": "Planning",
  "Image Generator": "Painting",
  "Manager Agent": "Composing",
};

export function stepLabel(agentName: string): string {
  return LABELS[agentName] ?? agentName;
}

/** taskMeta frames → steps. The first unfinished step runs; later ones wait. */
export function stepsFromTimeline(timeline: { content: string; done: boolean }[]): RunStep[] {
  let runningSeen = false;
  return timeline.map((t) => {
    if (t.done) return { label: stepLabel(t.content), state: "done" as const };
    const state: StepState = runningSeen ? "pending" : "running";
    runningSeen = true;
    return { label: stepLabel(t.content), state };
  });
}

/**
 * The cost line next to a paid action. Multi-page keeps C1's contract label
 * ("N pages ≈ N images", shown even in Trial — the gate pins it); a single image
 * is hidden in Trial, where nothing is billed.
 */
export function costHintText(opts: { images: number; pages?: number | null; reads?: number; isMock: boolean }): string | null {
  if (opts.pages && opts.pages >= 2) return outlineCostLabel(opts.pages);
  if (opts.isMock) return null;
  const img = `≈ ${opts.images} image${opts.images === 1 ? "" : "s"}`;
  return opts.reads ? `${img} + ${opts.reads} read${opts.reads === 1 ? "" : "s"}` : img;
}
