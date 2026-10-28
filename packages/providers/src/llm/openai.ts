import type { LlmProvider, LlmMessage } from "../types.js";

export class OpenAiLlmProvider implements LlmProvider {
  readonly name = "openai";
  constructor(
    private apiKey = process.env.OPENAI_API_KEY ?? "",
    private model = process.env.OPENAI_LLM_MODEL ?? "gpt-4o-mini",
  ) {}
  async chat(messages: LlmMessage[], opts?: { json?: boolean }): Promise<string> {
      if (!this.apiKey) throw new Error("OPENAI_API_KEY is not configured (BYOK)");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0].message.content;
  }
}
