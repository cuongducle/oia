import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProjectStore } from "@oia/tasks";
import { seedSampleProjects } from "../src/utility/seedSamples.js";
import { STUDIO_TEMPLATES } from "../src/shared/studio-templates.js";

/**
 * Reorg step 5 — first-run sample seeding. The behaviors that must hold:
 * seed once per dataDir, only into an EMPTY store, stable ids, sample flag
 * survives a reopen (schema keeps it), deleting samples is permanent.
 */

function makeStore(): { dataDir: string; store: ProjectStore } {
  const dataDir = mkdtempSync(path.join(tmpdir(), "oia-seed-"));
  const store = new ProjectStore(dataDir);
  return { dataDir, store };
}

async function boot(dataDir: string): Promise<ProjectStore> {
  const store = new ProjectStore(dataDir);
  await store.load();
  return store;
}

describe("seedSampleProjects — the happy lane", () => {
  it("an empty first run gets every curated sample, in curated order, flagged Sample", async () => {
    const { dataDir, store } = makeStore();
    await store.load();
    const seeded = await seedSampleProjects({ dataDir, projects: store });
    expect(seeded).toBe(STUDIO_TEMPLATES.length);
    const names = store.recent().map((p) => p.name);
    expect(names).toEqual(STUDIO_TEMPLATES.map((t) => `Sample · ${t.name}`)); // curated order
    for (const p of store.recent()) {
      expect(p.sample).toBe(true);
      expect(p.id.startsWith("prj_sample_studio-")).toBe(true);
      expect(p.pages[0].canvas.objects.some((o) => o.name === "clip")).toBe(true);
    }
    expect(existsSync(path.join(dataDir, "samples-seeded.json"))).toBe(true);
  });

  it("the sample flag survives a full reopen (persist → load → parse keeps it)", async () => {
    const { dataDir, store } = makeStore();
    await store.load();
    await seedSampleProjects({ dataDir, projects: store });
    const reopened = await boot(dataDir); // fresh store, disk only
    expect(reopened.recent()).toHaveLength(STUDIO_TEMPLATES.length);
    for (const p of reopened.recent()) expect(p.sample).toBe(true);
    const onDisk = JSON.parse(readFileSync(path.join(dataDir, "projects", "prj_sample_studio-matcha.json"), "utf8"));
    expect(onDisk.sample).toBe(true);
  });
});

describe("seedSampleProjects — the guard lanes", () => {
  it("boot 2 never reseeds (marker file) — even after the user deletes every sample", async () => {
    const { dataDir, store } = makeStore();
    await store.load();
    await seedSampleProjects({ dataDir, projects: store });
    for (const p of store.recent()) await store.remove(p.id); // the user deletes them all
    const second = await boot(dataDir);
    expect(await seedSampleProjects({ dataDir, projects: second })).toBe(0);
    expect(second.recent()).toHaveLength(0); // deletion is permanent — samples do not haunt
  });

  it("a store that already has REAL work is left alone (marker still written)", async () => {
    const { dataDir, store } = makeStore();
    await store.load();
    await store.create({ name: "my real banner" });
    expect(await seedSampleProjects({ dataDir, projects: store })).toBe(0);
    expect(store.recent().map((p) => p.name)).toEqual(["my real banner"]);
    expect(existsSync(path.join(dataDir, "samples-seeded.json"))).toBe(true); // never retried later
  });

  it("stable ids complete a seed interrupted mid-way (crash before the marker) — no duplicates", async () => {
    const { dataDir, store } = makeStore();
    await store.load();
    // simulate a crash AFTER the first sample landed but BEFORE the marker was written
    await store.addImported({
      id: `prj_sample_${STUDIO_TEMPLATES[0].id}`,
      name: "Sample · pre-existing",
      sample: true,
      pages: [{ id: "page_1", width: 900, height: 1200, canvas: STUDIO_TEMPLATES[0].scene }],
    });
    const seeded = await seedSampleProjects({ dataDir, projects: store });
    expect(seeded).toBe(STUDIO_TEMPLATES.length - 1); // only the missing ones landed
    expect(store.recent()).toHaveLength(STUDIO_TEMPLATES.length); // complete set, no duplicate
    expect(store.recent().filter((p) => p.id === `prj_sample_${STUDIO_TEMPLATES[0].id}`)).toHaveLength(1);
    expect(existsSync(path.join(dataDir, "samples-seeded.json"))).toBe(true); // marker now written
  });
});
