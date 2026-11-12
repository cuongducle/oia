import { TEMPLATE_CATEGORIES, type Template, type TemplateCategoryId } from "@oia/schema";

export function fitArtboard(width: number, height: number, availableWidth: number, availableHeight: number): number {
  const w = Math.max(1, width), h = Math.max(1, height);
  return Math.max(0.01, Math.min(1, Math.max(1, availableWidth - 64) / w, Math.max(1, availableHeight - 160) / h));
}
export function sceneSize(scene: { objects: { type?: string | null; name?: string | null; width?: number | null; height?: number | null }[] }): { width: number; height: number } {
  const clip = scene.objects.find(o => o.name === "clip") ?? scene.objects.find(o => o.type?.toLowerCase() === "rect");
  const w = clip?.width, h = clip?.height;
  return { width: typeof w === "number" && Number.isFinite(w) && w > 0 ? w : 1360, height: typeof h === "number" && Number.isFinite(h) && h > 0 ? h : 2048 };
}
export type StudioCategory = "all" | TemplateCategoryId | "other";
export const STUDIO_CATEGORIES: readonly { id: StudioCategory; label: string }[] = [
  { id: "all", label: "All" }, ...TEMPLATE_CATEGORIES, { id: "other", label: "Uncategorized" },
];
/** Legacy library entries can lack taxonomy; explicit valid categories always win. */
export function templateCategory(name: string, category?: string): StudioCategory {
  const known = TEMPLATE_CATEGORIES.find((c) => c.id === category);
  if (known) return known.id;
  if (/presentation|review|deck|slide/i.test(name)) return "deck";
  if (/livestream|live cover/i.test(name)) return "livestream";
  if (/overlay|lower.third/i.test(name)) return "overlay";
  if (/flash.?sale|clearance/i.test(name)) return "flash-sale";
  if (/new product|product drop|launch/i.test(name)) return "new-product";
  if (/menu|brunch/i.test(name)) return "menu";
  if (/instagram|social|carousel/i.test(name)) return "social-post";
  if (/poster|matcha|festival/i.test(name)) return "poster";
  return "other";
}
export function filterTemplates<T extends Pick<Template, "name" | "category">>(templates: readonly T[], category: StudioCategory): T[] {
  return category === "all" ? [...templates] : templates.filter(t => templateCategory(t.name, t.category) === category);
}
export function imageSource(src: unknown): string | null {
  return typeof src === "string" && /^(https?:\/\/|data:image\/|\/(?!\/))/.test(src) ? src : null;
}
