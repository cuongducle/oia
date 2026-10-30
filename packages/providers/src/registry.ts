import type { ImageProvider, LlmProvider, ProviderCapabilities } from "./types.js";
import { MockImageProvider } from "./image/mock.js";
import { OpenAiImageProvider } from "./image/openai.js";
import { FalImageProvider } from "./image/fal.js";
import { CodexImageProvider } from "./image/codex.js";
import { MockLlmProvider } from "./llm/mock.js";
import { OpenAiLlmProvider } from "./llm/openai.js";
import { CodexLlmProvider } from "./llm/codex.js";
import { CodexBridge } from "./codex/bridge.js";
import { OPENAI_IMAGE_MODEL_DEFAULT } from "./wire/openai-images.js";

/** Positive integer from env, or the fallback. Registry-only knob parsing (T3). */
function envInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const n = Number(env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Registry as a plain map composed from env config (TP.11).
 *
 * T3 — the env object passed HERE is the single config source: every provider is
 * constructed with explicit values from it. Constructors used to default to
 * process.env (keys, CODEX_BIN, models, timeouts), so in the utility process —
 * where main sends config via the init RPC, never via process.env — real keys
 * silently went missing while a leaked shell key could ride along. Import-time
 * env consts (CODEX_IMAGE_TIMEOUT_MS …) are dead: knobs read here, at construction.
 *
 * Defaults stay mock/mock so a fresh clone runs keyless offline — but see
 * assertNoMixedMockConfig: a mock provider paired with a real provider in
 * EITHER direction never boots silently (B2: canned planner output must not
 * ride a real generation channel).
 */
export function getImageProvider(env: NodeJS.ProcessEnv = process.env): ImageProvider {
  switch (env.IMAGE_PROVIDER) {
    case "openai":
      return new OpenAiImageProvider(env.OPENAI_API_KEY ?? "", env.OPENAI_IMAGE_MODEL ?? OPENAI_IMAGE_MODEL_DEFAULT);
    case "fal":
      return new FalImageProvider(env.FAL_KEY ?? "", env.FAL_MODEL);
    case "codex":
      return new CodexImageProvider(new CodexBridge({ bin: env.CODEX_BIN ?? "codex" }), {
        timeoutMs: envInt(env, "CODEX_IMAGE_TIMEOUT_MS", 300_000),
      });
    default: return new MockImageProvider();
  }
}
export function getLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  switch (env.LLM_PROVIDER) {
    case "openai":
      return new OpenAiLlmProvider(env.OPENAI_API_KEY ?? "", env.OPENAI_LLM_MODEL ?? "gpt-4o-mini");
    case "codex":
      return new CodexLlmProvider(new CodexBridge({ bin: env.CODEX_BIN ?? "codex" }), {
        timeoutMs: envInt(env, "CODEX_PLANNER_TIMEOUT_MS", 120_000),
      });
    default: return new MockLlmProvider();
  }
}

const MOCK_IMAGE_PROVIDERS = new Set(["mock", "", undefined]);
const MOCK_LLM_PROVIDERS = new Set(["mock", "", undefined]);

/**
 * TP.2/TP.4 — bidirectional mixed-config guard. A mock planner feeding a real image
 * channel (or the reverse) fails startup with an explicit message; this configuration
 * pair never boots. CI and offline demos set BOTH to mock explicitly.
 */
export function assertNoMixedMockConfig(env: NodeJS.ProcessEnv = process.env): void {
  const imageIsMock = MOCK_IMAGE_PROVIDERS.has(env.IMAGE_PROVIDER);
  const llmIsMock = MOCK_LLM_PROVIDERS.has(env.LLM_PROVIDER);
  if (imageIsMock === llmIsMock) return;
  const real = imageIsMock ? `LLM_PROVIDER=${env.LLM_PROVIDER}` : `IMAGE_PROVIDER=${env.IMAGE_PROVIDER}`;
  const mock = imageIsMock ? `IMAGE_PROVIDER=${env.IMAGE_PROVIDER ?? "mock"}` : `LLM_PROVIDER=${env.LLM_PROVIDER ?? "mock"}`;
  throw new Error(
    `Oia refuses a mixed mock/real provider config: ${mock} (mock) with ${real} (real). ` +
    `Mock planner output must never reach a real generation channel silently — set both providers real ` +
    `(e.g. IMAGE_PROVIDER=codex + LLM_PROVIDER=codex) or both mock.`,
  );
}

/** Provider matrix for the health panel (TP.6) — read the registry, don't hardcode. */
export function providerMatrix(env: NodeJS.ProcessEnv = process.env): {
  image: { name: string; capabilities: ProviderCapabilities };
  llm: { name: string; capabilities: ProviderCapabilities };
} {
  const image = getImageProvider(env);
  const llm = getLlmProvider(env);
  return {
    image: { name: image.name, capabilities: image.capabilities },
    llm: { name: llm.name, capabilities: llm.capabilities },
  };
}
