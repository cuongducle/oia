import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { LOCALES, detectLocale, t } from "../libs/i18n";

const root = path.resolve(import.meta.dirname, "..");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith(".tsx") ? [path.join(dir,e.name)] : []);
}
// Ignore comments and user data; inspect shipped UI copy (including placeholders and accessible names).
const vietnamese = /[ăâđêôơưĂÂĐÊÔƠƯ\u1ea0-\u1ef9]/;
describe("English-only application interface", () => {
  it("uses English document language and does not offer Vietnamese", () => {
    expect(readFileSync(path.join(root,"app/layout.tsx"),"utf8")).toContain('lang="en"');
    expect(LOCALES[0]).toBe("en");
    expect(LOCALES).not.toContain("vi");
    expect(detectLocale("vi-VN")).toBe("en");
    expect(t("en","home.generate")).toBe("Generate");
  });
  it("has no Vietnamese text in rendered UI strings across every screen", () => {
    const issues: string[] = [];
    for (const file of [...files(path.join(root,"app")), ...files(path.join(root,"components")), ...["libs/skills-registry.ts","libs/tools-registry.ts","libs/studio-templates.ts"].map(f=>path.join(root,f))]) {
      const source = ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if ((ts.isStringLiteral(node) || ts.isJsxText(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && vietnamese.test(node.text)) {
          issues.push(`${path.relative(root,file)}: ${node.text.slice(0,90)}`);
        }
        ts.forEachChild(node,visit);
      };
      visit(source);
    }
    // Stage 0 (2026-10-29, docs/designs/banner-maker-loop-stage-0.md) ships Vietnamese-first SELLER
    // strings (mode toggle, mock banner, stop, errorClass map) — they live ONLY in i18n keys
    // (libs/i18n.ts is not scanned by this test); the studio chrome itself stays English.
    expect(issues).toEqual([]);
  });
});
