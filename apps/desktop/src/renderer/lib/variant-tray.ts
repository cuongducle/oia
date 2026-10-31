import type { SceneCanvas } from "@oia/schema";

/**
 * A1 preview-apply — the editor dock's variant tray, pure part
 * (docs/designs/variant-preview-apply.md). Kept DOM-free so the dedupe/resume
 * rules are unit-testable; the dock component only renders what these build.
 *
 * A VariantCard is PRESENTATION state: the durable record of every generated
 * canvas is the chat session (assetized, G5) — this never becomes a second
 * copy of the truth.
 */
export interface VariantCard {
  id: string;
  /** `${jobId}:${msgMeta.id}` — the agent stream re-emits one canvas several
   * times per job; one canvas, one card. */
  key: string;
  jobId: string;
  prompt: string;
  /** Canonical asset URL ("" → the card renders ScenePreview from the canvas). */
  thumbnail: string;
  /** Canonical /api/files form. */
  canvas: SceneCanvas;
}

export function variantKey(jobId: string | undefined, metaId: string): string {
  return `${jobId ?? ""}:${metaId}`;
}

/** Dedupe append — same array reference when the key exists, so a re-emitted
 * canvas never re-renders the tray nor shows a phantom duplicate card. */
export function appendVariant(cards: VariantCard[], card: VariantCard): VariantCard[] {
  return cards.some((c) => c.key === card.key) ? cards : [...cards, card];
}

/**
 * Per-job prompt binding (B7): the FIRST event of a job captures the prompt
 * submitted for it. Events outlive the submit closure — reading "the last
 * submitted prompt" would label an older job's card with a newer prompt.
 * Returns the bound prompt for that job.
 */
export function bindPromptForJob(map: Map<string, string>, jobId: string, submittedPrompt: string): string {
  const known = map.get(jobId);
  if (known !== undefined) return known;
  map.set(jobId, submittedPrompt);
  return submittedPrompt;
}

/** One stored conversation message — the shape ChatSessionStore persists. */
export interface StoredMessageLike {
  role: string;
  content?: string;
  canvas?: unknown;
  renderData?: unknown;
}

/**
 * Resume: rebuild the tray from a stored conversation. Each assistant message
 * carrying a canvas is one variant; its prompt is the user message right
 * before it. Keys are namespaced `resume:<session>:<n>` so they can never
 * collide with live `jobId:metaId` keys when a resumed conversation keeps
 * generating.
 */
export function variantsFromSession(sessionId: number, messages: StoredMessageLike[]): VariantCard[] {
  const out: VariantCard[] = [];
  let lastUser = "";
  for (const m of messages) {
    if (m.role === "user") {
      lastUser = m.content ?? "";
      continue;
    }
    if (m.role !== "assistant" || !m.canvas) continue;
    out.push({
      id: crypto.randomUUID(),
      key: `resume:${sessionId}:${out.length}`,
      jobId: "",
      prompt: lastUser,
      thumbnail: thumbnailOf(m.renderData),
      canvas: m.canvas as SceneCanvas,
    });
  }
  return out;
}

function thumbnailOf(renderData: unknown): string {
  const metas = (renderData as { msgMeta?: { type?: string; thumbnail?: unknown }[] } | undefined)?.msgMeta ?? [];
  for (const m of metas) {
    if (m.type === "canvas" && typeof m.thumbnail === "string" && m.thumbnail) return m.thumbnail;
  }
  return "";
}
