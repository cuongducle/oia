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
function template(id: string, name: string, color: string, artwork: string, objects: FabricObject[], opts: { category?: string; style?: string; pack?: string; w?: number; h?: number } = {}): Template {
  const w = opts.w ?? W, h = opts.h ?? H;
  return { id: `studio-${id}`, name, authorName: "Oia Studio", featured: true, tipCredits: 0, createdAt: 0,
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.style ? { style: opts.style } : {}),
    ...(opts.pack ? { pack: opts.pack } : {}),
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
  ], { category: "menu", pack: "cafe-restaurant", w: 1024, h: 1536 }),
  template("serum", "Serum launch post", "#ded2c2", "serum", [
    text("MEET YOUR\nDAILY RITUAL", 60, 90, 900, 88, "#3d3428", { fontWeight: 800, lineHeight: 0.98 }),
    text("A fresh start for your skin", 62, 300, 700, 36, "#6b5d4c" ),
    text("SHOP THE LAUNCH — 20% OFF", 60, 1396, 900, 38, "#3d3428", { fontWeight: 700, charSpacing: 30, textAlign: "center" }),
  ], { category: "social-post", pack: "product-launch", w: 1024, h: 1536 }),
  // ---- TPL-T3 batch 2 (2026-11-04): new-product + a second flash-sale look.
  // Placement per plate QA: sneaker copy goes top + bottom-right (light type on
  // the darker gradient); holiday copy top-left (right side carries bokeh). ----
  template("sneaker", "Product drop", "#23262c", "sneaker", [
    text("VELOCE ONE", 60, 92, 900, 92, "#ffffff", { fontWeight: 800, charSpacing: 40 }),
    text("RUN LIGHTER.\nLAND SOFTER.", 60, 210, 640, 40, "#c9ccd4" ),
    // visual-QA: the caption nearly melted into the light gradient — near-white now;
    // the date (the actionable line) bumped to rival the tagline.
    text("THE DROP — 12.12", 420, 1276, 550, 52, "#ffb347", { fontWeight: 800, textAlign: "right" }),
    text("Limited first run · members early access", 470, 1360, 500, 24, "#e8eaee", { textAlign: "right" }),
  ], { category: "new-product", pack: "product-launch", w: 1024, h: 1536 }),
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
  ], { category: "new-product", style: "swiss", pack: "product-launch", w: 1080, h: 1080 }),
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
  ], { category: "menu", style: "editorial", pack: "cafe-restaurant", w: 1080, h: 1350 }),
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
  ], { category: "menu", style: "editorial", pack: "cafe-restaurant", w: 1080, h: 1350 }),
  template("ed-product2", "First light serum · Editorial", "#e8ded0", "ed-product2", [
    text("THE DAILY RITUAL", 60, 400, 520, 22, "#7a6a4e", { charSpacing: 80 }),
    text("First\nLight", 60, 460, 520, 96, "#3a3222", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("Four ingredients, nothing else.", 60, 676, 520, 30, "#5f5238", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 60, top: 736, width: 520, height: 1, fill: "#b09c74" },
    text("890.000₫ — 30 ml", 60, 766, 520, 30, "#3a3222" ),
    text("SHOP THE LAUNCH", 60, 916, 400, 22, "#7a6a4e", { charSpacing: 60 }),
  ], { category: "new-product", style: "editorial", pack: "product-launch", w: 1080, h: 1080 }),
  template("ed-holiday2", "Candlelit gift · Editorial dark", "#171512", "ed-holiday2", [
    text("MIDNIGHT EDIT", 560, 330, 460, 24, "#d4a04a", { charSpacing: 90 }),
    text("Wrapped\nin Gold", 560, 400, 480, 88, "#f5e9c8", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("One box, warm hours, someone you thought of.", 560, 600, 480, 28, "#d8c9a8", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 560, top: 692, width: 460, height: 1, fill: "#6b5a3e" },
    text("GIFT SET — 590.000₫", 560, 722, 460, 30, "#f5e9c8" ),
    text("ORDER BY DEC 22", 560, 858, 460, 22, "#d4a04a", { charSpacing: 70 }),
  ], { category: "poster", style: "editorial", pack: "cafe-restaurant", w: 1080, h: 1350 }),
  template("ed-poster2", "Thrown by hand · Editorial", "#d9bfa4", "ed-poster2", [
    text("THE ATELIER JOURNAL", 520, 120, 500, 22, "#7a5b3e", { charSpacing: 80 }),
    text("Thrown\nby Hand", 520, 180, 500, 92, "#3d2a1a", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("Small batches of terracotta, dried in afternoon light.", 520, 396, 500, 28, "#6b4a2f", { fontFamily: "Georgia", fontStyle: "italic" }),
    text("OPEN SAT—SUN · 34 THÁI HÀ", 520, 496, 500, 22, "#7a5b3e", { charSpacing: 60 }),
  ], { category: "poster", style: "editorial", w: 1080, h: 1350 }),
  // ---- SC-3 batch 3 (2026-11-07): style-preset plates — editorial/swiss rode
  // the real chatRun (style field, SC-2 plumbing); 5 images, 0 reads. Zones per
  // vision-measured clean rectangles. ----
  template("ed-street", "Morning phở · Editorial", "#b8ada0", "ed-street", [
    text("STREET EATS № 07 · SÀI GÒN", 500, 140, 520, 22, "#6b5f50", { charSpacing: 70 }),
    text("Morning\nPhở", 500, 200, 520, 96, "#2e2620", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("Nước dùng ninh xương qua đêm — ăn ngay kẻo nguội.", 500, 424, 520, 28, "#5d5142", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 500, top: 500, width: 520, height: 1, fill: "#8f7a63" },
    text("Đầu bò · nước trong", 500, 530, 520, 30, "#2e2620", { fontFamily: "Georgia" }),
    text("49.000₫", 500, 588, 520, 26, "#b3552e", { fontWeight: 700, textAlign: "right" }),
    text("MỞ 6–11H · 12 NGUYỄN TRÃI", 500, 660, 520, 22, "#6b5f50", { charSpacing: 60 }),
  ], { category: "poster", style: "editorial", pack: "cafe-restaurant", w: 1080, h: 1350 }),
  template("ed-fashion", "The linen edit · Editorial", "#d9cbb8", "ed-fashion", [
    text("THE LINEN EDIT", 670, 90, 360, 22, "#7a6a52", { charSpacing: 80 }),
    text("Soft\nStructure", 670, 148, 370, 78, "#3a3226", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("Washed linen, cut generous — for days that ask for both.", 670, 330, 360, 27, "#5f5238", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 670, top: 412, width: 360, height: 1, fill: "#a89070" },
    text("Áo linen oversized", 670, 442, 360, 30, "#3a3226", { fontFamily: "Georgia" }),
    text("1.190.000₫", 670, 496, 360, 26, "#3a3226", { textAlign: "right" }),
    text("BOUTIQUE LANH · OPEN DAILY", 670, 1180, 360, 20, "#7a6a52", { charSpacing: 50 }),
  ], { category: "social-post", style: "editorial", w: 1080, h: 1350 }),
  template("swiss-sneaker", "Veloce Two · Swiss", "#002FA7", "swiss-sneaker", [
    text("DROP 04 / FW", 60, 64, 640, 22, "#ffffff", { charSpacing: 80 }),
    text("RUNNING LEDGER", 760, 64, 260, 22, "#ffffff", { charSpacing: 80, textAlign: "right" }),
    text("VELOCE\nTWO.", 60, 140, 960, 108, "#ffffff", { fontWeight: 200, lineHeight: 1.02, charSpacing: -8 }),
    text("Lighter upper, softer landing — the daily trainer, distilled.", 60, 380, 880, 28, "#c9d2ee" ),
    { type: "Rect", name: "rule", left: 60, top: 452, width: 960, height: 1, fill: "#3d55b5" },
    text("218g", 60, 480, 300, 54, "#ffffff", { fontWeight: 600 }),
    text("weight, size 42", 60, 548, 300, 20, "#c9d2ee", { charSpacing: 40 }),
    text("8mm", 400, 480, 300, 54, "#ffffff", { fontWeight: 600 }),
    text("heel-toe drop", 400, 548, 300, 20, "#c9d2ee", { charSpacing: 40 }),
    text("499.000₫", 740, 480, 280, 54, "#FFD500", { fontWeight: 600 }),
    text("first run — dec 12", 740, 548, 280, 20, "#c9d2ee", { charSpacing: 40 }),
  ], { category: "new-product", style: "swiss", pack: "product-launch", w: 1080, h: 1080 }),
  template("swiss-bottle", "Everyday bottle · Swiss", "#FFD500", "swiss-bottle", [
    text("NEW / 002", 60, 64, 400, 22, "#141414", { charSpacing: 80 }),
    text("ATELIER BASIC", 460, 64, 400, 22, "#141414", { charSpacing: 80, textAlign: "right" }),
    text("The\nEveryday\nBottle", 60, 150, 520, 96, "#141414", { fontWeight: 200, lineHeight: 1.04, charSpacing: -6 }),
    { type: "Rect", name: "rule", left: 60, top: 500, width: 520, height: 1, fill: "#c9b400" },
    text("500 ML", 60, 530, 200, 20, "#5c5200", { charSpacing: 70 }),
    text("frosted glass", 320, 526, 260, 26, "#141414", { textAlign: "right" }),
    text("PUMP", 60, 590, 200, 20, "#5c5200", { charSpacing: 70 }),
    text("lockable, no drip", 320, 586, 260, 26, "#141414", { textAlign: "right" }),
    text("PRICE", 60, 650, 200, 20, "#5c5200", { charSpacing: 70 }),
    text("390.000₫", 320, 646, 260, 26, "#002FA7", { fontWeight: 600, textAlign: "right" }),
    text("IN STORES NOW", 60, 1230, 520, 24, "#141414", { charSpacing: 60 }),
  ], { category: "new-product", style: "swiss", pack: "product-launch", w: 1080, h: 1350 }),
  template("ed-deck", "The quiet season · Editorial", "#e5dcc9", "ed-deck", [
    text("QUARTERLY LOOKBOOK", 60, 110, 620, 22, "#7a6a4e", { charSpacing: 80 }),
    text("The Quiet\nSeason", 60, 168, 640, 92, "#3a3222", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("Twelve pieces, one palette, no noise.", 60, 380, 600, 30, "#5f5238", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 60, top: 450, width: 620, height: 1, fill: "#b09c74" },
    text("VOL. 04 — SPRING LOOKBOOK", 60, 480, 620, 22, "#7a6a4e", { charSpacing: 60 }),
    text("ATELIER THÁI · 2026", 60, 1230, 620, 22, "#7a6a4e", { charSpacing: 60 }),
  ], { category: "deck", style: "editorial", w: 1080, h: 1350 }),
  // ---- SC-5 full-pack build: TẾT SALE PACK (2026-11-07) — 4 AI plates
  // (editorial preset, prompts in template-provenance.ts) + 2 procedural
  // (gen-style-plates.py). Vietnamese copy throughout; zones per plate QA. ----
  template("tet-flashsale", "Tết sale 40% · Editorial", "#9e1230", "tet-flashsale", [
    text("TẾT SALE 2027 · MÙA XUÂN", 60, 90, 900, 22, "#E8C868", { charSpacing: 80 }),
    text("Giảm 40%\nToàn bộ", 60, 160, 900, 104, "#F5EFE3", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("Năm cũ thanh toán — năm mới mặc đẹp.", 60, 424, 860, 30, "#E8C868", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 60, top: 502, width: 960, height: 1, fill: "#c05454" },
    text("599.000₫", 60, 530, 560, 56, "#F5EFE3", { fontWeight: 600 }),
    text("999.000₫", 60, 600, 400, 26, "#d9a0a0", { linethrough: true }),
    text("CHỈ ĐẾN 27 TẾT · ONLINE", 540, 560, 480, 24, "#E8C868", { charSpacing: 60, textAlign: "right" }),
  ], { category: "flash-sale", style: "editorial", pack: "tet-sale", w: 1080, h: 1350 }),
  template("tet-gift", "Giỏ quà Tết · Editorial dark", "#1c1712", "tet-gift", [
    text("GIỎ QUÀ TẾT 2027", 60, 80, 800, 22, "#d4a04a", { charSpacing: 80 }),
    text("Xuân\nĐầy Ấm", 60, 140, 800, 96, "#f5e9c8", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("Trà nóng, mứt ngọt, một giỏ trọn vẹn.", 60, 372, 860, 30, "#d8c9a8", { fontFamily: "Georgia", fontStyle: "italic" }),
    text("GIỎ TRÀ + MỨT — 1.290.000₫", 60, 440, 800, 30, "#f5e9c8" ),
    text("ĐẶT TRƯỚC 20 TẾT · GIAO MIỄN PHÍ", 60, 1230, 960, 22, "#d4a04a", { charSpacing: 60 }),
  ], { category: "poster", style: "editorial", pack: "tet-sale", w: 1080, h: 1350 }),
  template("tet-menu", "Bếp xuân · Editorial", "#efe3cf", "tet-menu", [
    text("BẾP XUÂN · ĐƠN TẾT", 60, 90, 800, 22, "#8f1d1d", { charSpacing: 80 }),
    text("Bánh Chưng\nNgày Tết", 60, 150, 940, 96, "#7a1616", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("Nếp ngọt, đậu bùi — gói bằng lá dong đúng kiểu.", 60, 386, 900, 30, "#6b4a2f", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 60, top: 456, width: 960, height: 1, fill: "#c9a48a" },
    text("Bánh chưng (đôi)", 60, 484, 560, 32, "#4a2c1a", { fontFamily: "Georgia" }),
    text("120.000₫", 620, 488, 400, 26, "#4a2c1a", { textAlign: "right" }),
    text("Giò lụa 500g", 60, 548, 560, 32, "#4a2c1a", { fontFamily: "Georgia" }),
    text("95.000₫", 620, 552, 400, 26, "#4a2c1a", { textAlign: "right" }),
    text("Dưa hành hũ nhỏ", 60, 612, 560, 32, "#4a2c1a", { fontFamily: "Georgia" }),
    text("25.000₫", 620, 616, 400, 26, "#4a2c1a", { textAlign: "right" }),
    text("NHẬN ĐƠN ĐẾN 26 TẾT · GIAO NỘI THÀNH", 60, 700, 960, 22, "#8f1d1d", { charSpacing: 60 }),
  ], { category: "menu", style: "editorial", pack: "tet-sale", w: 1080, h: 1350 }),
  template("tet-greeting", "Chúc xuân · Editorial", "#e8dcc4", "tet-greeting", [
    text("CHÚC MỪNG XUÂN 2027", 60, 200, 520, 22, "#a01818", { charSpacing: 70 }),
    text("An Khang\nThịnh\nVượng", 60, 268, 520, 88, "#8f1d1d", { fontFamily: "Georgia", lineHeight: 1.04 }),
    text("Sức khỏe dồi dào, buôn may bán đắt.", 60, 600, 500, 28, "#6b4a2f", { fontFamily: "Georgia", fontStyle: "italic" }),
    text("@YOURSHOP · MỪNG XUÂN", 60, 900, 500, 20, "#a01818", { charSpacing: 50 }),
  ], { category: "social-post", style: "editorial", pack: "tet-sale", w: 1080, h: 1080 }),
  template("tet-swiss", "Tết sale 50% · Swiss đỏ", "#c8102e", "tet-red", [
    text("TẾT SALE / XUÂN 2027", 60, 80, 700, 22, "#e8c9c9", { charSpacing: 80 }),
    text("ONLINE", 820, 80, 200, 22, "#e8c9c9", { charSpacing: 80, textAlign: "right" }),
    text("Giảm\n50%", 60, 180, 960, 150, "#f5efe3", { fontWeight: 200, lineHeight: 1.02, charSpacing: -10 }),
    text("Toàn bộ shop — một màu đỏ, một mức giá.", 60, 540, 860, 28, "#f0c9c9" ),
    { type: "Rect", name: "rule", left: 60, top: 620, width: 960, height: 1, fill: "#e05a5a" },
    text("3 ngày", 60, 650, 300, 46, "#f5efe3", { fontWeight: 600 }),
    text("còn lại", 60, 708, 300, 20, "#f0c9c9", { charSpacing: 40 }),
    text("Toàn shop", 400, 650, 300, 46, "#f5efe3", { fontWeight: 600 }),
    text("áp dụng", 400, 708, 300, 20, "#f0c9c9", { charSpacing: 40 }),
    text("27 Tết", 740, 650, 280, 46, "#FFD76A", { fontWeight: 600 }),
    text("hết hạn", 740, 708, 280, 20, "#f0c9c9", { charSpacing: 40 }),
  ], { category: "flash-sale", style: "swiss", pack: "tet-sale", w: 1080, h: 1350 }),
  template("tet-voucher", "Lì xì voucher · Swiss vàng", "#fad029", "tet-gold", [
    text("VOUCHER · TẾT 2027", 60, 80, 700, 22, "#5c5200", { charSpacing: 80 }),
    text("MÃ GIẢM", 760, 80, 260, 22, "#5c5200", { charSpacing: 80, textAlign: "right" }),
    text("Lì Xì\nMay Mắn", 60, 170, 960, 110, "#141414", { fontWeight: 200, lineHeight: 1.04, charSpacing: -8 }),
    text("Nhập mã tại trang thanh toán — giảm ngay trên đơn đầu xuân.", 60, 460, 900, 28, "#5c5200" ),
    { type: "Rect", name: "rule", left: 60, top: 540, width: 960, height: 1, fill: "#8a7a00" },
    text("MÃ: XUAN27", 60, 570, 480, 40, "#8f1d1d", { fontWeight: 600, charSpacing: 20 }),
    text("GIẢM 50.000₫", 540, 570, 480, 40, "#141414", { fontWeight: 700, textAlign: "right" }),
    text("HSD: ĐẾN 15 THÁNG HAI · MỘT MÃ MỖI ĐƠN", 60, 660, 960, 20, "#5c5200", { charSpacing: 60 }),
  ], { category: "social-post", style: "swiss", pack: "tet-sale", w: 1080, h: 1080 }),
];
