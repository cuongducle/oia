import type { ImageProvider, LlmProvider } from "./types.js";
import { MockImageProvider } from "./image/mock.js";
import { OpenAiImageProvider } from "./image/openai.js";
import { FalImageProvider } from "./image/fal.js";
import { CodexImageProvider } from "./image/codex.js";
import { MockLlmProvider } from "./llm/mock.js";
import { OpenAiLlmProvider } from "./llm/openai.js";

/** Pick providers from env — mock by default so everything runs keyless. */
export function getImageProvider(): ImageProvider {
  switch (process.env.IMAGE_PROVIDER) {
    case "openai": return new OpenAiImageProvider();
    case "fal": return new FalImageProvider();
    case "codex": return new CodexImageProvider();
    default: return new MockImageProvider();
  }
}
export function getLlmProvider(): LlmProvider {
  switch (process.env.LLM_PROVIDER) {
    case "openai": return new OpenAiLlmProvider();
    default: return new MockLlmProvider();
  }
}
