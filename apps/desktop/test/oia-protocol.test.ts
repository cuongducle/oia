import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { oiaFilesKey } from "../src/main/oiaProtocol.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Reorg step 7 security gate, URL half — oia://files must yield only clean keys.
 *  The sink half (containment + symlink escape) lives in packages/tasks storage tests. */
describe("oiaFilesKey (oia://files URL parsing)", () => {
  it("parses a normal asset URL", () => {
    expect(oiaFilesKey("oia://files/uploads/20261029/abc123.png")).toBe("uploads/20261029/abc123.png");
  });
  it("rejects any other host on the scheme", () => {
    expect(oiaFilesKey("oia://evil/uploads/x.png")).toBeNull();
    expect(oiaFilesKey("https://files/uploads/x.png")).toBeNull();
    expect(oiaFilesKey("not a url")).toBeNull();
  });
  it("decodes percent-encoding — the traversal arrives DECODED at the store (which must reject it)", () => {
    expect(oiaFilesKey("oia://files/%2e%2e%2fsecret.png")).toBe("../secret.png");
    expect(oiaFilesKey("oia://files/uploads%2F..%2F..%2Fx")).toBe("uploads/../../x");
  });
  it("rejects malformed percent-encoding instead of guessing", () => {
    expect(oiaFilesKey("oia://files/%E0%A4%A")).toBeNull();
  });
  it("empty path is not a key", () => {
    expect(oiaFilesKey("oia://files/")).toBeNull();
    expect(oiaFilesKey("oia://files")).toBeNull();
  });
});

/** Step 7 CSP pin — the renderer policy is load-bearing for the OCR tool:
 *  tesseract.js spawns a blob: worker, importScripts's its script and fetches
 *  core+lang data from cdn.jsdelivr.net, and the tool previews via blob: images.
 *  A regression here breaks OCR silently (friendly error, no console in prod). */
describe("renderer CSP pin", () => {
  const html = readFileSync(path.resolve(here, "../src/renderer/index.html"), "utf8");
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? "";

  it("declares the directives the tools lane needs", () => {
    expect(csp).toMatch(/worker-src[^;]*blob:/);
    expect(csp).toMatch(/script-src[^;]*cdn\.jsdelivr\.net/);
    expect(csp).toMatch(/connect-src[^;]*cdn\.jsdelivr\.net/);
    expect(csp).toMatch(/img-src[^;]*oia:[^;]*blob:/);
  });
  it("stays closed by default — no wildcards, jsdelivr is the ONLY network origin", () => {
    expect(csp).not.toMatch(/\*/);
    const origins = [...new Set([...csp.matchAll(/https:\/\/[^;"'\s]+/g)].map((m) => m[0]))];
    expect(origins).toEqual(["https://cdn.jsdelivr.net"]);
  });
});
