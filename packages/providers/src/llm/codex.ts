import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PLAN_JSON_SCHEMA, parsePlannerPlan, DECONSTRUCT_JSON_SCHEMA } from "@oia/schema";
import type { ProviderCapabilities, PlannerPlan } from "@oia/schema";
import type { LlmProvider, LlmMessage, LlmChatOpts, ProviderDiagnostic } from "../types.js";
import { ProviderError } from "../types.js";
import { CodexBridge } from "../codex/bridge.js";
import { createScratchDir, removeScratchDir } from "../cli/runtime.js";

/**
 * TP.2 — the keyless planner over the ChatGPT login (text-only `codex exec`).
 * Same bridge as image generation: one login, one channel, two uses.
 *
 * Exactly one attempt per call — no silent retry, no silent mock fallback.
 * A malformed plan fails with `plan_parse_failed` and the job aborts before
 * image generation (G2/G7): no text-free empty banners ship from a failed planner.
 */

/** Default planner budget — the registry threads CODEX_PLANNER_TIMEOUT_MS per instance (T3: no import-time env reads). */
export const CODEX_PLANNER_TIMEOUT_DEFAULT = 120_000;

const LLM_CAPABILITIES: ProviderCapabilities = {
  referenceImages: true, // B1: the vision read attaches one image via -i (readImage)
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock: false,
};

export class CodexLlmProvider implements LlmProvider {
  readonly name = "codex";
  readonly capabilities: ProviderCapabilities = LLM_CAPABILITIES;
  private readonly bridge: CodexBridge;
  private readonly timeoutMs: number;

  constructor(bridge?: CodexBridge, opts: { timeoutMs?: number } = {}) {
    this.bridge = bridge ?? new CodexBridge();
    this.timeoutMs = opts.timeoutMs ?? CODEX_PLANNER_TIMEOUT_DEFAULT;
  }

  async isAvailable(): Promise<ProviderDiagnostic> {
    return this.bridge.diagnose();
  }

  /**
   * `chat` with json:true runs one planner exec and returns the plan JSON string.
   * Strict parse-out: anything that is not a valid plan throws `plan_parse_failed`.
   */
  async chat(messages: LlmMessage[], opts?: LlmChatOpts): Promise<string> {
    const plan = await this.plan(messages, opts?.signal, opts?.jobId);
    return JSON.stringify(plan);
  }

  /** B1 — one vision read: image bytes materialized to an ASCII-named temp file
   * (same rule as image references, TP.9), attached with -i on the planner role,
   * output pinned by the CALLER's schema via --output-schema. Validation of the
   * returned JSON is the caller's job (deconstructReadSchema) — this returns raw. */
  async readImage(prompt: string, image: Uint8Array, _schema: object = DECONSTRUCT_JSON_SCHEMA, opts: LlmChatOpts = {}): Promise<string> {
    const scratch = await createScratchDir("codex-vision-io");
    try {
      const schemaFile = path.join(scratch, "read.schema.json");
      await writeFile(schemaFile, JSON.stringify(_schema), "utf8");
      const lastMessageFile = path.join(scratch, "read.json");
      const imgFile = path.join(scratch, `${randomUUID()}.png`); // hex uuid — ASCII-safe filename (TP.9)
      await writeFile(imgFile, Buffer.from(image));
      const res = await this.bridge.exec({
        role: "planner",
        prompt,
        schemaFile,
        lastMessageFile,
        images: [imgFile],
        timeoutMs: this.timeoutMs,
        signal: opts.signal,
        jobId: opts.jobId ?? `vision-${randomUUID()}`,
      });
      try {
        return await this.bridge.readPlanFile(lastMessageFile, res);
      } finally {
        await this.bridge.cleanup(res);
      }
    } finally {
      await removeScratchDir(scratch);
    }
  }

  /** One text-only exec; returns the parsed plan (strict). */
  async plan(messages: LlmMessage[], signal?: AbortSignal, jobId?: string): Promise<PlannerPlan> {
    const scratch = await createScratchDir("codex-planner-io");
    try {
      const schemaFile = path.join(scratch, "plan.schema.json");
      await writeFile(schemaFile, JSON.stringify(PLAN_JSON_SCHEMA), "utf8");
      const lastMessageFile = path.join(scratch, "plan.json");

      // stdin prompt: full conversation (system rules + user request). User input is
      // data, not instructions — the read-only sandbox and empty -C root bound the blast radius.
      const prompt = messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n");

      const res = await this.bridge.exec({
        role: "planner",
        prompt,
        schemaFile,
        lastMessageFile,
        timeoutMs: this.timeoutMs,
        signal,
        jobId: jobId ?? `planner-${randomUUID()}`,
      });
      try {
        const raw = await this.bridge.readPlanFile(lastMessageFile, res);
        const parsed = parsePlannerPlan(raw);
        if (!parsed) {
          throw new ProviderError("plan_parse_failed", "codex returned a malformed plan", {
            provider: "codex",
            detail: raw.slice(0, 300),
          });
        }
        return parsed;
      } finally {
        await this.bridge.cleanup(res);
      }
    } finally {
      await removeScratchDir(scratch);
    }
  }
}
