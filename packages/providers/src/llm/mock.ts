import type { LlmProvider, LlmMessage } from "../types.js";

/** Mock planner: costs no tokens; generates the outline demos need. */
export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  async chat(messages: LlmMessage[]): Promise<string> {
    const user = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    return JSON.stringify({
      title: user.slice(0, 60) || "Untitled",
      plan: ["layout", "imagery", "typography"],
      imagePrompt: user,
      copy: "GIAM GIA 20%",
    });
  }
}
