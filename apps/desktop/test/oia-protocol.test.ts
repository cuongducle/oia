import { describe, expect, it } from "vitest";
import { oiaFilesKey } from "../src/main/oiaProtocol.js";

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
