import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServiceContext, collectAssetGarbage } from "../src/index.js";

/** T11 over a REAL ServiceContext: every store that can hold an asset ref is a root. */

const DAY = 24 * 60 * 60 * 1000;

describe("collectAssetGarbage (T11)", () => {
  it("keeps assets any store references; deleting the project frees only its own", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "oia-gc-svc-"));
    const ctx = await createServiceContext({ dataDir, env: {} });
    const filesRoot = path.join(dataDir, "files");

    const inProject = await ctx.files.put(new Uint8Array([1, 1]), "png");
    const inSession = await ctx.files.put(new Uint8Array([2, 2]), "png");
    const shared = await ctx.files.put(new Uint8Array([3, 3]), "png");

    const scene = (src: string) => ({ version: "7.4.0", objects: [{ type: "Image", src }] });
    const project = await ctx.projects.create({ name: "gc", scene: { ...scene(inProject.url), objects: [{ type: "Image", src: inProject.url }, { type: "Image", src: shared.url }] } });
    const s = ctx.chatSessions.create("gc chat");
    await ctx.chatSessions.append(s.id, "make a banner", { content: "done", renderData: { msgMeta: [{ type: "canvas", canvas: scene(inSession.url) }] } });
    await ctx.chatSessions.append(s.id, "again", { content: "done", renderData: { msgMeta: [{ type: "canvas", canvas: scene(shared.url) }] } });

    const later = Date.now() + 30 * DAY; // everything is past the grace window
    expect((await collectAssetGarbage(ctx, { now: later })).removed).toEqual([]);

    await ctx.projects.remove(project.id);
    const r = await collectAssetGarbage(ctx, { now: later });
    expect(r.removed).toEqual([inProject.key]); // shared stays: the session still points at it
    expect(existsSync(path.join(filesRoot, inProject.key))).toBe(false);
    expect(existsSync(path.join(filesRoot, inSession.key))).toBe(true);
    expect(existsSync(path.join(filesRoot, shared.key))).toBe(true);
  });
});
