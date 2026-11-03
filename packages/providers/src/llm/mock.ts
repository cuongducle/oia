import type { LlmProvider, LlmMessage, LlmChatOpts, ProviderDiagnostic, ProviderCapabilities } from "../types.js";
import { PLANNER_INSTRUCTIONS, REFINE_INSTRUCTION, EVAL_READ_MARKER, DECONSTRUCT_READ_MARKER, DECONSTRUCT_JSON_SCHEMA } from "@oia/schema";

/**
 * Mock planner: costs no tokens; generates the outline demos need.
 * TP.6/TP.4: declares `isMock: true` so the UI can label "Chế độ thử nghiệm";
 * the registry refuses to boot a mock planner paired with a real image provider
 * (assertNoMixedMockConfig) — mock output must never reach a real user silently.
 *
 * Prompt-aware (C1): the designer's planner instructions are honored literally —
 * "EXACTLY N entries" yields a pageOutline of N rows, "exactly N imagePrompts"
 * yields N per-page prompts. Same philosophy as the per-prompt image mock: a mock
 * owes the gates deterministic variety, not one canned answer for every question.
 */
const MOCK_CAPABILITIES: ProviderCapabilities = {
  referenceImages: true, // B1: implements readImage — the deconstruct gates ride the mock
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock: true,
  webSearch: false, // DA-2: the mock cannot search — gates exercise the "unavailable" path
};

/** Mock promo copy — Vietnamese CONTENT by design (D8: content-level language),
 * not UI copy; it is what every smoke/shot banner sample says. */
export const MOCK_PROMO_COPY = "GIẢM GIÁ 20%";

/** Prompt-aware (C1): matchers are DERIVED from the shared PLANNER_INSTRUCTIONS
 * constants — rewording the designer's prompt automatically rewords the mock's
 * matcher. Prose-coupled regexes broke silently before (teardown 2026-10-31). */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function instructedCount(system: string, template: (n: number) => string): number | null {
  const src = escapeRegExp(template(1)).replace("1", "(\\d+)"); // the count is the only variable
  const m = new RegExp(src).exec(system);
  return m ? Number(m[1]) : null;
}

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  readonly capabilities: ProviderCapabilities = MOCK_CAPABILITIES;
  /** DA-3 mock critic: per JOB (keyed by opts.jobId), the FIRST check fails and
   * every later one passes — one deterministic refine round per run, whatever
   * ran before it (teardown #9: an instance-lifetime counter made shot gates
   * depend on run ORDER). Bounded: a long-lived process forgets old jobs. */
  #evalChecks = new Map<string, number>();
  #evalSeen(jobId: string | undefined): number {
    const key = jobId ?? "";
    const n = this.#evalChecks.get(key) ?? 0;
    this.#evalChecks.set(key, n + 1);
    if (this.#evalChecks.size > 100) {
      const oldest = this.#evalChecks.keys().next().value;
      if (oldest !== undefined) this.#evalChecks.delete(oldest);
    }
    return n;
  }
  async chat(messages: LlmMessage[], _opts?: LlmChatOpts): Promise<string> {
    const user = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    const system = [...messages].reverse().find((m) => m.role === "system")?.content ?? "";
    const pageOutlineN = instructedCount(system, PLANNER_INSTRUCTIONS.pageOutline);
    const imagePromptsN = instructedCount(system, PLANNER_INSTRUCTIONS.imagePrompts);
    // DA-3 refine turn: the mock honors the shared instruction marker and revises
    // the prompt deterministically ("(refined: …)" naming the first fixHint).
    if (system.includes(REFINE_INSTRUCTION)) {
      const prev = (() => {
        try {
          return (JSON.parse(user) as { imagePrompt?: string }).imagePrompt ?? user;
        } catch {
          return user;
        }
      })();
      let hint = "";
      try {
        const parsed = JSON.parse(user) as { fixHints?: string[] };
        hint = parsed.fixHints?.[0] ? `: ${parsed.fixHints[0]}` : "";
      } catch {
        /* keep the bare marker */
      }
      return JSON.stringify({ title: prev.slice(0, 60) || "Refined", imagePrompt: `${prev} (refined${hint})` });
    }
    return JSON.stringify({
      title: user.slice(0, 60) || "Untitled",
      plan: ["layout", "imagery", "typography"],
      imagePrompt: user,
      copy: MOCK_PROMO_COPY,
      // DA-1: deterministic researchNotes when the planner was instructed to research
      ...(system.includes(PLANNER_INSTRUCTIONS.research)
        ? { researchNotes: ["mock finding: the request is current (source: mock planner)"] }
        : {}),
      ...(pageOutlineN
        ? {
            pageOutline: Array.from({ length: Number(pageOutlineN) }, (_, i) => ({
              title: `Page ${i + 1}`,
              summary: `${user.slice(0, 40) || "deck"} — part ${i + 1}`,
            })),
          }
        : {}),
      ...(imagePromptsN
        ? { imagePrompts: Array.from({ length: Number(imagePromptsN) }, (_, i) => `page ${i + 1} of ${imagePromptsN} — ${user.slice(0, 40)}`) }
        : {}),
    });
  }
  async isAvailable(): Promise<ProviderDiagnostic> {
    return { ok: true, detail: "mock planner — offline, no network" };
  }

  /** B1 mock vision read — deterministic, marker-keyed on the SHARED prompt
   * constant (reword the prompt and the matcher follows, PLANNER_INSTRUCTIONS
   * pattern). Bytes are ignored: the mock proves wiring, not eyesight. */
  async readImage(prompt: string, _image: Uint8Array, _schema: object = DECONSTRUCT_JSON_SCHEMA, opts: LlmChatOpts = {}): Promise<string> {
    if (prompt.includes(EVAL_READ_MARKER)) {
      // DA-3 mock critic — deterministic fail→pass per job (see #evalSeen)
      const fail = this.#evalSeen(opts.jobId) === 0;
      return JSON.stringify(
        fail
          ? { verdict: "fail", scores: { textHandling: 4, brand: 8, fidelity: 7, composition: 7 }, issues: ["mock issue: headline rendered with a typo"], fixHints: ["fix the headline spelling"] }
          : { verdict: "pass", scores: { textHandling: 9, brand: 9, fidelity: 9, composition: 9 }, issues: [], fixHints: [] },
      );
    }
    if (!prompt.includes(DECONSTRUCT_READ_MARKER)) {
      throw new Error(`mock vision: prompt is not a deconstruct read (missing ${DECONSTRUCT_READ_MARKER})`);
    }
    return JSON.stringify({
      texts: [
        { text: "SALE 50", box: { x: 0.08, y: 0.1, w: 0.55, h: 0.09 } },
        { text: "299.000₫", box: { x: 0.1, y: 0.72, w: 0.45, h: 0.07 } },
        { text: "Chỉ hôm nay", box: { x: 0.1, y: 0.81, w: 0.4, h: 0.05 } },
      ],
    });
  }
}
