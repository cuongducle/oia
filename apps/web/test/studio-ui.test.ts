import { describe, expect, it } from "vitest";
import { fitArtboard, templateCategory, filterTemplates, imageSource } from "../libs/studio-ui";
import { STUDIO_TEMPLATES } from "../libs/studio-templates";
import { sceneCanvasSchema } from "@oia/schema";

// Visual requirements: docs/design-direction.md; original editor fit/page behavior in ui-audit/orig-editor.png.
describe("Studio UI: canvas geometry", () => {
  it("fits the entire artboard within the remaining center viewport", () => {
    const z = fitArtboard(1360, 2048, 620, 650);
    expect(z * 1360).toBeLessThanOrEqual(620 - 64);
    expect(z * 2048).toBeLessThanOrEqual(650 - 160);
  });
  it("uses actual landscape dimensions, not hardcoded poster dimensions", () => {
    const z = fitArtboard(1920, 1080, 900, 700);
    expect(z * 1920).toBeLessThanOrEqual(836);
    expect(z * 1080).toBeLessThanOrEqual(540);
  });
  it("is finite even during initial zero-size layout and never enlarges above 100%", () => {
    expect(fitArtboard(0, 0, 0, 0)).toBeGreaterThan(0);
    expect(fitArtboard(100, 100, 2000, 2000)).toBe(1);
  });
});
describe("Studio UI: templates are real editable scenes", () => {
  it("ships a curated fallback with at least four distinct templates", () => {
    expect(STUDIO_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    expect(new Set(STUDIO_TEMPLATES.map(t => t.id)).size).toBe(STUDIO_TEMPLATES.length);
    for (const t of STUDIO_TEMPLATES) {
      expect(sceneCanvasSchema.safeParse(t.scene).success).toBe(true);
      expect(t.scene.objects.some(o => o.type === "Textbox")).toBe(true);
      expect(t.scene.objects.some(o => o.name === "clip")).toBe(true);
    }
  });
  it("filters by actual category rather than substring matching English labels", () => {
    expect(templateCategory("Q4 Review Presentation")).toBe("presentation");
    expect(templateCategory("Coffee Shop Poster")).toBe("poster");
    const posters = filterTemplates(STUDIO_TEMPLATES, "poster");
    expect(posters.length).toBeGreaterThan(0);
    expect(posters.every(t => templateCategory(t.name) === "poster")).toBe(true);
    expect(filterTemplates(STUDIO_TEMPLATES, "all")).toHaveLength(STUDIO_TEMPLATES.length);
  });
  it("preserves data and relative image URLs, rejects javascript URLs", () => {
    expect(imageSource("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
    expect(imageSource("/api/assets/foo.png")).toBe("/api/assets/foo.png");
    expect(imageSource("https://example.com/a.png")).toBeTruthy();
    expect(imageSource("javascript:alert(1)")).toBeNull();
  });
});
