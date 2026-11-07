import { describe, expect, it } from "vitest";
import { STUDIO_TEMPLATES } from "../src/shared/studio-templates.js";
import { TEMPLATE_PROVENANCE } from "../src/shared/template-provenance.js";

/** SC-5 — provenance records must point at templates that actually exist, and
 * every AI-plated studio template must carry its prompt (records must not lie:
 * a provenance gap is a missing asset, not a silent blank). */
describe("SC-5 template provenance", () => {
  it("every provenance entry maps to a shipped studio template", () => {
    const ids = new Set(STUDIO_TEMPLATES.map((t) => t.id));
    for (const p of TEMPLATE_PROVENANCE) expect(ids.has(p.templateId)).toBe(true);
  });
  it("every AI-plated template has provenance (programmatic plates exempt)", () => {
    const prov = new Set(TEMPLATE_PROVENANCE.map((p) => p.templateId));
    const aiPlated = ["ed-menu3", "ed-product2", "ed-holiday2", "ed-poster2", "ed-street", "ed-fashion", "ed-deck", "swiss-sneaker", "swiss-bottle"].map((s) => `studio-${s}`);
    for (const id of aiPlated) expect(prov.has(id)).toBe(true);
  });
  it("prompts are real prompts, not placeholders", () => {
    for (const p of TEMPLATE_PROVENANCE) {
      expect(p.prompt.length).toBeGreaterThan(80);
      expect(p.prompt.toLowerCase()).toContain("no text");
    }
  });
});
