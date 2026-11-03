import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ERROR_CLASSES,
  PLAN_JSON_SCHEMA,
  normalizeBlocks,
  parsePlannerPlan,
  planBlockSchema,
  plannerPlanSchema,
  providerCapabilitiesSchema,
  evalReadSchema,
  selfImproveResultSchema,
  AUTO_REFINE_DEFAULT,
  AUTO_REFINE_MAX_ROUNDS_DEFAULT,
  AUTO_REFINE_MAX_ROUNDS_CAP,
  type PlannerPlan,
} from "../src/plan.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaFile = readFileSync(join(here, "../src/plan.schema.json"), "utf8");

describe("plan schema drift (TP.2): plan.schema.json is generated from PLAN_JSON_SCHEMA", () => {
  it("the checked-in file equals the code source of truth", () => {
    expect(JSON.parse(schemaFile)).toEqual(PLAN_JSON_SCHEMA);
  });
  it("strict-output invariants hold: every property required; optional ⇒ nullable", () => {
    const top = PLAN_JSON_SCHEMA.properties as Record<string, { type: unknown }>;
    for (const key of PLAN_JSON_SCHEMA.required as string[]) {
      expect(top[key], `property ${key}`).toBeDefined();
    }
    for (const key of Object.keys(top)) {
      expect(PLAN_JSON_SCHEMA.required, `${key} must be listed in required`).toContain(key);
    }
    // fields optional in zod must be ["X","null"] in the JSON Schema
    const nullable = ["imagePrompts", "outline", "copy", "blocks", "researchNotes"];
    for (const key of nullable) expect((top[key].type as string[]).at(-1)).toBe("null");
    // blocks items: strict too
    const items = (PLAN_JSON_SCHEMA.properties.blocks as { items: { required: string[]; properties: Record<string, { type: unknown }> } }).items;
    expect(items.required).toEqual(["role", "text", "styleHint"]);
    for (const key of Object.keys(items.properties)) {
      expect(items.required).toContain(key);
    }
  });
  it("zod shape and JSON Schema properties stay in sync", () => {
    const zodKeys = Object.keys(plannerPlanSchema.shape);
    const jsonKeys = Object.keys(PLAN_JSON_SCHEMA.properties);
    expect(zodKeys.sort()).toEqual(jsonKeys.sort());
    const blockKeys = Object.keys(planBlockSchema.shape);
    const jsonBlockKeys = Object.keys(
      (PLAN_JSON_SCHEMA.properties.blocks as { items: { properties: Record<string, unknown> } }).items.properties,
    );
    expect(blockKeys.sort()).toEqual(jsonBlockKeys.sort());
  });
});

describe("normalizeBlocks (TP.1): legacy copy → one block", () => {
  it("uses blocks[] when present", () => {
    const plan: PlannerPlan = {
      title: "T",
      imagePrompt: "I",
      blocks: [
        { role: "price", text: "20%" },
        { role: "date", text: "8/11", styleHint: "bottom-right badge" },
      ],
    };
    expect(normalizeBlocks(plan)).toHaveLength(2);
  });
  it("legacy copy becomes one block", () => {
    expect(normalizeBlocks({ title: "T", imagePrompt: "I", copy: "GIẢM GIÁ 20%" })).toEqual([
      { role: "copy", text: "GIẢM GIÁ 20%" },
    ]);
  });
  it("zero blocks is valid (poster mode)", () => {
    expect(normalizeBlocks({ title: "T", imagePrompt: "I" })).toEqual([]);
  });
});

describe("parsePlannerPlan: strict on shape, tolerant of fences", () => {
  it("parses a clean plan", () => {
    expect(parsePlannerPlan('{"title":"T","imagePrompt":"I"}')).toMatchObject({ title: "T" });
  });
  it("parses a fenced plan and a double-encoded string", () => {
    expect(parsePlannerPlan('```json\n{"title":"T","imagePrompt":"I"}\n```')).not.toBeNull();
    expect(parsePlannerPlan('"{\\"title\\":\\"T\\",\\"imagePrompt\\":\\"I\\"}"')).not.toBeNull();
  });
  it("returns null on garbage and on missing required fields", () => {
    expect(parsePlannerPlan("not json at all")).toBeNull();
    expect(parsePlannerPlan('{"title":"T"}')).toBeNull(); // imagePrompt missing
    expect(parsePlannerPlan("")).toBeNull();
  });
  it("rejects blocks with empty role/text", () => {
    expect(
      parsePlannerPlan('{"title":"T","imagePrompt":"I","blocks":[{"role":"","text":"x"}]}'),
    ).toBeNull();
  });
});

describe("C1 outline gate: pageOutline on the plan contract", () => {
  it("parses one entry per page with title + summary", () => {
    const plan = parsePlannerPlan('{"title":"T","imagePrompt":"I","pageOutline":[{"title":"Cover","summary":"hook + logo"},{"title":"Price","summary":"20% off"}]}');
    expect(plan?.pageOutline).toEqual([
      { title: "Cover", summary: "hook + logo" },
      { title: "Price", summary: "20% off" },
    ]);
  });
  it("error path: empty title or summary fails the whole parse (a blank row must never reach the card)", () => {
    expect(parsePlannerPlan('{"title":"T","imagePrompt":"I","pageOutline":[{"title":"","summary":"x"}]}')).toBeNull();
    expect(parsePlannerPlan('{"title":"T","imagePrompt":"I","pageOutline":[{"title":"x"}]}')).toBeNull();
  });
  it("stays optional + nullable (legacy plans parse unchanged — D14 additive)", () => {
    expect(parsePlannerPlan('{"title":"T","imagePrompt":"I"}')?.pageOutline).toBeUndefined();
    expect(parsePlannerPlan('{"title":"T","imagePrompt":"I","pageOutline":null}')?.pageOutline).toBeNull();
  });
});

describe("DA — researchNotes on the plan contract (D14 additive)", () => {
  it("parses a plan with researchNotes (one line per finding + source)", () => {
    const plan = parsePlannerPlan('{"title":"T","imagePrompt":"I","researchNotes":["2026 Tet falls on Feb 17 (vnexpress.net)"]}');
    expect(plan?.researchNotes).toEqual(["2026 Tet falls on Feb 17 (vnexpress.net)"]);
  });
  it("stays optional + nullable — legacy plans parse unchanged (both directions)", () => {
    expect(parsePlannerPlan('{"title":"T","imagePrompt":"I"}')?.researchNotes).toBeUndefined();
    expect(parsePlannerPlan('{"title":"T","imagePrompt":"I","researchNotes":null}')?.researchNotes).toBeNull();
  });
});

describe("DA — webSearch capability (optional-default-false)", () => {
  it("a legacy capabilities object parses unchanged (no webSearch key)", () => {
    const caps = providerCapabilitiesSchema.parse({ referenceImages: true, sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false } });
    expect(caps.webSearch).toBeUndefined(); // consumers read `=== true`
  });
  it("declares webSearch when present", () => {
    const caps = providerCapabilitiesSchema.parse({ referenceImages: true, sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false }, webSearch: true });
    expect(caps.webSearch).toBe(true);
  });
});

describe("DA — Auto refine bounds + eval contract", () => {
  it("DA-4: the bounds are pinned constants — default ON, default 1 round, hard cap 2", () => {
    expect(AUTO_REFINE_DEFAULT).toBe(true);
    expect(AUTO_REFINE_MAX_ROUNDS_DEFAULT).toBe(1);
    expect(AUTO_REFINE_MAX_ROUNDS_CAP).toBe(2);
  });
  it("evalReadSchema: a full read parses; wrong verdicts/garbage fail", () => {
    const good = evalReadSchema.parse({ verdict: "fail", scores: { text: 4, brand: 8, fidelity: 7, composition: 7 }, issues: ["typo"], fixHints: ["fix it"] });
    expect(good.verdict).toBe("fail");
    expect(() => evalReadSchema.parse({ verdict: "maybe", scores: { text: 4, brand: 8, fidelity: 7, composition: 7 }, issues: [], fixHints: [] })).toThrow();
    expect(() => evalReadSchema.parse("not json")).toThrow();
    expect(() => evalReadSchema.parse({ verdict: "pass", scores: { text: 11, brand: 8, fidelity: 7, composition: 7 }, issues: [], fixHints: [] })).toThrow(); // 0..10
  });
  it("selfImproveResultSchema: the persisted verdict (DA-6)", () => {
    const r = selfImproveResultSchema.parse({ rounds: 1, verdict: "pass", issues: [] });
    expect(r.rounds).toBe(1);
    expect(() => selfImproveResultSchema.parse({ rounds: 1, verdict: "maybe", issues: [] })).toThrow();
    expect(() => selfImproveResultSchema.parse({ rounds: -1, verdict: "pass", issues: [] })).toThrow();
  });
});

describe("error taxonomy (TP.4)", () => {
  it("has exactly the 14 stable classes", () => {
    expect(ERROR_CLASSES).toHaveLength(14);
    expect(ERROR_CLASSES).toContain("plan_parse_failed");
    expect(ERROR_CLASSES).toContain("cancelled");
  });
});
