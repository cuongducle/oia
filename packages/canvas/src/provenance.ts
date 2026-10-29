import type { FabricObject, SceneCanvas, ObjectOrigin } from "@oia/schema";

/**
 * TP.10 (Slice 5) — the non-destruction rule.
 *
 * Provenance: scene objects carry `origin: "user" | "agent" | "generated"`.
 * Legacy objects WITHOUT `origin` default to "user" — the conservative choice that
 * keeps this rule protecting old projects. The survival rule is enforced on
 * `origin === "user"`: agent refinement NEVER deletes or replaces user-added layers
 * (uploads, product photos, hand-placed text) — they ride on top of the refined scene.
 * Page-replacing regeneration requires an explicit confirmation naming what is lost
 * (the confirmRequest round-trip in the schema); the default path preserves.
 */

export const CLIP_NAME = "clip";

/** Stamp a user-created object (editor add/insert paths call this). Accepts any object shape (fabric instances included). */
export function stampUser<T extends object>(obj: T): T {
  (obj as Record<string, unknown>).origin = "user";
  return obj;
}

export function objectOrigin(obj: FabricObject): ObjectOrigin {
  return obj.origin ?? "user"; // legacy default — conservative
}

/**
 * Merge a refined (incoming) scene onto the current one: the incoming page replaces
 * the canvas, but every user-added object from the current page survives on top,
 * position intact. Returns the merged scene + what was preserved (for logging/tests).
 */
export function mergeScenePreservingUserObjects(
  current: SceneCanvas,
  incoming: SceneCanvas,
): { scene: SceneCanvas; preserved: FabricObject[]; lostUserObjects: FabricObject[] } {
  const userObjects = (current.objects ?? []).filter(
    (o) => o.name !== CLIP_NAME && objectOrigin(o) === "user",
  );
  // incoming generated/agent objects as the new base (their clip + artwork + blocks)
  const base = (incoming.objects ?? []).filter((o) => o.name !== CLIP_NAME);
  const clip = (incoming.objects ?? []).find((o) => o.name === CLIP_NAME) ?? (current.objects ?? []).find((o) => o.name === CLIP_NAME);
  const scene: SceneCanvas = {
    ...incoming,
    objects: [...(clip ? [clip] : []), ...base, ...userObjects],
  };
  return { scene, preserved: userObjects, lostUserObjects: [] }; // non-destruction: nothing user-owned is lost
}
