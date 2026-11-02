import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcHtml = readFileSync(path.resolve(here, "../src/renderer/index.html"), "utf8");

function cspOf(html: string): string {
  return html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? "";
}

/** Step 7 CSP pin (revised by D15 — OCR tool + tesseract removed): the renderer
 *  must stay FULLY OFFLINE. What still claims an extra token: pdf.js loads its
 *  worker from a bundled 'self' asset and instantiates wasm decoders
 *  (openjpeg.wasm / jbig2.wasm ship in pdfjs-dist 6) — hence 'wasm-unsafe-eval';
 *  tool previews are blob:/data: images. The jsdelivr allowance existed only
 *  for tesseract.js; it left with the OCR tool (D15). Pin the SOURCE, and when
 *  a build exists require the BUILT page to carry the identical policy —
 *  pinning only src/ would stay green if the bundler ever dropped the meta. */
describe("renderer CSP pin", () => {
  const csp = cspOf(srcHtml);

  it("declares the directives the tools lane needs", () => {
    expect(csp).toMatch(/worker-src[^;]*'self'/);
    expect(csp).not.toMatch(/worker-src[^;]*blob:/); // tesseract's blob worker is gone (D15)
    expect(csp).toMatch(/script-src[^;]*'wasm-unsafe-eval'/); // pdf.js openjpeg/jbig2 wasm
    expect(csp).toMatch(/img-src[^;]*oia:[^;]*blob:/);
  });
  it("stays fully offline — no wildcards, no network origins", () => {
    expect(csp).not.toMatch(/\*/);
    const origins = [...new Set([...csp.matchAll(/https?:\/\/[^;"'\s]+/g)].map((m) => m[0]))];
    expect(origins).toEqual([]); // jsdelivr existed only for the OCR tool (D15 removed it)
  });
  it("the BUILT page carries the identical policy (when a build is present)", () => {
    const built = path.resolve(here, "../../out/renderer/index.html");
    if (!existsSync(built)) return; // CI always builds before this test; standalone typecheck runs skip
    expect(cspOf(readFileSync(built, "utf8"))).toBe(csp);
  });
});
