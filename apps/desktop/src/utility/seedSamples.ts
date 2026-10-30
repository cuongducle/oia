import { existsSync } from "node:fs";
import path from "node:path";
import { OIA_SCHEMA_VERSION, type Project, type Template } from "@oia/schema";
import { atomicWriteJson, type ProjectStore } from "@oia/tasks";
import { STUDIO_TEMPLATES } from "../shared/studio-templates.js";

/**
 * Reorg step 5 — first run: the curated studio designs arrive as EDITABLE
 * "Sample" projects, so a brand-new install opens on a Workspace that already
 * shows real designs instead of a bare grid.
 *
 * Rules:
 * - The marker file is written only AFTER a completed pass (seed → marker), so
 *   a crash mid-seed just retries on the next boot — stable ids make that
 *   completion idempotent. The owner deleting the samples is a DECISION: once
 *   the marker exists they never come back.
 * - Seeds only when the store holds no REAL work (a leftover sample from a
 *   crashed seed doesn't count): a user who imported data or already created
 *   a project gets no noise on top of it.
 * - Stable ids (`prj_sample_<template id>`) make the seed itself idempotent;
 *   addImported refuses any id that already exists.
 * - Sample projects are ordinary projects afterwards: edit, rename, delete —
 *   the `sample` flag only drives the Workspace badge (schema: additive,
 *   optional; old builds simply strip it).
 */
export async function seedSampleProjects(opts: {
  dataDir: string;
  projects: ProjectStore;
  templates?: readonly Template[];
}): Promise<number> {
  const marker = path.join(opts.dataDir, "samples-seeded.json");
  if (existsSync(marker)) return 0;
  if (opts.projects.recent().some((p) => !p.sample)) {
    await atomicWriteJson(marker, { seededAt: Date.now() }); // has real work — never seed, never retry
    return 0;
  }

  const templates = opts.templates ?? STUDIO_TEMPLATES;
  const now = Date.now();
  let seeded = 0;
  for (let i = 0; i < templates.length; i++) {
    const tpl = templates[i];
    const clip = tpl.scene.objects.find((o) => o.name === "clip");
    const project: Project = {
      id: `prj_sample_${tpl.id}`,
      name: `Sample · ${tpl.name}`,
      sample: true,
      schemaVersion: OIA_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now - i * 1000, // curated order: the first template lists first
      pages: [
        {
          id: "page_1",
          name: "Board 1",
          width: typeof clip?.width === "number" ? clip.width : 900,
          height: typeof clip?.height === "number" ? clip.height : 1200,
          canvas: tpl.scene, // canonical /studio/… srcs — the exact shape applyTemplate persists
        },
      ],
    };
    if (await opts.projects.addImported(project)) seeded++;
  }
  await atomicWriteJson(marker, { seededAt: Date.now() }); // completed — never seed again
  return seeded;
}
