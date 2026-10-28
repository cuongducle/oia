import type { ImageProvider, ImageGenInput, ImageGenResult } from "../types.js";

/**
 * Default provider — needs no key and NEVER calls the network (tests stay stable offline).
 * Returns an embedded 8×8 placeholder PNG (data URL) — the canvas scales it; enough for the pipeline, demos, and CI.
 */
const PLACEHOLDER_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGOoaDrxHx9mGBkKAKvusEGLxCW0AAAAAElFTkSuQmCC";

export class MockImageProvider implements ImageProvider {
  readonly name = "mock";
  async generate(input: ImageGenInput): Promise<ImageGenResult> {
    return { url: PLACEHOLDER_PNG, provider: "mock", model: "placeholder-offline" };
  }
}
