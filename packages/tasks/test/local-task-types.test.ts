import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LOCAL_TASK_TYPES } from "@oia/schema";

/**
 * LOCAL_TASK_TYPES frees these tasks from the single metered-slot guard
 * (guardedTaskSubmit). That is only honest while their processors NEVER touch
 * a provider: the day someone adds an LLM or image call to remove-background,
 * the set silently frees real quota from the one-slot rule. There is no cheap
 * runtime pin (rembg/ONNX would have to be stubbed), so this is a SOURCE SCAN
 * (same style as the english-ui scanner): each LOCAL processor's function body
 * must contain no ctx.image / ctx.llm token.
 */

const src = [
  readFileSync(path.resolve(import.meta.dirname, "../src/processors.ts"), "utf8"),
  // makeRecognizeFonts lives in its own module (Lens), same provider-free rule
  readFileSync(path.resolve(import.meta.dirname, "../src/font-recognition.ts"), "utf8"),
].join("\n");
const FUNC_START = /^export function (make\w+)\(ctx: ProcCtx[),]/;

const bodies = new Map<string, string>();
for (const m of src.matchAll(/^(export function make\w+\(ctx: ProcCtx\)[^{]*\{|^})/gm)) {
  void m;
}
// brace-matched extraction (processors.ts has no nested top-level functions)
let current: string | null = null;
let depth = 0;
for (const line of src.split("\n")) {
  const start = FUNC_START.exec(line);
  if (start) {
    current = start[1];
    bodies.set(current, "");
    depth = 0;
  }
  if (!current) continue;
  bodies.set(current, bodies.get(current)! + line + "\n");
  for (const ch of line) {
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
  }
  if (depth === 0 && bodies.get(current)!.includes("{")) current = null;
}

/** Processor name for a task type is registered in context.ts (services). */
const ctxSrc = readFileSync(path.resolve(import.meta.dirname, "../../../packages/services/src/context.ts"), "utf8");

describe("LOCAL_TASK_TYPES processors stay provider-free (quota-semantics pin)", () => {
  it("the source scan found the processor functions (guard: not silently empty)", () => {
    expect(bodies.size).toBeGreaterThanOrEqual(8);
  });
  for (const type of LOCAL_TASK_TYPES) {
    it(`${type}: its processor body touches no provider`, () => {
      const maker = `make${type.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`;
      const registered = new RegExp(`taskStore\\.register\\("${type}",\\s*${maker}\\(`).test(ctxSrc);
      const body = bodies.get(maker);
      expect(registered, `${type} should be registered as ${maker} in context.ts (rename? update this test AND the set)`).toBe(true);
      expect(body, `${maker} body not found for LOCAL task ${type}`).toBeTruthy();
      expect(body, `${type} is LOCAL_TASK_TYPES (no metered slot): its processor must not call ctx.image/ctx.llm`).not.toMatch(/ctx\.(image|llm)\b/);
    });
  }
});
