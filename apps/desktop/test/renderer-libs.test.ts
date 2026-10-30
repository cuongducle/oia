import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { sceneCanvasSchema } from "@oia/schema";
import { fitArtboard, sceneSize, templateCategory, filterTemplates, imageSource } from "../src/renderer/lib/studio-ui.js";
import { STUDIO_TEMPLATES } from "../src/renderer/lib/studio-templates.js";
import { QUICK_TOOLS, getTool } from "../src/renderer/lib/tools-registry.js";
import { EN_MESSAGES, type I18nKey } from "../src/renderer/lib/i18n.js";
import { ERROR_PRESENTATION } from "../src/renderer/lib/provider-errors.js";
import { ERROR_CLASSES } from "@oia/schema";
import { presentErrorEn } from "../src/renderer/lib/errors.js";

/**
 * Reorg step 5 — the coverage-matrix cells the web tests used to own. The web
 * app is deleted in step 6 together with its test suite; these behaviors were
 * ported with the lib copies in step 2/4c but never re-homed. Source of truth:
 * docs/verification/web-test-coverage-matrix.md.
 */

describe("studio-ui: artboard dimensions survive page switches and reloads", () => {
  it("prefers the named artboard over arbitrary rectangles", () => {
    expect(sceneSize({ objects: [{ type: "Rect", width: 30, height: 40 }, { type: "rect", name: "clip", width: 1920, height: 1080 }] }))
      .toEqual({ width: 1920, height: 1080 });
  });
  it("supports older scenes without a name and safely handles invalid dimensions", () => {
    expect(sceneSize({ objects: [{ type: "Rect", width: 900, height: 1200 }] })).toEqual({ width: 900, height: 1200 });
    expect(sceneSize({ objects: [{ name: "clip", width: 0, height: NaN }] })).toEqual({ width: 1360, height: 2048 });
  });
});

describe("studio-ui: canvas geometry", () => {
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
  it("is finite during initial zero-size layout and never enlarges above 100%", () => {
    for (const [w, h] of [[0, 0], [4000, 4000]] as const) {
      const z = fitArtboard(w, h, 0, 0);
      expect(Number.isFinite(z)).toBe(true);
      expect(z).toBeLessThanOrEqual(1);
      expect(z).toBeGreaterThan(0);
    }
  });
});

describe("studio-ui: templates are real editable scenes", () => {
  it("filters by actual category rather than substring matching English labels", () => {
    expect(templateCategory("Quarterly review deck")).toBe("presentation");
    expect(templateCategory("Instagram carousel")).toBe("social");
    expect(templateCategory("Matcha festival menu")).toBe("poster");
    expect(templateCategory("Something else entirely")).toBe("other");
    expect(filterTemplates([{ name: "Matcha menu" }, { name: "Slide deck" }] as never, "poster")).toHaveLength(1);
    expect(filterTemplates([{ name: "a" }] as never, "all")).toHaveLength(1);
  });
  it("imageSource admits http(s), data URLs and root-relative paths — and nothing executable", () => {
    expect(imageSource("https://x/y.png")).toBe("https://x/y.png");
    expect(imageSource("data:image/png;base64,xx")).toBe("data:image/png;base64,xx");
    expect(imageSource("/studio/matcha.webp")).toBe("/studio/matcha.webp");
    expect(imageSource("javascript:alert(1)")).toBeNull();
    expect(imageSource("//evil.example/x")).toBeNull();
    expect(imageSource(undefined)).toBeNull();
  });
});

describe("studio-templates: the curated fallback ships real scenes", () => {
  it("at least four distinct templates, every scene schema-valid with a clip artboard", () => {
    expect(STUDIO_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    expect(new Set(STUDIO_TEMPLATES.map((t) => t.id)).size).toBe(STUDIO_TEMPLATES.length);
    for (const tpl of STUDIO_TEMPLATES) {
      expect(() => sceneCanvasSchema.parse(tpl.scene)).not.toThrow();
      const clip = tpl.scene.objects.find((o) => o.name === "clip");
      expect(clip, `${tpl.id} clip artboard`).toBeTruthy();
      expect(clip!.width!).toBeGreaterThan(0);
    }
  });
  it("artwork uses RELATIVE /studio URLs (absolute /studio breaks under file:// in the packaged app)", () => {
    for (const tpl of STUDIO_TEMPLATES) {
      for (const o of tpl.scene.objects) {
        if (typeof o.src === "string") {
          expect(o.src.startsWith("/studio/"), `${tpl.id} ${o.src}`).toBe(true);
        }
      }
    }
  });
});

describe("quick tools registry (4 categories, one honest landing)", () => {
  it("exactly the 4 expected categories", () => {
    const cats = new Set(QUICK_TOOLS.map((tool) => tool.category));
    expect([...cats].sort()).toEqual(["Converter", "Creative AI", "Image Editor", "Image Generator"]);
  });
  it("representative tools present with matching descriptions", () => {
    for (const slug of ["png-to-jpg", "jpg-to-pdf", "heic-to-pdf", "image-resizer", "ai-hairstyle", "bar-graph-maker", "venn-diagram-maker"]) {
      expect(getTool(slug), slug).toBeTruthy();
    }
    expect(getTool("image-resizer")!.desc).toMatch(/Resize images/);
  });
  it("slug unique", () => {
    expect(new Set(QUICK_TOOLS.map((tool) => tool.slug)).size).toBe(QUICK_TOOLS.length);
  });
  it("every tool is implemented except ppt-translator (the only landing — D5)", () => {
    const landing = QUICK_TOOLS.filter((tool) => !tool.implemented);
    expect(landing.map((tool) => tool.slug)).toEqual(["ppt-translator"]);
    expect(landing[0].kind).toBe("landing");
  });
});

describe("i18n is English-only and complete (D8)", () => {
  it("every dictionary entry is a non-empty string", () => {
    for (const [key, value] of Object.entries(EN_MESSAGES)) {
      expect(value.trim().length, `${key} is empty`).toBeGreaterThan(1);
    }
  });

  /** Vietnamese-specific letters — none may appear in desktop UI copy (D8). */
  const VIETNAMESE = /[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/;

  it("the EN dictionary carries no Vietnamese copy", () => {
    const offenders = Object.entries(EN_MESSAGES).filter(([, v]) => VIETNAMESE.test(v));
    expect(offenders.map(([k]) => k)).toEqual([]);
  });

  it("no Vietnamese text in renderer views/components (the web english-ui gate, re-homed)", () => {
    const root = path.resolve(import.meta.dirname, "../src/renderer");
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) scan(full);
        else if (/\.(tsx?|css)$/.test(f.name)) {
          if (VIETNAMESE.test(readFileSync(full, "utf8"))) offenders.push(path.relative(root, full));
        }
      }
    };
    scan(root);
    expect(offenders).toEqual([]);
  });

  it("every error class renders REAL English — no silent unknown fallback (coverage for the Partial EN dict)", () => {
    for (const cls of ERROR_CLASSES) {
      const p = ERROR_PRESENTATION[cls];
      expect(EN_MESSAGES[p.messageKey].trim().length, `${cls} messageKey`).toBeGreaterThan(1);
      if (p.actionLabelKey) expect(EN_MESSAGES[p.actionLabelKey!].trim().length, `${cls} actionLabelKey`).toBeGreaterThan(1);
      // the rendered shape never falls back for a KNOWN class
      const en = presentErrorEn(cls);
      expect(en.message).toBe(EN_MESSAGES[p.messageKey]);
      expect(en.actionLabel ?? "").toBe(p.actionLabelKey ? EN_MESSAGES[p.actionLabelKey!] : "");
    }
  });
});
