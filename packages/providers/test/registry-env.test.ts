import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
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

  // D18/T3: the model used to be an import-time process.env read — dead through the
  // init RPC env object. It must thread construction-time now: API-key auth pins
  // API models via exactly this knob.
  it("D18: CODEX_LLM_MODEL from the env object reaches the exec argv (-m), default stays gpt-6-luna", async () => {
    const { mkdirSync, writeFileSync, readFileSync, chmodSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const argvFile = path.join(tmpdir(), `oia-d17-argv-${Date.now()}.txt`);
    const binDir = path.join(tmpdir(), `oia-d17-bin-${Date.now()}`);
    mkdirSync(binDir, { recursive: true });
    const fake = path.join(binDir, "codex");
    writeFileSync(
      fake,
      `#!/bin/sh\nprintf '%s' "$*" > '${argvFile}'\necho '{"type":"thread.started","thread_id":"t1"}'\n`,
      { mode: 0o755 },
    );
    chmodSync(fake, 0o755);
    const run = async (env: NodeJS.ProcessEnv): Promise<string> => {
      const llm = getLlmProvider({ LLM_PROVIDER: "codex", CODEX_BIN: fake, ...env });
      await llm.chat([{ role: "user", content: "x" }], { json: true }).catch(() => {}); // plan_parse_failed is fine — argv is already recorded
      return readFileSync(argvFile, "utf8");
    };
    expect(await run({ CODEX_LLM_MODEL: "gpt-5.5" })).toContain("-m gpt-5.5");
    expect(await run({})).toContain("-m gpt-6-luna"); // the ChatGPT-login default pair
  });
});
