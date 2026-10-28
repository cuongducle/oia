import type { ImageProvider, ImageGenInput, ImageGenResult } from "../types.js";

/** FLUX via fal.ai — cheap (about 0.3-1 cent per image). BYOK: FAL_KEY. */
export class FalImageProvider implements ImageProvider {
  readonly name = "fal";
  constructor(
    private apiKey = process.env.FAL_KEY ?? "",
    private model = process.env.FAL_MODEL ?? "fal-ai/flux/schnell",
  ) {}
  async generate(input: ImageGenInput): Promise<ImageGenResult> {
      if (!this.apiKey) throw new Error("FAL_KEY is not configured (BYOK)");
    const res = await fetch(`https://fal.run/${this.model}`, {
      method: "POST",
      headers: { authorization: `Key ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        prompt: input.prompt,
        image_size: { width: Math.round(input.width), height: Math.round(input.height) },
      }),
    });
    if (!res.ok) throw new Error(`fal HTTP ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { images: { url: string }[] };
    return { url: json.images[0].url, provider: "fal", model: this.model };
  }
}
