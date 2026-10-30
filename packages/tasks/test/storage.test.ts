import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { LocalFileStore } from "../src/storage.js";

let dir: string; let store: LocalFileStore;
beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), "pf-store-")); store = new LocalFileStore(dir); });

describe("BR-UP storage", () => {
  it("put → a /api/files/uploads/... url; bytes read back intact", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const r = await store.put(bytes, "png");
    expect(r.url).toMatch(/^\/api\/files\/uploads\/\d{8}\/[0-9a-f]{32}-[a-z0-9]+\.(png)$/); // FULL md5 in the name (F3)
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

/**
 * F3 regression — dedupe keyed on an 8-char md5 prefix (32 bits) returned the
 * WRONG image silently: two different uploads sharing the prefix got one URL.
 * The failure needs a REAL prefix collision to be honest, so we birthday-search
 * one (~2^16 small hashes, sub-second) instead of mocking hashes.
 */
describe("F3 dedupe — prefix collisions can never alias two different files", () => {
  /** Two distinct buffers whose md5 share the first 8 hex chars. */
  function findPrefixCollision(): [Uint8Array, Uint8Array] {
    const seen = new Map<string, Uint8Array>();
    for (let i = 0; i < 5_000_000; i++) {
      const buf = new Uint8Array(Buffer.from(`oia-f3-collision-probe-${i}`, "utf8"));
      const hex = createHash("md5").update(buf).digest("hex");
      const prefix = hex.slice(0, 8);
      const prev = seen.get(prefix);
      if (prev) return [prev, buf];
      seen.set(prefix, buf);
    }
    throw new Error("no prefix collision found in 5M probes (statistically impossible)");
  }

  it("different contents sharing the 8-char prefix get DISTINCT urls and read back their own bytes", async () => {
    const [a, b] = findPrefixCollision();
    const dir2 = mkdtempSync(path.join(tmpdir(), "pf-store-f3-"));
    const s = new LocalFileStore(dir2);
    const ra = await s.put(a, "png");
    const rb = await s.put(b, "png");
    expect(ra.url).not.toBe(rb.url); // OLD code: rb.url === ra.url — the wrong image, no error
    expect(await s.read(ra.key)).toEqual(a);
    expect(await s.read(rb.key)).toEqual(b);
  });

  it("dedupe still works after a RESTART: full md5 is recovered from the filename", async () => {
    const dir2 = mkdtempSync(path.join(tmpdir(), "pf-store-f3h-"));
    const first = new LocalFileStore(dir2);
    const r = await first.put(new Uint8Array([3, 1, 4, 1, 5]), "png");
    const reborn = new LocalFileStore(dir2); // fresh process, index empty
    await reborn.hydrate();
    const again = await reborn.put(new Uint8Array([3, 1, 4, 1, 5]), "png");
    expect(again.url).toBe(r.url); // hydrate from the FULL-md5 name — deterministic
  });

  it("LEGACY 8-char-prefix file: same bytes → dedupes (verified by hash); prefix collision → new file", async () => {
    const dir2 = mkdtempSync(path.join(tmpdir(), "pf-store-f3l-"));
    const legacyBytes = new Uint8Array([9, 9, 9, 9]);
    const legacyMd5 = createHash("md5").update(legacyBytes).digest("hex");
    // hand-write a pre-F3 style filename: 8-char prefix + timestamp suffix
    const day = dayStamp();
    mkdirSync(path.join(dir2, "uploads", day), { recursive: true });
    const legacyKey = `uploads/${day}/${legacyMd5.slice(0, 8)}-legacy00.png`;
    writeFileSync(path.join(dir2, legacyKey), legacyBytes);

    const s = new LocalFileStore(dir2);
    await s.hydrate();
    const same = await s.put(legacyBytes, "png");
    expect(same.key).toBe(legacyKey); // hinted by prefix, ADMITTED because the bytes hash equal

    const [x, y] = findPrefixCollision();
    writeFileSync(path.join(dir2, `uploads/${day}/${createHash("md5").update(x).digest("hex").slice(0, 8)}-legacy01.png`), x);
    const s2 = new LocalFileStore(dir2);
    await s2.hydrate();
    const ry = await s2.put(y, "png"); // shares the prefix with x's legacy name
    expect(await s2.read(ry.key)).toEqual(y); // verified-not-equal → its own file, never x's
  });
});

function dayStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}
