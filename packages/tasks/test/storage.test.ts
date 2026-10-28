import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalFileStore } from "../src/storage.js";

let dir: string; let store: LocalFileStore;
beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), "pf-store-")); store = new LocalFileStore(dir); });

describe("BR-UP storage", () => {
  it("put → a /api/files/uploads/... url; bytes read back intact", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const r = await store.put(bytes, "png");
    expect(r.url).toMatch(/^\/api\/files\/uploads\/\d{8}\/[0-9a-f]{8}-[a-z0-9]+\.(png)$/);
    expect(await store.read(r.key)).toEqual(bytes);
  });
  it("dedupe md5: identical content put twice returns the same url", async () => {
    const a = await store.put(new Uint8Array([9, 9]), "png");
    const b = await store.put(new Uint8Array([9, 9]), "png");
    expect(b.url).toBe(a.url);
    expect(b.md5).toBe(a.md5);
  });
  it("findByMd5 returns the stored url", async () => {
    const a = await store.put(new Uint8Array([7]), "jpg");
    expect(await store.findByMd5(a.md5)).toBe(a.url);
  });
  it("read blocks path traversal", async () => {
    await expect(store.read("../../etc/passwd")).rejects.toThrow();
  });
  it("contentType maps correctly", () => {
    expect(store.contentType("png")).toBe("image/png");
    expect(store.contentType("pptx")).toContain("presentationml");
  });
});
