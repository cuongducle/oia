import { describe, expect, it } from "vitest";
import { TEMPLATE_CATEGORIES, templateSchema } from "@oia/schema";
import { BUNDLED_TEMPLATES } from "../src/shared/bundled-templates.js";
import { filterTemplates } from "../src/renderer/lib/studio-ui.js";

describe("bundled catalog discovery", () => {
  it("exposes usable scenes in every taxonomy category, including formerly hidden live presets", () => {
    const ids = new Set<string>();
    for (const category of TEMPLATE_CATEGORIES) {
      const visible = filterTemplates(BUNDLED_TEMPLATES, category.id);
      expect(visible.length, category.id).toBeGreaterThan(0);
      for (const template of visible) {
        expect(() => templateSchema.parse(template), template.id).not.toThrow();
        expect(ids.has(template.id), template.id).toBe(false);
        ids.add(template.id);
        expect(template.scene.objects.some((o) => o.type === "Textbox" && typeof o.text === "string" && o.text.trim()), template.id).toBe(true);
      }
    }
    expect(ids.size).toBe(BUNDLED_TEMPLATES.length);
    expect(filterTemplates(BUNDLED_TEMPLATES, "livestream").map((t) => t.id)).toContain("live-flash-sale");
  });
  it("keeps generic overlays transparent, separate from platform-specific livestream scenes", () => {
    for (const template of filterTemplates(BUNDLED_TEMPLATES, "overlay")) {
      const clip = template.scene.objects.find((o) => o.name === "clip");
      expect(clip?.fill).toBe("transparent");
      expect(clip?.width).toBe(1920);
      expect(clip?.height).toBe(1080);
    }
  });
});
