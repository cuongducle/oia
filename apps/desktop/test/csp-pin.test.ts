import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcHtml = readFileSync(path.resolve(here, "../src/renderer/index.html"), "utf8");

function cspOf(html: string): string {
  return html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? "";
}

/** Step 7 CSP pin — the renderer policy is load-bearing for the tools lane:
 *  tesseract.js spawns a blob: worker, importScripts's its script, instantiates
 *  a wasm core and fetches core+lang data from cdn.jsdelivr.net, and the tool
 *  previews via blob: images. A regression here breaks OCR silently (friendly
 *  error, no console in prod). Pin the SOURCE, and when a build exists require
 *  the BUILT page to carry the identical policy — pinning only src/ would stay
 *  green if the bundler ever dropped the meta. */
describe("renderer CSP pin", () => {
  const csp = cspOf(srcHtml);

  it("declares the directives the tools lane needs", () => {
    expect(csp).toMatch(/worker-src[^;]*blob:/);
    expect(csp).toMatch(/script-src[^;]*'wasm-unsafe-eval'/);
    expect(csp).toMatch(/script-src[^;]*cdn\.jsdelivr\.net/);
    expect(csp).toMatch(/connect-src[^;]*cdn\.jsdelivr\.net/);
    expect(csp).toMatch(/img-src[^;]*oia:[^;]*blob:/);
  });
  it("stays closed by default — no wildcards, jsdelivr is the ONLY network origin", () => {
    expect(csp).not.toMatch(/\*/);
    const origins = [...new Set([...csp.matchAll(/https:\/\/[^;"'\s]+/g)].map((m) => m[0]))];
    expect(origins).toEqual(["https://cdn.jsdelivr.net"]);
  });
  it("the BUILT page carries the identical policy (when a build is present)", () => {
    const built = path.resolve(here, "../../out/renderer/index.html");
    if (!existsSync(built)) return; // CI always builds before this test; standalone typecheck runs skip
    expect(cspOf(readFileSync(built, "utf8"))).toBe(csp);
  });
});
