import type { LlmProvider, LlmMessage, LlmChatOpts, ProviderDiagnostic, ProviderCapabilities } from "../types.js";
import { PLANNER_INSTRUCTIONS } from "@oia/schema";

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
  referenceImages: false,
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock: true,
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
  async chat(messages: LlmMessage[], _opts?: LlmChatOpts): Promise<string> {
    const user = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    const system = [...messages].reverse().find((m) => m.role === "system")?.content ?? "";
    const pageOutlineN = instructedCount(system, PLANNER_INSTRUCTIONS.pageOutline);
    const imagePromptsN = instructedCount(system, PLANNER_INSTRUCTIONS.imagePrompts);
    return JSON.stringify({
      title: user.slice(0, 60) || "Untitled",
      plan: ["layout", "imagery", "typography"],
      imagePrompt: user,
      copy: MOCK_PROMO_COPY,
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
}
