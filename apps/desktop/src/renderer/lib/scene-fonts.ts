import { fontSourceSchema, type SceneCanvas, type LensSuggestion } from "@oia/schema";
import { toDisplayUrl } from "../../shared/assets.js";

const loaded = new Map<string, Promise<void>>();
export async function loadLensFont(family: string, source: LensSuggestion["source"]) {
  if (!/^[\p{L}\p{N} ._'\-]+$/u.test(family)) throw new Error("Invalid font family");
  const key = JSON.stringify([family, source]);
  let task = loaded.get(key);
  if (!task) {
    task = (async () => {
      const face = new FontFace(family, `url("${toDisplayUrl(source.url)}")`, { weight: source.variable ? "100 900" : String(source.weight), style: source.style });
      await face.load(); document.fonts.add(face);
    })().catch((error) => { loaded.delete(key); throw error; });
    loaded.set(key, task);
  }
  return task;
}

/** Font bytes and their license remain reachable through serialized objects, including exports. */
export async function loadSceneFonts(scene: SceneCanvas) {
  for (const o of scene.objects) {
    const parsed = fontSourceSchema.safeParse(o.fontSource);
    if (parsed.success && typeof o.fontFamily === "string") await loadLensFont(o.fontFamily, parsed.data);
  }
}
