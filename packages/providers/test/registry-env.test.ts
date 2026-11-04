import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getImageProvider, getLlmProvider } from "../src/registry.js";

/**
 * T3 — the env OBJECT passed to the registry is the single config source.
 * Constructors used to default to process.env, so in the utility process
 * (where main sends config via the init RPC env object, never process.env):
 * a real key in the env object was IGNORED, and a key leaked from the
 * launching shell RODE ALONG silently. These tests pin the isolation with a
 * poisoned process.env.
 */

const saved: Record<string, string | undefined> = {};
const POISON: [string, string][] = [
  ["OPENAI_API_KEY", "LEAKED-SHELL-KEY"],
  ["FAL_KEY", "LEAKED-SHELL-KEY"],
  ["CODEX_BIN", "/leaked/shell/codex"],
  ["CODEX_IMAGE_TIMEOUT_MS", "1"],
];

beforeEach(() => {
  for (const [k, v] of POISON) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
});
afterEach(() => {
  for (const [k] of POISON) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("registry env isolation (T3)", () => {
  it("openai image: an EMPTY key in the env object means NOT CONFIGURED — a leaked shell key must not ride along", async () => {
    const p = getImageProvider({ IMAGE_PROVIDER: "openai", OPENAI_API_KEY: "" }); // poisoned process.env has one
    const diag = await p.isAvailable();
    expect(diag.ok).toBe(false); // OLD code: ok — the constructor defaulted to process.env
    expect(diag.detail).toContain("OPENAI_API_KEY");
  });

  it("openai image: the key from the env object IS used when present", async () => {
    const p = getImageProvider({ IMAGE_PROVIDER: "openai", OPENAI_API_KEY: "from-the-env-object" });
    expect((await p.isAvailable()).ok).toBe(true);
  });

  it("fal image: same isolation", async () => {
    const p = getImageProvider({ IMAGE_PROVIDER: "fal", FAL_KEY: "" });
    const diag = await p.isAvailable();
    expect(diag.ok).toBe(false); // OLD code: ok — process.env.FAL_KEY leaked in
  });

  it("openai llm: same isolation", async () => {
    const p = getLlmProvider({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "" });
    expect((await p.isAvailable()).ok).toBe(false);
  });

  it("codex: constructs from the env object without touching the poisoned process.env", () => {
    const p = getImageProvider({ IMAGE_PROVIDER: "codex", CODEX_BIN: "/from-env-object/codex" });
    expect(p.name).toBe("codex");
    expect(p.capabilities.isMock).toBe(false);
    const llm = getLlmProvider({ LLM_PROVIDER: "codex" });
    expect(llm.name).toBe("codex");
  });

  it("mock remains the default for an empty env", () => {
    expect(getImageProvider({}).capabilities.isMock).toBe(true);
    expect(getLlmProvider({}).capabilities.isMock).toBe(true);
  });
});
