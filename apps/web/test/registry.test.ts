import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { QUICK_TOOLS, getTool } from "../libs/tools-registry";
import { SKILLS, getSkill } from "../libs/skills-registry";
import { LOCALES, t, detectLocale, translatedKeyCount } from "../libs/i18n";

describe("BR-QT quick tools registry", () => {
  it("exactly the 4 expected categories", () => {
    const cats = new Set(QUICK_TOOLS.map((t) => t.category));
    expect([...cats].sort()).toEqual(["Converter", "Creative AI", "Image Editor", "Image Generator"]);
  });
  it("representative tools present with matching descriptions", () => {
    for (const slug of ["png-to-jpg", "jpg-to-pdf", "heic-to-pdf", "image-resizer", "ai-hairstyle", "bar-graph-maker", "venn-diagram-maker"]) {
      expect(getTool(slug), slug).toBeTruthy();
    }
    expect(getTool("image-resizer")!.desc).toMatch(/Resize images/);
  });
  it("slug unique", () => {
    expect(new Set(QUICK_TOOLS.map((t) => t.slug)).size).toBe(QUICK_TOOLS.length);
  });
it("13/14 tools implemented — only ppt-translator is a landing page (awaiting pptx text extraction)", () => {
    const notImpl = QUICK_TOOLS.filter((t) => !t.implemented);
    expect(notImpl.map((t) => t.slug)).toEqual(["ppt-translator"]);
    expect(QUICK_TOOLS.length).toBe(14); // 12 cũ + xhs-creator + ppt-translator
  });
});

describe("BR-I18N English default; Vietnamese removed by request", () => {
  it("locales share the same key set (via t(), no missing keys)", () => {
    // t() falls back to en — indirectly checked: representative keys resolve in every locale
    for (const key of ["nav.home", "home.hero", "editor.export", "toolbox.quickTools"] as const) {
      for (const l of LOCALES) expect(typeof t(l, key)).toBe("string");
    }
    expect(t("en", "home.generate")).toBe("Generate");
    expect(t("zh", "home.generate")).toBe("生成");
  });
  it("detectLocale: every locale by prefix", () => {
    expect(detectLocale("vi-VN")).toBe("en");
    expect(LOCALES).not.toContain("vi");
    expect(LOCALES[0]).toBe("en");
    expect(detectLocale("zh-CN")).toBe("zh");
    expect(detectLocale("ja-JP")).toBe("ja");
    expect(detectLocale("ko-KR")).toBe("ko");
    expect(detectLocale("tr-TR")).toBe("tr");
    expect(detectLocale("pl-PL")).toBe("pl");
    expect(detectLocale("xx-XX")).toBe("en");
    expect(detectLocale(null)).toBe("en");
  });
it("every locale translates the full key set (structural test)", () => {
    for (const l of LOCALES) {
      expect(translatedKeyCount(l), l).toBe(22);
    }
    expect(t("ja", "editor.untitled")).toBe("無題のプロジェクト");
    expect(t("tr", "home.generate")).toBe("Oluştur");
  });
});

describe("BR-SKL skills registry stays in sync with packages/skills", () => {
  const skillsDir = new URL("../../../packages/skills/skills", import.meta.url).pathname;
  it("every registry entry maps to a skill directory with SKILL.md", () => {
    for (const s of SKILLS) {
      expect(existsSync(path.join(skillsDir, s.slug, "SKILL.md")), s.slug).toBe(true);
    }
  });
  it("every oia-* directory has a registry entry (no drift either way)", () => {
    const dirs = readdirSync(skillsDir).filter((d) => d.startsWith("oia-"));
    expect(dirs.sort()).toEqual(SKILLS.map((s) => s.slug).sort());
  });
  it("SKILL.md frontmatter name matches the slug", () => {
    for (const s of SKILLS) {
      const md = readFileSync(path.join(skillsDir, s.slug, "SKILL.md"), "utf8");
      expect(md).toContain(`name: ${s.slug}`);
    }
  });
});
