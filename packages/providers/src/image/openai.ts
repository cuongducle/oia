import type { ImageProvider, ImageGenInput, ImageGenResult, ProviderDiagnostic, ProviderCapabilities } from "../types.js";
import { ProviderError } from "../types.js";
import { OPENAI_IMAGE_CAPABILITIES, OPENAI_IMAGE_MODEL_DEFAULT, openAiImages } from "../wire/openai-images.js";

/**
 * OpenAI Images adapter (BYOK: OPENAI_API_KEY) — a thin adapter over the shared
 * openai-images wire (TP.9/TP.11): generations without references, edits with them,
 * both pinning one configured model. True-ratio sizes replace the old 3-size snapping.
 */
export class OpenAiImageProvider implements ImageProvider {
  readonly name = "openai";
  readonly capabilities: ProviderCapabilities = OPENAI_IMAGE_CAPABILITIES;
  constructor(
    private apiKey = process.env.OPENAI_API_KEY ?? "",
    private model = OPENAI_IMAGE_MODEL_DEFAULT,
  ) {}

  async isAvailable(): Promise<ProviderDiagnostic> {
    if (!this.apiKey) {
      return { ok: false, errorClass: "provider_missing", detail: "OPENAI_API_KEY is not configured (BYOK)" };
    }
    return { ok: true, detail: "api key present (not validated until first call)" };
  }

  async generate(input: ImageGenInput): Promise<ImageGenResult> {
    if (!this.apiKey) throw new ProviderError("provider_missing", "OPENAI_API_KEY is not configured (BYOK)", { provider: "openai" });
    if (input.referenceImages?.length && !this.capabilities.referenceImages) {
      throw new ProviderError("capability_unsupported", "this provider does not accept reference images", { provider: this.name });
    }
    const res = await openAiImages({
      apiKey: this.apiKey,
      model: this.model,
      prompt: input.prompt,
      width: input.width,
      height: input.height,
      references: input.referenceImages,
      signal: input.signal,
    });
    return { url: res.url, provider: "openai", model: res.model, width: res.width, height: res.height };
  }
}
