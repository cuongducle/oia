import type { ImageProvider, ImageGenInput, ImageGenResult, ProviderDiagnostic, ProviderCapabilities } from "../types.js";
import { ProviderError } from "../types.js";

/** FLUX via fal.ai — cheap (about 0.3-1 cent per image). BYOK: FAL_KEY. */
const FAL_CAPABILITIES: ProviderCapabilities = {
  referenceImages: false,
  sizePolicy: { trueRatio: true, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock: false,
};

export class FalImageProvider implements ImageProvider {
  readonly name = "fal";
  readonly capabilities: ProviderCapabilities = FAL_CAPABILITIES;
  constructor(
    private apiKey = process.env.FAL_KEY ?? "",
    private model = process.env.FAL_MODEL ?? "fal-ai/flux/schnell",
  ) {}

  async isAvailable(): Promise<ProviderDiagnostic> {
    if (!this.apiKey) return { ok: false, errorClass: "provider_missing", detail: "FAL_KEY is not configured (BYOK)" };
    return { ok: true, detail: "api key present (not validated until first call)" };
  }

  async generate(input: ImageGenInput): Promise<ImageGenResult> {
    if (!this.apiKey) throw new ProviderError("provider_missing", "FAL_KEY is not configured (BYOK)", { provider: "fal" });
    const res = await fetch(`https://fal.run/${this.model}`, {
      method: "POST",
      headers: { authorization: `Key ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        prompt: input.prompt,
        image_size: { width: Math.round(input.width), height: Math.round(input.height) },
      }),
      signal: input.signal,
    });
    if (res.status === 401) throw new ProviderError("not_logged_in", "FAL_KEY is invalid", { provider: "fal" });
    if (res.status === 429) throw new ProviderError("rate_limited", "fal rate limit hit", { provider: "fal" });
    if (!res.ok) throw new ProviderError("unknown", `fal HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, { provider: "fal" });
    const json = (await res.json()) as { images: { url: string }[] };
    if (!json.images?.[0]?.url) throw new ProviderError("no_output", "fal returned no image", { provider: "fal" });
    return { url: json.images[0].url, provider: "fal", model: this.model };
  }
}
