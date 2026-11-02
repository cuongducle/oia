import { describe, expect, it } from "vitest";
import { deconstructReadSchema, DECONSTRUCT_JSON_SCHEMA, DECONSTRUCT_READ_MARKER, DECONSTRUCT_READ_PROMPT, DECONSTRUCT_INPAINT_PROMPT } from "../src/deconstruct.js";

/** B1 — the vision-read contract (deconstruct-import.md DC-5). */
describe("deconstruct read schema", () => {
  it("parses a full read: texts with fraction boxes", () => {
    const r = deconstructReadSchema.parse({
      texts: [
        { text: "SALE 50", box: { x: 0.08, y: 0.1, w: 0.55, h: 0.09 } },
        { text: "  299.000₫  ", box: { x: 0, y: 1 - 0.07, w: 1, h: 0.07 } },
      ],
    });
    expect(r.texts).toHaveLength(2);
    expect(r.texts[1].text).toBe("299.000₫"); // trimmed — blank-at-the-wire is not a line of copy
  });

  it("rejects boxes outside 0..1 — a fraction contract must not admit pixels", () => {
    expect(deconstructReadSchema.safeParse({ texts: [{ text: "x", box: { x: 0, y: 0, w: 130, h: 480 } }] }).success).toBe(false);
    expect(deconstructReadSchema.safeParse({ texts: [{ text: "x", box: { x: -0.1, y: 0, w: 0.5, h: 0.1 } }] }).success).toBe(false);
  });

  it("rejects blank text and empty/absent arrays", () => {
    expect(deconstructReadSchema.safeParse({ texts: [{ text: "   ", box: { x: 0, y: 0, w: 0.1, h: 0.1 } }] }).success).toBe(false);
    expect(deconstructReadSchema.safeParse({}).success).toBe(false);
    expect(deconstructReadSchema.safeParse({ texts: [] }).success).toBe(true); // zero texts is a legal (sad but honest) read
  });

  it("caps at 60 lines — a hallucinating model cannot flood the scene", () => {
    const texts = Array.from({ length: 61 }, () => ({ text: "x", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 } }));
    expect(deconstructReadSchema.safeParse({ texts }).success).toBe(false);
  });

  it("the JSON Schema for --output-schema mirrors the zod contract (required texts, fraction box)", () => {
    expect(DECONSTRUCT_JSON_SCHEMA.required).toEqual(["texts"]);
    const box = (DECONSTRUCT_JSON_SCHEMA.properties.texts as { items: { properties: { box: { properties: Record<string, { maximum: number }> } } } }).items.properties.box.properties;
    for (const k of ["x", "y", "w", "h"]) expect(box[k].maximum).toBe(1);
  });

  it("both prompts carry their marker — the mock matcher keys on the shared constant", () => {
    expect(DECONSTRUCT_READ_PROMPT).toContain(DECONSTRUCT_READ_MARKER);
    expect(DECONSTRUCT_INPAINT_PROMPT).toContain("deconstruct.inpaint.v1");
    expect(DECONSTRUCT_READ_PROMPT).toContain("Vietnamese");
  });
});
