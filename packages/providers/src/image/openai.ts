import type { ImageProvider, ImageGenInput, ImageGenResult } from "../types.js";

/** gpt-image (OpenAI Images API) — BYOK: OPENAI_API_KEY. */
export class OpenAiImageProvider implements ImageProvider {
  readonly name = "openai";
  constructor(
    private apiKey = process.env.OPENAI_API_KEY ?? "",
    private model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
  ) {}
  async generate(input: ImageGenInput): Promise<ImageGenResult> {
      if (!this.apiKey) throw new Error("OPENAI_API_KEY is not configured (BYOK)");
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: input.prompt,
        size: sizeFor(input.width, input.height),
        n: 1,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI image HTTP ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: { url?: string; b64_json?: string }[] };
    const d = json.data[0];
    return {
      url: d.url ?? `data:image/png;base64,${d.b64_json}`,
      provider: "openai",
      model: this.model,
    };
  }
}

function sizeFor(w: number, h: number): "1024x1024" | "1536x1024" | "1024x1536" {
  const r = w / h;
  if (r > 1.1) return "1536x1024";
  if (r < 0.9) return "1024x1536";
  return "1024x1024";
}
