import type { FabricObject, SceneCanvas, ObjectOrigin } from "@oia/schema";

/**
 * TP.10 (Slice 5) — the non-destruction rule.
 *
 * Provenance: scene objects carry `origin: "user" | "agent" | "generated"`.
 * Legacy objects WITHOUT `origin` default to "user" — the conservative choice that
 * keeps this rule protecting old projects. The survival rule is enforced on
 * `origin === "user"`: agent refinement NEVER deletes or replaces user-added layers
 * (uploads, product photos, hand-placed text).
 *
 * A1 preview-apply (docs/designs/variant-preview-apply.md): the editor dock no
 * longer merges a refined scene onto the page. Non-destruction now means the apply
 * step touches EXACTLY ONE property of ONE user-designated object — its `src`.
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

/** VA-5 — the artwork image a generated variant would swap in: candidates are
 * non-clip, non-user objects carrying a `src`. Largest displayed area wins
 * (deterministic; right for collages too). Null when the variant has no image.
 * `aspect` (display width/height) lets the apply step warn when the swap would
 * stretch into a differently-proportioned layer. */
export function variantArtworkObject(scene: SceneCanvas): { src: string; aspect: number } | null {
  const extent = (o: FabricObject, axis: "x" | "y") => {
    const base = axis === "x" ? o.width : o.height;
    const scale = axis === "x" ? o.scaleX : o.scaleY;
    return (typeof base === "number" ? base : 0) * (typeof scale === "number" ? Math.abs(scale) : 1);
  };
  const area = (o: FabricObject) => extent(o, "x") * extent(o, "y");
  const candidates = (scene.objects ?? []).filter(
    (o) => o.name !== CLIP_NAME && objectOrigin(o) !== "user" && typeof o.src === "string" && o.src.length > 0,
  );
  if (!candidates.length) return null;
  const best = candidates.reduce((a, b) => (area(b) > area(a) ? b : a));
  const w = extent(best, "x");
  const h = extent(best, "y");
  return { src: best.src as string, aspect: h > 0 ? w / h : 0 };
}

/** VA-4 — copy-on-write `src` swap for ONE object (by index): geometry, every other
 * object, and the scene envelope stay untouched. Throws on a bad index so a stale
 * index can never corrupt the page silently. */
export function replaceObjectSrc(scene: SceneCanvas, index: number, src: string): SceneCanvas {
  const objects = scene.objects ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= objects.length) {
    throw new RangeError(`replaceObjectSrc: index ${index} out of range (0..${objects.length - 1})`);
  }
  const target = objects[index];
  if (typeof target.src !== "string") {
    throw new TypeError("replaceObjectSrc: target object has no src (not an image layer)");
  }
  return { ...scene, objects: objects.map((o, i) => (i === index ? { ...o, src } : o)) };
}
