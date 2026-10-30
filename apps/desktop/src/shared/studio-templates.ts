/**
 * Reorg step 5 — the curated sample designs. Data only (no renderer imports):
 * shared by the Home gallery, the editor Templates panel, and the UTILITY
 * process, which seeds them as editable "Sample" projects on first run.
 * Artwork ships as renderer public assets (public/studio/*.webp); scenes
 * reference them canonically as /studio/<artwork>.webp (mapAssetUrls maps the
 * form for display, exactly like editor-applied templates).
 */
import type { FabricObject, Template } from "@oia/schema";

const W = 900, H = 1200;
function text(value: string, x: number, y: number, width: number, size: number, color: string, extra: Record<string, unknown> = {}): FabricObject {
  return { type: "Textbox", text: value, left: x, top: y, width, fontSize: size, fill: color, fontFamily: "Be Vietnam Pro", lineHeight: 0.98, fontWeight: 500, ...extra };
}
function template(id: string, name: string, color: string, artwork: string, objects: FabricObject[]): Template {
  return { id: `studio-${id}`, name, authorName: "Oia Studio", featured: true, tipCredits: 0, createdAt: 0,
    scene: { version: "6.9.1", objects: [
      { type: "Rect", name: "clip", width: W, height: H, left: 0, top: 0, fill: color, selectable: false },
      { type: "Image", name: "artwork", src: `/studio/${artwork}.webp`, left: 0, top: 0, width: W, height: H, crossOrigin: "anonymous" },
      ...objects,
    ] } };
}
export const STUDIO_TEMPLATES: Template[] = [
  template("matcha", "Matcha every day · Poster", "#23402c", "matcha", [
    text("GOOD TEA\nBRIGHTER DAYS", 54, 52, 500, 23, "#f6f1d7", { charSpacing: 80 }),
    text("MATCHA\nEVERY\nDAY.", 42, 250, 800, 146, "#f6f1d7", { fontWeight: 800, lineHeight: 0.9, charSpacing: -60 }),
    text("A SMALL CUP.\nA BRIGHTER YOU.", 54, 1070, 540, 22, "#f6f1d7", { charSpacing: 25 }),
  ]),
  template("festival", "City rhythms · Poster", "#1246ed", "festival", [
    text("RIVERDALE\nMUSIC FESTIVAL", 52, 52, 520, 27, "#fffbeb", { fontWeight: 700 }),
    text("09—11\nAUGUST", 660, 52, 190, 25, "#fffbeb", { textAlign: "right" }),
    text("CITY\nSOUND\nFEST.", 42, 235, 810, 143, "#fffbeb", { fontWeight: 800, lineHeight: 0.9, charSpacing: -55 }),
    text("MUSIC\nPEOPLE\nCULTURE", 54, 1030, 400, 26, "#fffbeb", { fontWeight: 600 }),
  ]),
  template("botanical", "A touch of nature", "#a74f2d", "botanical", [
    text("Lumea", 54, 52, 600, 51, "#fff4e4", { fontFamily: "Georgia", fontStyle: "italic" }),
    text("SKINCARE\nFOR A KINDER YOU", 540, 60, 305, 21, "#fff4e4", { textAlign: "right" }),
    text("A touch\nof nature", 54, 205, 770, 105, "#fff4e4", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("KINDER TO YOUR SKIN.\nCLOSER TO NATURE.\nSIMPLY ESSENTIAL.", 56, 552, 530, 24, "#fff4e4", { lineHeight: 1.25 }),
  ]),
  template("perspective", "A clearer perspective · Presentation", "#e9e5f6", "perspective", [
    text("VISTRA", 54, 54, 420, 34, "#242739"),
    text("Business\nPresentation", 590, 55, 260, 23, "#45465a", { textAlign: "right" }),
    { type: "Rect", left: 54, top: 155, width: 792, height: 2, fill: "#9693a8" },
    text("A clearer\nperspective", 54, 270, 790, 101, "#202133", { fontWeight: 600, charSpacing: -60, lineHeight: 1.02 }),
    text("Insights\ntoday.\nBetter\ntomorrows.", 56, 650, 430, 31, "#45465a", { lineHeight: 1.15 }),
    text("2026   ———", 56, 1090, 450, 26, "#45465a"),
  ]),
];
