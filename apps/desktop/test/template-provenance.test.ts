import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { STUDIO_TEMPLATES } from "../src/shared/studio-templates.js";
import { TEMPLATE_PROVENANCE } from "../src/shared/template-provenance.js";

/** SC-5: provenance records must point at templates that actually exist, and
 * every AI-plated studio template must carry its prompt (records must not lie:
 * a provenance gap is a missing asset, not a silent blank). */
describe("SC-5 template provenance", () => {
  it("every provenance entry maps to a shipped studio template", () => {
    const ids = new Set(STUDIO_TEMPLATES.map((t) => t.id));
    for (const p of TEMPLATE_PROVENANCE) expect(ids.has(p.templateId)).toBe(true);
  });
  it("every AI-plated template has provenance (programmatic plates exempt)", () => {
    const prov = new Set(TEMPLATE_PROVENANCE.map((p) => p.templateId));
    const aiPlated = ["ed-menu3", "ed-product2", "ed-holiday2", "ed-poster2", "ed-street", "ed-fashion", "ed-deck", "swiss-sneaker", "swiss-bottle", "tet-flashsale", "tet-gift", "tet-menu", "tet-greeting"].map((s) => `studio-${s}`);
    for (const id of aiPlated) expect(prov.has(id)).toBe(true);
  });
  it("ships the generated backgrounds, not the earlier procedural fallback, with exact recorded prompts", () => {
    const briefs = JSON.parse(readFileSync(path.join(__dirname, "../scripts/template-background-briefs.json"), "utf8"));
    for (const brief of briefs) {
      const id = `studio-${brief.id === "tet-red" ? "tet-swiss" : brief.id === "tet-gold" ? "tet-voucher" : brief.id}`;
      const template = STUDIO_TEMPLATES.find((t) => t.id === id);
      const image = template?.scene.objects.find((o) => o.type === "Image");
      expect(image?.src, id).toBe(`/studio/${brief.id}-ai-20261112.webp`);
      expect(existsSync(path.join(__dirname, "../src/renderer/public", String(image?.src))), id).toBe(true);
      const records = TEMPLATE_PROVENANCE.filter((p) => p.templateId === id);
      expect(records, id).toHaveLength(1);
      expect(records[0].prompt, id).toBe(brief.prompt);
      // Old documents must still be able to resolve their original asset URLs.
      expect(existsSync(path.join(__dirname, `../src/renderer/public/studio/${brief.id}.webp`)), id).toBe(true);
    }
  });
  it("prompts are real prompts, not placeholders", () => {
    for (const p of TEMPLATE_PROVENANCE) {
      expect(p.prompt.length).toBeGreaterThan(80);
      expect(p.prompt.toLowerCase()).toMatch(/no text|no words/);
    }
  });
});
