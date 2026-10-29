import type { LlmProvider, LlmMessage, LlmChatOpts, ProviderDiagnostic, ProviderCapabilities } from "../types.js";

/**
 * Mock planner: costs no tokens; generates the outline demos need.
 * TP.6/TP.4: declares `isMock: true` so the UI can label "Chế độ thử nghiệm";
 * the registry refuses to boot a mock planner paired with a real image provider
 * (assertNoMixedMockConfig) — mock output must never reach a real user silently.
 */
const MOCK_CAPABILITIES: ProviderCapabilities = {
  referenceImages: false,
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock: true,
};

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  readonly capabilities: ProviderCapabilities = MOCK_CAPABILITIES;
  async chat(messages: LlmMessage[], _opts?: LlmChatOpts): Promise<string> {
    const user = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    return JSON.stringify({
      title: user.slice(0, 60) || "Untitled",
      plan: ["layout", "imagery", "typography"],
      imagePrompt: user,
      copy: "GIAM GIA 20%",
    });
  }
  async isAvailable(): Promise<ProviderDiagnostic> {
    return { ok: true, detail: "mock planner — offline, no network" };
  }
}
