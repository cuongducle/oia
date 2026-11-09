import type { SceneCanvas } from "@oia/schema";

/**
 * A3-lite target resolution, pure part (teardown fix #1): fabric can drop the
 * active object between the user's layer click and the send (observed live in
 * the v3 experiment, the edit silently fell into the no-selection branch and
 * shipped the whole canvas as references). The LAST image selection survives
 * in a ref; resolution prefers the live selection, falls back to the layer the
 * user last picked by NAME. A fallback that no longer exists on the canvas is
 * ignored, a stale name must never fabricate a target.
 */

export interface TargetLayerLike {
  src?: string;
  name?: string;
}

export function resolveEditTarget(active: TargetLayerLike | null | undefined, objects: TargetLayerLike[], lastName: string | null): { src: string; name: string } | null {
  if (active && typeof active.src === "string") return { src: active.src, name: active.name ?? "selected image" };
  if (!lastName) return null;
  const byName = objects.find((o) => o.name === lastName && typeof o.src === "string");
  return byName ? { src: byName.src!, name: byName.name! } : null;
}
