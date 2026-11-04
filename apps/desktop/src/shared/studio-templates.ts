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
function template(id: string, name: string, color: string, artwork: string, objects: FabricObject[], opts: { category?: string; w?: number; h?: number } = {}): Template {
  const w = opts.w ?? W, h = opts.h ?? H;
  return { id: `studio-${id}`, name, authorName: "Oia Studio", featured: true, tipCredits: 0, createdAt: 0,
    ...(opts.category ? { category: opts.category } : {}),
    scene: { version: "6.9.1", objects: [
      { type: "Rect", name: "clip", width: w, height: h, left: 0, top: 0, fill: color, selectable: false },
      { type: "Image", name: "artwork", src: `/studio/${artwork}.webp`, left: 0, top: 0, width: w, height: h, crossOrigin: "anonymous" },
      ...objects,
    ] } };
}
export const STUDIO_TEMPLATES: Template[] = [
  template("matcha", "Matcha every day · Poster", "#23402c", "matcha", [
    text("GOOD TEA\nBRIGHTER DAYS", 54, 52, 500, 23, "#f6f1d7", { charSpacing: 80 }),
    text("MATCHA\nEVERY\nDAY.", 42, 250, 800, 146, "#f6f1d7", { fontWeight: 800, lineHeight: 0.9, charSpacing: -60 }),
    text("A SMALL CUP.\nA BRIGHTER YOU.", 54, 1070, 540, 22, "#f6f1d7", { charSpacing: 25 }),
  ], { category: "poster" }),
  template("festival", "City rhythms · Poster", "#1246ed", "festival", [
    text("RIVERDALE\nMUSIC FESTIVAL", 52, 52, 520, 27, "#fffbeb", { fontWeight: 700 }),
    text("09—11\nAUGUST", 660, 52, 190, 25, "#fffbeb", { textAlign: "right" }),
    text("CITY\nSOUND\nFEST.", 42, 235, 810, 143, "#fffbeb", { fontWeight: 800, lineHeight: 0.9, charSpacing: -55 }),
    text("MUSIC\nPEOPLE\nCULTURE", 54, 1030, 400, 26, "#fffbeb", { fontWeight: 600 }),
  ], { category: "poster" }),
  template("botanical", "A touch of nature", "#a74f2d", "botanical", [
    text("Lumea", 54, 52, 600, 51, "#fff4e4", { fontFamily: "Georgia", fontStyle: "italic" }),
    text("SKINCARE\nFOR A KINDER YOU", 540, 60, 305, 21, "#fff4e4", { textAlign: "right" }),
    text("A touch\nof nature", 54, 205, 770, 105, "#fff4e4", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("KINDER TO YOUR SKIN.\nCLOSER TO NATURE.\nSIMPLY ESSENTIAL.", 56, 552, 530, 24, "#fff4e4", { lineHeight: 1.25 }),
  ], { category: "social-post" }),
  template("perspective", "A clearer perspective · Presentation", "#e9e5f6", "perspective", [
    text("VISTRA", 54, 54, 420, 34, "#242739"),
    text("Business\nPresentation", 590, 55, 260, 23, "#45465a", { textAlign: "right" }),
    { type: "Rect", left: 54, top: 155, width: 792, height: 2, fill: "#9693a8" },
    text("A clearer\nperspective", 54, 270, 790, 101, "#202133", { fontWeight: 600, charSpacing: -60, lineHeight: 1.02 }),
    text("Insights\ntoday.\nBetter\ntomorrows.", 56, 650, 430, 31, "#45465a", { lineHeight: 1.15 }),
    text("2026   ———", 56, 1090, 450, 26, "#45465a"),
  ], { category: "deck" }),
  // ---- TPL-T3 batch 1 (2026-11-03): real codex clean-plate runs, text authored per
  // the doctrine (real sample copy, never "[Add price]"-style lazy placeholders the
  // planner itself produced — caught at packaging; menu blocks authored by hand
  // because that run emitted none). Canvas = the artwork's exact 2:3, no stretch. ----
  template("flashsale", "Weekend flash sale", "#1c120c", "flashsale", [
    text("WEEKEND\nFLASH SALE", 430, 96, 540, 96, "#fff6e8", { fontWeight: 800, lineHeight: 0.95 }),
    text("30%\nOFF", 520, 460, 450, 168, "#ffd23e", { fontWeight: 800, lineHeight: 0.9 }),
    text("SAT—SUN · 7AM–5PM", 520, 860, 450, 40, "#fff6e8", { charSpacing: 30 }),
    text("GRIND & GLORY", 520, 930, 450, 30, "#d8c9b4", { charSpacing: 60 }),
  ], { category: "flash-sale", w: 1024, h: 1536 }),
  template("menuboard", "Bakery menu board", "#e8d9bf", "menuboard", [
    text("BAKERY\n& BREW", 470, 100, 480, 92, "#3a2a1c", { fontWeight: 800, lineHeight: 0.95 }),
    text("Espresso — 35\nCappuccino — 45\nCold Brew — 49\nButter Croissant — 38\nSourdough Loaf — 55", 470, 400, 480, 40, "#3a2a1c", { lineHeight: 1.85 }),
    text("BAKED BEFORE SUNRISE", 470, 1060, 480, 26, "#7a6248", { charSpacing: 50 }),
  ], { category: "menu", w: 1024, h: 1536 }),
  template("serum", "Serum launch post", "#ded2c2", "serum", [
    text("MEET YOUR\nDAILY RITUAL", 60, 90, 900, 88, "#3d3428", { fontWeight: 800, lineHeight: 0.98 }),
    text("A fresh start for your skin", 62, 300, 700, 36, "#6b5d4c" ),
    text("SHOP THE LAUNCH — 20% OFF", 60, 1396, 900, 38, "#3d3428", { fontWeight: 700, charSpacing: 30, textAlign: "center" }),
  ], { category: "social-post", w: 1024, h: 1536 }),
  // ---- TPL-T3 batch 2 (2026-11-04): new-product + a second flash-sale look.
  // Placement per plate QA: sneaker copy goes top + bottom-right (light type on
  // the darker gradient); holiday copy top-left (right side carries bokeh). ----
  template("sneaker", "Product drop", "#23262c", "sneaker", [
    text("VELOCE ONE", 60, 92, 900, 92, "#ffffff", { fontWeight: 800, charSpacing: 40 }),
    text("RUN LIGHTER.\nLAND SOFTER.", 60, 210, 640, 40, "#c9ccd4" ),
    text("THE DROP — 12.12", 470, 1290, 500, 52, "#ffb347", { fontWeight: 800, textAlign: "right" }),
    text("Limited first run · members early access", 470, 1370, 500, 26, "#9aa0ab", { textAlign: "right" }),
  ], { category: "new-product", w: 1024, h: 1536 }),
  template("holiday", "Year-end blowout", "#0d2b1e", "holiday", [
    text("YEAR-END\nBLOWOUT", 60, 110, 640, 120, "#f5e9c8", { fontWeight: 800, lineHeight: 0.95 }),
    text("UP TO 50% OFF", 60, 430, 560, 64, "#e2b653", { fontWeight: 800, charSpacing: 30 }),
    text("ENDS DEC 31 · ONLINE & IN-STORE", 60, 540, 560, 28, "#cdd8cd", { charSpacing: 40 }),
    text("Wrap up the year\nwith everything\nyou missed", 60, 660, 520, 44, "#f5e9c8", { lineHeight: 1.3 }),
  ], { category: "flash-sale", w: 1024, h: 1536 }),
];
