import type { LlmProvider, LlmMessage, LlmChatOpts, ProviderDiagnostic, ProviderCapabilities } from "../types.js";
import { ProviderError } from "../types.js";

const OPENAI_LLM_CAPABILITIES: ProviderCapabilities = {
  referenceImages: false,
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock: false,
};

export class OpenAiLlmProvider implements LlmProvider {
  readonly name = "openai";
  readonly capabilities: ProviderCapabilities = OPENAI_LLM_CAPABILITIES;
  constructor(
    private apiKey = process.env.OPENAI_API_KEY ?? "",
    private model = process.env.OPENAI_LLM_MODEL ?? "gpt-4o-mini",
  ) {}
  async isAvailable(): Promise<ProviderDiagnostic> {
    if (!this.apiKey) return { ok: false, errorClass: "provider_missing", detail: "OPENAI_API_KEY is not configured (BYOK)" };
    return { ok: true, detail: "api key present (not validated until first call)" };
  }
  async chat(messages: LlmMessage[], opts?: LlmChatOpts): Promise<string> {
      if (!this.apiKey) throw new ProviderError("provider_missing", "OPENAI_API_KEY is not configured (BYOK)", { provider: "openai" });
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: opts?.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401) throw new ProviderError("not_logged_in", "OpenAI API key is invalid", { provider: "openai", detail: body.slice(0, 300) });
      if (res.status === 429) throw new ProviderError("rate_limited", "OpenAI rate limit hit", { provider: "openai", detail: body.slice(0, 300) });
      throw new ProviderError("unknown", `OpenAI HTTP ${res.status}: ${body.slice(0, 300)}`, { provider: "openai" });
    }
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0].message.content;
  }
}
