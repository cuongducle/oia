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
function template(id: string, name: string, color: string, artwork: string, objects: FabricObject[], opts: { category?: string; style?: string; w?: number; h?: number } = {}): Template {
  const w = opts.w ?? W, h = opts.h ?? H;
  return { id: `studio-${id}`, name, authorName: "Oia Studio", featured: true, tipCredits: 0, createdAt: 0,
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.style ? { style: opts.style } : {}),
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
    // visual-QA: all right-column blocks hang off ONE right axis (x+w = 970) — the first
    // pass had the headline bleeding the right trim and the brand line too gray.
    text("WEEKEND\nFLASH SALE", 470, 96, 500, 84, "#fff6e8", { fontWeight: 800, lineHeight: 0.95, textAlign: "right" }),
    text("30%\nOFF", 520, 440, 450, 168, "#ffd23e", { fontWeight: 800, lineHeight: 0.9, textAlign: "right" }),
    text("SAT—SUN · 7AM–5PM", 520, 848, 450, 40, "#fff6e8", { charSpacing: 30, textAlign: "right" }),
    text("GRIND & GLORY", 520, 918, 450, 30, "#f0e3cd", { charSpacing: 60, textAlign: "right" }),
  ], { category: "flash-sale", w: 1024, h: 1536 }),
  template("menuboard", "Bakery menu board", "#e8d9bf", "menuboard", [
    text("BAKERY\n& BREW", 470, 100, 480, 92, "#3a2a1c", { fontWeight: 800, lineHeight: 0.95 }),
    text("Espresso — 35\nCappuccino — 45\nCold Brew — 49\nButter Croissant — 38\nSourdough Loaf — 55", 470, 400, 480, 40, "#3a2a1c", { lineHeight: 1.85 }),
    // visual-QA: the tagline crossed the wall/table shadow strip at its old spot —
    // anchored under the menu block on clean wall, a step darker for contrast.
    text("BAKED BEFORE SUNRISE", 470, 1000, 480, 26, "#5d4632", { charSpacing: 50 }),
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
    // visual-QA: the caption nearly melted into the light gradient — near-white now;
    // the date (the actionable line) bumped to rival the tagline.
    text("THE DROP — 12.12", 470, 1284, 500, 60, "#ffb347", { fontWeight: 800, textAlign: "right" }),
    text("Limited first run · members early access", 470, 1368, 500, 26, "#e8eaee", { textAlign: "right" }),
  ], { category: "new-product", w: 1024, h: 1536 }),
  template("holiday", "Year-end blowout", "#0d2b1e", "holiday", [
    text("YEAR-END\nBLOWOUT", 60, 110, 640, 120, "#f5e9c8", { fontWeight: 800, lineHeight: 0.95 }),
    text("UP TO 50% OFF", 60, 430, 560, 64, "#e2b653", { fontWeight: 800, charSpacing: 30 }),
    text("ENDS DEC 31 · ONLINE & IN-STORE", 60, 540, 560, 28, "#cdd8cd", { charSpacing: 40 }),
    text("Wrap up the year\nwith everything\nyou missed", 60, 660, 520, 44, "#f5e9c8", { lineHeight: 1.3 }),
  ], { category: "flash-sale", w: 1024, h: 1536 }),
  // ---- SC-3 style batch (2026-11-06, docs/designs/social-card-style-presets.md):
  // Editorial × Swiss looks on programmatic plates (scripts/gen-style-plates.py,
  // 0 quota — Q1a: style rules re-expressed, nothing copied from the AGPL source).
  // Swiss law: one accent, display weight 200, hairlines, tracked caps. Editorial
  // law: Georgia serif display, italic deck, paper grain from the plate. ----
  template("swiss-flashsale", "Clearance 50% · Swiss", "#fafaf8", "swiss-flashsale", [
    text("CLEARANCE · FW/26", 60, 64, 640, 22, "#737373", { charSpacing: 80 }),
    text("ONLINE ONLY", 780, 64, 240, 22, "#737373", { charSpacing: 80, textAlign: "right" }),
    text("TAKE 50%\nOFF\nEVERYTHING", 60, 200, 960, 118, "#0a0a0a", { fontWeight: 200, lineHeight: 1.04, charSpacing: -10 }),
    text("599.000₫", 60, 680, 720, 92, "#002FA7", { fontWeight: 600, charSpacing: -8 }),
    text("was 1.200.000₫", 60, 800, 480, 30, "#737373", { linethrough: true }),
    { type: "Rect", name: "rule", left: 60, top: 884, width: 960, height: 1, fill: "#d4d4d2" },
    text("ENDS SUNDAY 23:59", 60, 916, 480, 26, "#0a0a0a", { charSpacing: 60 }),
    text("ALL SIZES · NO CODE", 540, 916, 480, 26, "#737373", { charSpacing: 60, textAlign: "right" }),
  ], { category: "flash-sale", style: "swiss", w: 1080, h: 1350 }),
  template("swiss-spec", "Product spec sheet · Swiss", "#fafaf8", "swiss-spec", [
    text("NEW ARRIVAL / 001", 60, 64, 640, 22, "#737373", { charSpacing: 80 }),
    text("AERIS STUDIO", 760, 64, 260, 22, "#737373", { charSpacing: 80, textAlign: "right" }),
    text("AERIS\nTABLE LAMP", 60, 170, 960, 108, "#0a0a0a", { fontWeight: 200, lineHeight: 1.04, charSpacing: -8 }),
    text("Warm light, honest materials — built to be repaired, not replaced.", 60, 430, 860, 30, "#737373"),
    { type: "Rect", name: "rule", left: 60, top: 520, width: 960, height: 1, fill: "#d4d4d2" },
    text("MATERIAL", 60, 556, 300, 20, "#737373", { charSpacing: 70 }),
    text("Anodised aluminium", 420, 552, 600, 26, "#0a0a0a", { textAlign: "right" }),
    text("LIGHT", 60, 628, 300, 20, "#737373", { charSpacing: 70 }),
    text("2700K warm LED · dimmable", 420, 624, 600, 26, "#0a0a0a", { textAlign: "right" }),
    text("SIZE", 60, 700, 300, 20, "#737373", { charSpacing: 70 }),
    text("Ø28 × 42 cm · 1,1 kg", 420, 696, 600, 26, "#0a0a0a", { textAlign: "right" }),
    text("PRICE", 60, 772, 300, 20, "#737373", { charSpacing: 70 }),
    text("1.490.000₫", 420, 768, 600, 26, "#0a0a0a", { fontWeight: 600, textAlign: "right" }),
    { type: "Rect", name: "rule", left: 60, top: 840, width: 960, height: 1, fill: "#d4d4d2" },
    text("IN STORES NOW — HCMC · HANOI", 60, 986, 960, 24, "#0a0a0a", { charSpacing: 60 }),
  ], { category: "new-product", style: "swiss", w: 1080, h: 1080 }),
  template("swiss-statement", "Post consistently · Swiss", "#fafaf8", "swiss-statement", [
    text("CONTENT PACK / 01", 100, 64, 640, 22, "#737373", { charSpacing: 80 }),
    text("SHOP LEDGER", 1160, 64, 340, 22, "#737373", { charSpacing: 80, textAlign: "right" }),
    text("POST\nCONSISTENTLY.", 100, 190, 1400, 132, "#0a0a0a", { fontWeight: 200, lineHeight: 1.04, charSpacing: -10 }),
    text("Eight ready-to-edit posts a month — three rotating formats, fifteen minutes each.", 100, 520, 900, 32, "#737373"),
    { type: "Rect", name: "rule", left: 100, top: 640, width: 1400, height: 1, fill: "#d4d4d2" },
    text("8", 100, 684, 200, 92, "#FF6B35", { fontWeight: 600 }),
    text("posts a month", 100, 778, 300, 22, "#737373", { charSpacing: 40 }),
    text("3", 566, 684, 200, 92, "#0a0a0a", { fontWeight: 600 }),
    text("formats in rotation", 566, 778, 300, 22, "#737373", { charSpacing: 40 }),
    text("15m", 1032, 684, 300, 92, "#0a0a0a", { fontWeight: 600 }),
    text("per post, start to finish", 1032, 778, 460, 22, "#737373", { charSpacing: 40 }),
  ], { category: "social-post", style: "swiss", w: 1600, h: 900 }),
  template("ed-menu", "Café menu · Editorial", "#e8d6b6", "ed-menu", [
    text("CORNER CAFÉ", 60, 64, 600, 22, "#5d4632", { charSpacing: 80 }),
    text("SPRING · № 04", 720, 64, 300, 22, "#5d4632", { charSpacing: 80, textAlign: "right" }),
    text("BAKERY & SLOW BREWS", 60, 150, 700, 24, "#8a6f4d", { charSpacing: 90 }),
    text("Morning\nRituals", 60, 230, 900, 116, "#3a2a1c", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("Small batches, warm light, no rush.", 60, 500, 800, 36, "#6b4f33", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 60, top: 580, width: 960, height: 1, fill: "#a4835a" },
    text("Cardamom knot", 60, 620, 560, 36, "#3a2a1c", { fontFamily: "Georgia" }),
    text("42.000₫", 620, 624, 400, 30, "#3a2a1c", { textAlign: "right" }),
    text("Flat white, oat", 60, 710, 560, 36, "#3a2a1c", { fontFamily: "Georgia" }),
    text("48.000₫", 620, 714, 400, 30, "#3a2a1c", { textAlign: "right" }),
    text("Filter — Huila, Colombia", 60, 800, 620, 36, "#3a2a1c", { fontFamily: "Georgia" }),
    text("55.000₫", 680, 804, 340, 30, "#3a2a1c", { textAlign: "right" }),
    { type: "Rect", name: "rule", left: 60, top: 890, width: 960, height: 1, fill: "#a4835a" },
    text("OPEN DAILY 7–17 · 12 LÊ LẠI, D.1", 60, 1240, 960, 24, "#5d4632", { charSpacing: 60 }),
  ], { category: "menu", style: "editorial", w: 1080, h: 1350 }),
  template("ed-feature", "Field notes · Editorial", "#eee4d2", "ed-feature", [
    text("FIELD NOTES · 07", 60, 64, 600, 22, "#7a6a4e", { charSpacing: 80 }),
    text("THE JOURNAL", 760, 64, 260, 22, "#7a6a4e", { charSpacing: 80, textAlign: "right" }),
    text("The Slow\nReturn", 60, 200, 900, 112, "#3a3222", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("What a year of small, deliberate choices actually buys you.", 60, 470, 820, 34, "#5f5238", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 60, top: 550, width: 960, height: 1, fill: "#b09c74" },
    text("Fewer, better tools. Shorter lists. Longer walks.\nThe inbox can wait — the good ideas can't.", 60, 600, 900, 30, "#4a4030", { lineHeight: 1.5 }),
    text("READ ON — 6 MIN", 60, 940, 480, 22, "#7a6a4e", { charSpacing: 60 }),
    text("@studio.journal", 540, 940, 480, 22, "#7a6a4e", { charSpacing: 60, textAlign: "right" }),
  ], { category: "social-post", style: "editorial", w: 1080, h: 1080 }),
  template("ed-holiday", "Gilded nights · Editorial", "#1e1b16", "ed-holiday", [
    text("YEAR END · GIFT SET № 1", 60, 64, 700, 22, "#a08a5f", { charSpacing: 80 }),
    text("HOLIDAY EDIT", 760, 64, 260, 22, "#a08a5f", { charSpacing: 80, textAlign: "right" }),
    text("HOLIDAY EDIT — WARM HOURS", 60, 150, 800, 24, "#d4a04a", { charSpacing: 90 }),
    text("Gilded\nNights", 60, 230, 900, 124, "#f5e9c8", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("Warm lights, quiet hours — one box that holds both.", 60, 540, 840, 34, "#d8c9a8", { fontFamily: "Georgia", fontStyle: "italic" }),
    text("CORNER CAFÉ GIFT SET", 60, 680, 800, 36, "#f5e9c8", { fontFamily: "Georgia" }),
    text("890.000₫ — wrapped free", 60, 736, 700, 28, "#d8c9a8" ),
    text("ORDER BY DEC 22", 60, 1160, 960, 26, "#d4a04a", { charSpacing: 70 }),
  ], { category: "poster", style: "editorial", w: 1080, h: 1350 }),
  // ---- SC-3 AI batch (2026-11-07): real codex clean-plate runs (4 images, 0
  // reads — research off, refine off via the temp harvest patch, reverted after).
  // Text zones placed per plate QA (vision-mapped empty areas), never over art. ----
  template("ed-menu3", "Weekend brunch · Editorial", "#c4634a", "ed-menu3", [
    text("CORNER CAFÉ · WEEKEND SET", 60, 96, 900, 22, "#3d1f14", { charSpacing: 80 }),
    text("Slow\nWeekends", 60, 160, 960, 112, "#331a10", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("Cardamom buns, flat whites, nowhere to be.", 60, 430, 860, 30, "#f9efdf", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 60, top: 502, width: 960, height: 1, fill: "#7a3d28" },
    text("Bun + flat white", 60, 534, 560, 34, "#2e1a10", { fontFamily: "Georgia" }),
    text("72.000₫", 620, 538, 400, 28, "#2e1a10", { textAlign: "right" }),
    text("Brunch board, two", 60, 606, 560, 34, "#2e1a10", { fontFamily: "Georgia" }),
    text("96.000₫", 620, 610, 400, 28, "#2e1a10", { textAlign: "right" }),
    text("SAT—SUN 8–14 · WALK-INS ONLY", 60, 716, 960, 22, "#3d1f14", { charSpacing: 60 }),
  ], { category: "menu", style: "editorial", w: 1080, h: 1350 }),
  template("ed-product2", "First light serum · Editorial", "#e8ded0", "ed-product2", [
    text("THE DAILY RITUAL", 60, 400, 520, 22, "#7a6a4e", { charSpacing: 80 }),
    text("First\nLight", 60, 460, 520, 96, "#3a3222", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("Four ingredients, nothing else.", 60, 676, 520, 30, "#5f5238", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 60, top: 736, width: 520, height: 1, fill: "#b09c74" },
    text("890.000₫ — 30 ml", 60, 766, 520, 30, "#3a3222" ),
    text("SHOP THE LAUNCH", 60, 916, 400, 22, "#7a6a4e", { charSpacing: 60 }),
  ], { category: "new-product", style: "editorial", w: 1080, h: 1080 }),
  template("ed-holiday2", "Candlelit gift · Editorial dark", "#171512", "ed-holiday2", [
    text("MIDNIGHT EDIT", 560, 330, 460, 24, "#d4a04a", { charSpacing: 90 }),
    text("Wrapped\nin Gold", 560, 400, 480, 88, "#f5e9c8", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("One box, warm hours, someone you thought of.", 560, 600, 480, 28, "#d8c9a8", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 560, top: 692, width: 460, height: 1, fill: "#6b5a3e" },
    text("GIFT SET — 590.000₫", 560, 722, 460, 30, "#f5e9c8" ),
    text("ORDER BY DEC 22", 560, 858, 460, 22, "#d4a04a", { charSpacing: 70 }),
  ], { category: "poster", style: "editorial", w: 1080, h: 1350 }),
  template("ed-poster2", "Thrown by hand · Editorial", "#d9bfa4", "ed-poster2", [
    text("THE ATELIER JOURNAL", 520, 120, 500, 22, "#7a5b3e", { charSpacing: 80 }),
    text("Thrown\nby Hand", 520, 180, 500, 92, "#3d2a1a", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("Small batches of terracotta, dried in afternoon light.", 520, 396, 500, 28, "#6b4a2f", { fontFamily: "Georgia", fontStyle: "italic" }),
    text("OPEN SAT—SUN · 34 THÁI HÀ", 520, 496, 500, 22, "#7a5b3e", { charSpacing: 60 }),
  ], { category: "poster", style: "editorial", w: 1080, h: 1350 }),
];
