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
 *
 * DA-5: the Auto refine label is a display LAW — it shows whenever the loop is
 * ON (Trial included: it previews the real bill). K = pages × (rounds + 1):
 * worst case images AND critic reads, computed per page like C1 did.
 */
export function costHintText(opts: {
  images: number;
  pages?: number | null;
  reads?: number;
  isMock: boolean;
  autoRefineRounds?: number;
}): string | null {
  const pages = opts.pages ?? null;
  let base: string | null = null;
  if (pages && pages >= 2) base = outlineCostLabel(pages);
  else if (!opts.isMock) {
    const img = `≈ ${opts.images} image${opts.images === 1 ? "" : "s"}`;
    base = opts.reads ? `${img} + ${opts.reads} read${opts.reads === 1 ? "" : "s"}` : img;
  }
  const rounds = opts.autoRefineRounds ?? 0;
  if (rounds > 0) {
    const k = Math.max(1, pages ?? 1) * (rounds + 1);
    const refine = `Auto refine on · up to ${k} image${k === 1 ? "" : "s"} + ${k} read${k === 1 ? "" : "s"}`;
    return base ? `${base} · ${refine}` : refine;
  }
  return base;
}
