import type { ImageProvider, ImageGenInput, ImageGenResult, ProviderDiagnostic, ProviderCapabilities } from "../types.js";

/**
 * Default provider — needs no key and NEVER calls the network (tests stay stable offline).
 * Returns an embedded 8×8 placeholder PNG (data URL) — the canvas scales it; enough for the pipeline, demos, and CI.
 * TP.6: declares `isMock: true` (the 8×8 placeholder is what a keyless first-run user
 * actually sees) so Home can label "Chế độ thử nghiệm — ảnh placeholder, không phải AI thật".
 */
const PLACEHOLDER_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGOoaDrxHx9mGBkKAKvusEGLxCW0AAAAAElFTkSuQmCC";

const MOCK_CAPABILITIES: ProviderCapabilities = {
  referenceImages: false,
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock: true,
};

export class MockImageProvider implements ImageProvider {
  readonly name = "mock";
  readonly capabilities: ProviderCapabilities = MOCK_CAPABILITIES;
  async generate(_input: ImageGenInput): Promise<ImageGenResult> {
    return { url: PLACEHOLDER_PNG, provider: "mock", model: "placeholder-offline", width: 8, height: 8 };
  }
  async isAvailable(): Promise<ProviderDiagnostic> {
    return { ok: true, detail: "mock image provider — offline, no network" };
  }
}
