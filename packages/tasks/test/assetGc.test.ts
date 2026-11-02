import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalFileStore, collectAssetRefs, sweepUnreferencedAssets, ASSET_GC_GRACE_MS } from "../src/index.js";

/** T11 — deleting a project used to leave its images on disk forever. */

const DAY = 24 * 60 * 60 * 1000;

async function store(): Promise<{ files: LocalFileStore; root: string }> {
  const root = mkdtempSync(path.join(tmpdir(), "oia-gc-"));
  const files = new LocalFileStore(root);
  await files.hydrate();
  return { files, root };
}

/** Age a stored file by rewriting its mtime. */
function age(root: string, key: string, ms: number): void {
  const t = new Date(Date.now() - ms);
  utimesSync(path.join(root, key), t, t);
}

describe("collectAssetRefs — text reachability, whatever prefix carries the key", () => {
  it("finds keys behind /api/files/, oia://files/ and bare, at any depth", () => {
    const refs = collectAssetRefs([
      { pages: [{ canvas: { objects: [{ src: "/api/files/uploads/20261030/aaa-1.png" }] } }] },
      [{ renderData: { thumb: "oia://files/uploads/20261031/bbb-2.webp" } }],
      { logos: ["uploads/20261029/ccc-3.jpg"] },
    ]);
    expect([...refs].sort()).toEqual([
      "uploads/20261029/ccc-3.jpg",
      "uploads/20261030/aaa-1.png",
      "uploads/20261031/bbb-2.webp",
    ]);
  });
});

describe("sweepUnreferencedAssets", () => {
  it("removes only uploads that are unreferenced AND older than the grace window", async () => {
    const { files, root } = await store();
    const kept = await files.put(new Uint8Array([1]), "png");
    const orphan = await files.put(new Uint8Array([2]), "png");
    const young = await files.put(new Uint8Array([3]), "png");
    age(root, kept.key, 30 * DAY);
    age(root, orphan.key, 30 * DAY);
    age(root, young.key, 1 * DAY);

    const r = await sweepUnreferencedAssets({ files, roots: [{ src: kept.url }] });
    expect(r.removed).toEqual([orphan.key]);
    expect(r).toMatchObject({ scanned: 3, referenced: 1, young: 1 });
    expect(existsSync(path.join(root, kept.key))).toBe(true);
    expect(existsSync(path.join(root, orphan.key))).toBe(false);
    expect(existsSync(path.join(root, young.key))).toBe(true);
  });

  it("a removed file is FORGOTTEN by dedupe — the same bytes uploaded again get a real file", async () => {
    const { files, root } = await store();
    const bytes = new Uint8Array([9, 9, 9]);
    const first = await files.put(bytes, "png");
    age(root, first.key, 30 * DAY);
    await sweepUnreferencedAssets({ files, roots: [] });
    expect(existsSync(path.join(root, first.key))).toBe(false);

    const again = await files.put(bytes, "png");
    // the stale index would have returned first.key — a URL to a deleted file
    expect(existsSync(path.join(root, again.key))).toBe(true);
    expect(await files.read(again.key)).toEqual(bytes);
  });

  it("a dedupe hit on an old orphan restarts its grace window (the editor has not saved yet)", async () => {
    const { files, root } = await store();
    const bytes = new Uint8Array([4, 2]);
    const old = await files.put(bytes, "png");
    age(root, old.key, 30 * DAY);

    const reused = await files.put(bytes, "png"); // same bytes → same key handed out again
    expect(reused.key).toBe(old.key);
    expect(Date.now() - statSync(path.join(root, old.key)).mtimeMs).toBeLessThan(ASSET_GC_GRACE_MS);

    const r = await sweepUnreferencedAssets({ files, roots: [] });
    expect(r.removed).toEqual([]);
    expect(existsSync(path.join(root, old.key))).toBe(true);
  });
});
