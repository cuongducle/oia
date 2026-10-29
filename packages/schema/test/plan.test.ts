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
    const nullable = ["imagePrompts", "outline", "copy", "blocks"];
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
    expect(normalizeBlocks({ title: "T", imagePrompt: "I", copy: "GIAM GIA 20%" })).toEqual([
      { role: "copy", text: "GIAM GIA 20%" },
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

describe("error taxonomy (TP.4)", () => {
  it("has exactly the 14 stable classes", () => {
    expect(ERROR_CLASSES).toHaveLength(14);
    expect(ERROR_CLASSES).toContain("plan_parse_failed");
    expect(ERROR_CLASSES).toContain("cancelled");
  });
});
