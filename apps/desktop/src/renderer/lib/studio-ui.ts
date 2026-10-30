import type { Template } from "@oia/schema";

export function fitArtboard(width: number, height: number, availableWidth: number, availableHeight: number): number {
  const w = Math.max(1, width), h = Math.max(1, height);
  return Math.max(0.01, Math.min(1, Math.max(1, availableWidth - 64) / w, Math.max(1, availableHeight - 160) / h));
}
export function sceneSize(scene: { objects: { type?: string | null; name?: string | null; width?: number | null; height?: number | null }[] }): { width: number; height: number } {
  const clip = scene.objects.find(o => o.name === "clip") ?? scene.objects.find(o => o.type?.toLowerCase() === "rect");
  const w = clip?.width, h = clip?.height;
  return { width: typeof w === "number" && Number.isFinite(w) && w > 0 ? w : 1360, height: typeof h === "number" && Number.isFinite(h) && h > 0 ? h : 2048 };
}
export type StudioCategory = "all" | "poster" | "social" | "presentation" | "other";
export function templateCategory(name: string): StudioCategory {
  if (/presentation|review|deck|slide/i.test(name)) return "presentation";
  if (/instagram|social|carousel/i.test(name)) return "social";
  if (/poster|matcha|festival|menu/i.test(name)) return "poster";
  return "other";
}
export function filterTemplates<T extends Pick<Template, "name">>(templates: readonly T[], category: StudioCategory): T[] {
  return category === "all" ? [...templates] : templates.filter(t => templateCategory(t.name) === category);
}
export function imageSource(src: unknown): string | null {
  return typeof src === "string" && /^(https?:\/\/|data:image\/|\/(?!\/))/.test(src) ? src : null;
}
