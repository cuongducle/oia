/**
 * Reorg step 5, the curated sample designs. Data only (no renderer imports):
 * shared by the Home gallery, the editor Templates panel, and the UTILITY
 * process, which seeds them as editable "Sample" projects on first run.
 * Artwork ships as renderer public assets (public/studio/*.webp); scenes
 * reference them canonically as /studio/<artwork>.webp (mapAssetUrls maps the
 * form for display, exactly like editor-applied templates).
 */
import { SCENE_VERSION, type FabricObject, type Template } from "@oia/schema";

const W = 900, H = 1200;
function text(value: string, x: number, y: number, width: number, size: number, color: string, extra: Record<string, unknown> = {}): FabricObject {
  return { type: "Textbox", text: value, left: x, top: y, width, fontSize: size, fill: color, fontFamily: "Be Vietnam Pro", lineHeight: 0.98, fontWeight: 500, ...extra };
}
function template(id: string, name: string, color: string, artwork: string, objects: FabricObject[], opts: { category?: string; style?: string; pack?: string; w?: number; h?: number; artworkBox?: { left: number; top: number; width: number; height: number } } = {}): Template {
  const w = opts.w ?? W, h = opts.h ?? H;
  return { id: `studio-${id}`, name, authorName: "Oia Studio", featured: true, tipCredits: 0, createdAt: 0,
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.style ? { style: opts.style } : {}),
    ...(opts.pack ? { pack: opts.pack } : {}),
    scene: { version: SCENE_VERSION, objects: [
      { type: "Rect", name: "clip", width: w, height: h, left: 0, top: 0, fill: color, selectable: false },
      { type: "Image", name: "artwork", src: `/studio/${artwork}.webp`, left: 0, top: 0, width: w, height: h, crossOrigin: "anonymous", ...opts.artworkBox },
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
    text("09-11\nAUGUST", 660, 52, 190, 25, "#fffbeb", { textAlign: "right" }),
    text("CITY\nSOUND\nFEST.", 42, 235, 810, 143, "#fffbeb", { fontWeight: 800, lineHeight: 0.9, charSpacing: -55 }),
    text("MUSIC\nPEOPLE\nCULTURE", 54, 1030, 400, 26, "#fffbeb", { fontWeight: 600 }),
  ], { category: "poster" }),
  template("botanical", "A touch of nature", "#a74f2d", "botanical", [
    text("Lumea", 54, 52, 400, 51, "#fff4e4", { fontFamily: "Georgia", fontStyle: "italic" }),
    text("SKINCARE\nFOR A KINDER YOU", 540, 60, 305, 21, "#fff4e4", { textAlign: "right" }),
    text("A touch\nof nature", 54, 205, 770, 105, "#fff4e4", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("KINDER TO YOUR SKIN.\nCLOSER TO NATURE.\nSIMPLY ESSENTIAL.", 56, 552, 530, 24, "#fff4e4", { lineHeight: 1.25 }),
  ], { category: "social-post" }),
  template("perspective", "A clearer perspective · Presentation", "#e9e5f6", "perspective-ai-20261112", [
    text("VISTRA", 80, 64, 400, 30, "#242739", { charSpacing: 80 }),
    text("Business Presentation", 80, 142, 700, 24, "#45465a"),
    text("A clearer\nperspective", 72, 252, 820, 104, "#202133", { fontWeight: 600, charSpacing: -50, lineHeight: 1.02 }),
    { type: "Rect", left: 80, top: 600, width: 720, height: 1, fill: "#9693a8" },
    text("Insights today. Better tomorrows.", 80, 644, 720, 30, "#45465a"),
    text("STRATEGY REVIEW · 2026", 80, 808, 720, 22, "#45465a", { charSpacing: 50 }),
  ], { category: "deck", w: 1600, h: 900 }),
  // ---- TPL-T3 batch 1 (2026-11-03): real codex clean-plate runs, text authored per
  // the doctrine (real sample copy, never "[Add price]"-style lazy placeholders the
  // planner itself produced, caught at packaging; menu blocks authored by hand
  // because that run emitted none). Canvas = the artwork's exact 2:3, no stretch. ----
  template("flashsale", "Weekend flash sale", "#1c120c", "flashsale", [
    // visual-QA: all right-column blocks hang off ONE right axis (x+w = 970), the first
    // pass had the headline bleeding the right trim and the brand line too gray.
    text("WEEKEND\nFLASH SALE", 470, 96, 500, 84, "#fff6e8", { fontWeight: 800, lineHeight: 0.95, textAlign: "right" }),
    text("30%\nOFF", 520, 440, 450, 168, "#ffd23e", { fontWeight: 800, lineHeight: 0.9, textAlign: "right" }),
    text("SAT-SUN · 7AM-5PM", 520, 848, 450, 40, "#fff6e8", { charSpacing: 30, textAlign: "right" }),
    text("GRIND & GLORY", 520, 918, 450, 30, "#f0e3cd", { charSpacing: 60, textAlign: "right" }),
  ], { category: "flash-sale", w: 1024, h: 1536 }),
  template("menuboard", "Bakery menu board", "#e8d9bf", "menuboard", [
    { type: "Rect", name: "menu-paper", left: 440, top: 0, width: 584, height: 1536, fill: "#f5ecdc" },
    text("BAKERY\n& BREW", 470, 100, 480, 92, "#3a2a1c", { fontWeight: 800, lineHeight: 0.95 }),
    text("Espresso · 35.000₫\nCappuccino · 45.000₫\nCold brew · 49.000₫\nCroissant · 38.000₫\nSourdough · 55.000₫", 480, 400, 480, 36, "#3a2a1c", { lineHeight: 1.85 }),
    // visual-QA: the tagline crossed the wall/table shadow strip at its old spot,
    // anchored under the menu block on clean wall, a step darker for contrast.
    text("BAKED BEFORE SUNRISE", 470, 1000, 480, 26, "#5d4632", { charSpacing: 50 }),
  ], { category: "menu", pack: "cafe-restaurant", w: 1024, h: 1536 }),
  template("serum", "Serum launch post", "#ded2c2", "serum", [
    text("MEET YOUR\nDAILY RITUAL", 60, 90, 900, 88, "#3d3428", { fontWeight: 800, lineHeight: 0.98 }),
    text("A fresh start for your skin", 62, 300, 700, 36, "#6b5d4c" ),
    text("SHOP THE LAUNCH, 20% OFF", 60, 1396, 900, 38, "#3d3428", { fontWeight: 700, charSpacing: 30, textAlign: "center" }),
  ], { category: "social-post", pack: "product-launch", w: 1024, h: 1536 }),
  // ---- TPL-T3 batch 2 (2026-11-04): new-product + a second flash-sale look.
  // Placement per plate QA: sneaker copy goes top + bottom-right (light type on
  // the darker gradient); holiday copy top-left (right side carries bokeh). ----
  template("sneaker", "Product drop", "#23262c", "sneaker", [
    text("VELOCE ONE", 60, 92, 900, 92, "#ffffff", { fontWeight: 800, charSpacing: 40 }),
    text("RUN LIGHTER.\nLAND SOFTER.", 60, 210, 640, 40, "#c9ccd4" ),
    // visual-QA: the caption nearly melted into the light gradient, near-white now;
    // the date (the actionable line) bumped to rival the tagline.
    text("THE DROP, 12.12", 420, 1276, 550, 52, "#ffb347", { fontWeight: 800, textAlign: "right" }),
    text("Limited first run · members early access", 470, 1360, 500, 24, "#e8eaee", { textAlign: "right" }),
  ], { category: "new-product", pack: "product-launch", w: 1024, h: 1536 }),
  template("holiday", "Year-end blowout", "#0d2b1e", "holiday", [
    text("YEAR-END\nBLOWOUT", 60, 110, 640, 120, "#f5e9c8", { fontWeight: 800, lineHeight: 0.95 }),
    text("UP TO 50% OFF", 60, 430, 560, 64, "#e2b653", { fontWeight: 800, charSpacing: 30 }),
    text("ENDS DEC 31 · ONLINE & IN-STORE", 60, 540, 560, 28, "#cdd8cd", { charSpacing: 40 }),
    text("Wrap up the year\nwith everything\nyou missed", 60, 660, 520, 44, "#f5e9c8", { lineHeight: 1.3 }),
  ], { category: "flash-sale", w: 1024, h: 1536 }),
  // AI plates supersede the SC-3 procedural backgrounds; see template-bundle-audit.md.
  template("swiss-flashsale", "Clearance 50% · Swiss", "#fafaf8", "swiss-flashsale-ai-20261112", [
    text("CLEARANCE · FW/26", 60, 64, 640, 22, "#737373", { charSpacing: 80 }),
    text("ONLINE ONLY", 780, 64, 240, 22, "#737373", { charSpacing: 80, textAlign: "right" }),
    text("TAKE 50% OFF\nEVERYTHING", 60, 180, 960, 104, "#0a0a0a", { fontWeight: 200, lineHeight: 1.04, charSpacing: -10 }),
    text("599.000₫", 60, 480, 720, 82, "#002FA7", { fontWeight: 600, charSpacing: -8 }),
    text("was 1.200.000₫", 60, 594, 480, 30, "#737373", { linethrough: true }),
    { type: "Rect", name: "rule", left: 60, top: 674, width: 960, height: 1, fill: "#d4d4d2" },
    text("ENDS SUNDAY 23:59", 60, 714, 480, 26, "#0a0a0a", { charSpacing: 60 }),
    text("ALL SIZES · NO CODE", 540, 714, 480, 26, "#737373", { charSpacing: 60, textAlign: "right" }),
  ], { category: "flash-sale", style: "swiss", w: 1080, h: 1350 }),
  template("swiss-spec", "Product spec sheet · Swiss", "#fafaf8", "swiss-spec-ai-20261112", [
    text("NEW ARRIVAL / 001", 60, 64, 640, 22, "#525252", { charSpacing: 80 }),
    text("AERIS STUDIO", 760, 64, 260, 22, "#525252", { charSpacing: 80, textAlign: "right" }),
    text("AERIS\nTABLE LAMP", 60, 170, 500, 72, "#0a0a0a", { fontWeight: 200, lineHeight: 1.04, charSpacing: -8 }),
    text("Warm light. Honest materials.\nMade to be repaired.", 60, 370, 500, 26, "#525252"),
    { type: "Rect", name: "rule", left: 60, top: 490, width: 500, height: 1, fill: "#d4d4d2" },
    text("MATERIAL", 60, 530, 180, 18, "#525252", { charSpacing: 70 }),
    text("Brushed aluminium", 250, 526, 310, 22, "#0a0a0a", { textAlign: "right" }),
    text("LIGHT", 60, 612, 180, 18, "#525252", { charSpacing: 70 }),
    text("2700K · dimmable", 250, 608, 310, 22, "#0a0a0a", { textAlign: "right" }),
    text("SIZE", 60, 694, 180, 18, "#525252", { charSpacing: 70 }),
    text("Ø28 × 42 cm", 250, 690, 310, 22, "#0a0a0a", { textAlign: "right" }),
    text("PRICE", 60, 776, 180, 18, "#525252", { charSpacing: 70 }),
    text("1.490.000₫", 250, 772, 310, 26, "#0a0a0a", { fontWeight: 600, textAlign: "right" }),
    { type: "Rect", name: "rule", left: 60, top: 840, width: 500, height: 1, fill: "#d4d4d2" },
    text("IN STORES NOW\nHCMC · HANOI", 60, 920, 500, 22, "#0a0a0a", { charSpacing: 60 }),
  ], { category: "new-product", style: "swiss", pack: "product-launch", w: 1080, h: 1080 }),
  template("swiss-statement", "Post consistently · Swiss", "#fafaf8", "swiss-statement-ai-20261112", [
    text("CONTENT PACK / 01", 100, 64, 640, 22, "#737373", { charSpacing: 80 }),
    text("SHOP LEDGER", 100, 122, 800, 22, "#737373", { charSpacing: 80, textAlign: "right" }),
    text("POST\nCONSISTENTLY.", 100, 214, 820, 92, "#0a0a0a", { fontWeight: 200, lineHeight: 1.04, charSpacing: -10 }),
    text("A little planning. A clear point of view.\nA rhythm your audience remembers.", 100, 474, 800, 28, "#737373"),
    { type: "Rect", name: "rule", left: 100, top: 604, width: 800, height: 1, fill: "#d4d4d2" },
    text("8", 100, 646, 200, 76, "#FF6B35", { fontWeight: 600 }),
    text("posts a month", 100, 752, 240, 20, "#737373", { charSpacing: 40 }),
    text("3", 380, 646, 200, 76, "#0a0a0a", { fontWeight: 600 }),
    text("rotating formats", 380, 752, 240, 20, "#737373", { charSpacing: 40 }),
    text("15m", 660, 646, 240, 76, "#0a0a0a", { fontWeight: 600 }),
    text("to make it yours", 660, 752, 240, 20, "#737373", { charSpacing: 40 }),
  ], { category: "social-post", style: "swiss", w: 1600, h: 900 }),
  template("ed-menu", "Café menu · Editorial", "#e8d6b6", "ed-menu-ai-20261112", [
    text("CORNER CAFÉ", 60, 64, 600, 22, "#5d4632", { charSpacing: 80 }),
    text("SPRING · № 04", 720, 64, 300, 22, "#5d4632", { charSpacing: 80, textAlign: "right" }),
    text("BAKERY & SLOW BREWS", 60, 150, 700, 24, "#8a6f4d", { charSpacing: 90 }),
    text("Morning\nRituals", 60, 200, 900, 100, "#3a2a1c", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("Small batches, warm light, no rush.", 60, 450, 800, 30, "#6b4f33", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 60, top: 520, width: 960, height: 1, fill: "#a4835a" },
    text("Cardamom knot", 60, 550, 560, 36, "#3a2a1c", { fontFamily: "Georgia" }),
    text("42.000₫", 620, 554, 400, 30, "#3a2a1c", { textAlign: "right" }),
    text("Flat white, oat", 60, 620, 560, 36, "#3a2a1c", { fontFamily: "Georgia" }),
    text("48.000₫", 620, 624, 400, 30, "#3a2a1c", { textAlign: "right" }),
    text("Filter, Huila, Colombia", 60, 690, 620, 36, "#3a2a1c", { fontFamily: "Georgia" }),
    text("55.000₫", 680, 694, 340, 30, "#3a2a1c", { textAlign: "right" }),
    { type: "Rect", name: "rule", left: 60, top: 746, width: 960, height: 1, fill: "#a4835a" },
    text("OPEN DAILY 7-17 · 12 LÊ LẠI, D.1", 60, 776, 960, 24, "#5d4632", { charSpacing: 60 }),
  ], { category: "menu", style: "editorial", pack: "cafe-restaurant", w: 1080, h: 1350 }),
  template("ed-feature", "Field notes · Editorial", "#eee4d2", "ed-feature-ai-20261112", [
    text("FIELD NOTES · 07", 60, 64, 600, 22, "#7a6a4e", { charSpacing: 80 }),
    text("THE JOURNAL", 760, 64, 260, 22, "#7a6a4e", { charSpacing: 80, textAlign: "right" }),
    text("The Slow\nReturn", 60, 140, 900, 96, "#3a3222", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("What a year of small, deliberate choices actually buys you.", 60, 380, 900, 30, "#5f5238", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 60, top: 470, width: 960, height: 1, fill: "#b09c74" },
    text("Fewer, better tools. Shorter lists. Longer walks.\nThe inbox can wait, the good ideas can't.", 60, 490, 900, 27, "#4a4030", { lineHeight: 1.3 }),
    text("READ ON, 6 MIN", 60, 580, 480, 22, "#7a6a4e", { charSpacing: 60 }),
    text("@studio.journal", 540, 580, 480, 22, "#7a6a4e", { charSpacing: 60, textAlign: "right" }),
  ], { category: "social-post", style: "editorial", w: 1080, h: 1080 }),
  template("ed-holiday", "Gilded nights · Editorial", "#0d2b1e", "holiday", [
    text("YEAR END · GIFT SET № 1", 60, 64, 640, 22, "#a08a5f", { charSpacing: 80 }),
    text("HOLIDAY EDIT", 60, 130, 640, 24, "#e2b653", { charSpacing: 90 }),
    text("Gilded\nNights", 60, 230, 640, 124, "#f5e9c8", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("Warm lights. Quiet hours.\nA gift worth slowing down for.", 60, 540, 640, 34, "#d8c9a8", { fontFamily: "Georgia", fontStyle: "italic" }),
    text("CORNER CAFÉ GIFT SET", 60, 680, 800, 36, "#f5e9c8", { fontFamily: "Georgia" }),
    text("890.000₫, wrapped free", 60, 736, 700, 28, "#d8c9a8" ),
    text("ORDER BY DEC 22", 60, 1400, 640, 26, "#e2b653", { charSpacing: 70 }),
  ], { category: "poster", style: "editorial", w: 1024, h: 1536 }),
  // ---- SC-3 AI batch (2026-11-07): real codex clean-plate runs (4 images, 0
  // reads, research off, refine off via the temp harvest patch, reverted after).
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
    text("SAT-SUN 8-14 · WALK-INS ONLY", 60, 716, 960, 22, "#3d1f14", { charSpacing: 60 }),
  ], { category: "menu", style: "editorial", pack: "cafe-restaurant", w: 1080, h: 1350 }),
  template("ed-product2", "First light serum · Editorial", "#e8ded0", "ed-product2", [
    text("THE DAILY RITUAL", 60, 100, 520, 22, "#7a6a4e", { charSpacing: 80 }),
    text("First\nLight", 60, 160, 520, 96, "#3a3222", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("Four ingredients.\nOne daily ritual.", 60, 410, 520, 26, "#5f5238", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 60, top: 510, width: 520, height: 1, fill: "#b09c74" },
    text("890.000₫, 30 ml", 60, 548, 520, 30, "#3a3222" ),
    text("SHOP THE LAUNCH", 60, 660, 400, 22, "#7a6a4e", { charSpacing: 60 }),
  ], { category: "new-product", style: "editorial", pack: "product-launch", w: 1080, h: 1080 }),
  template("ed-holiday2", "Candlelit gift · Editorial dark", "#171512", "ed-holiday2", [
    text("MIDNIGHT EDIT", 80, 120, 640, 24, "#d4a04a", { charSpacing: 90 }),
    text("Wrapped\nin Gold", 80, 190, 640, 88, "#f5e9c8", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("A little warmth.\nBeautifully wrapped.", 80, 420, 640, 28, "#d8c9a8", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 80, top: 540, width: 640, height: 1, fill: "#6b5a3e" },
    text("GIFT SET, 590.000₫", 80, 580, 640, 30, "#f5e9c8" ),
    text("ORDER BY DEC 22", 80, 690, 640, 22, "#d4a04a", { charSpacing: 70 }),
  ], { category: "poster", style: "editorial", pack: "cafe-restaurant", w: 1080, h: 1350 }),
  template("ed-poster2", "Thrown by hand · Editorial", "#d9bfa4", "ed-poster2", [
    text("THE ATELIER JOURNAL", 520, 120, 500, 22, "#e6c9a4", { charSpacing: 80 }),
    text("Thrown\nby Hand", 520, 180, 500, 92, "#fff3df", { fontFamily: "Georgia", lineHeight: 1.06 }),
    text("Small-batch ceramics.\nMade for everyday rituals.", 520, 420, 500, 28, "#f0dac0", { fontFamily: "Georgia", fontStyle: "italic" }),
    text("OPEN SAT-SUN · 34 THÁI HÀ", 520, 540, 500, 22, "#e6c9a4", { charSpacing: 60 }),
  ], { category: "poster", style: "editorial", w: 1080, h: 1350 }),
  // ---- SC-3 batch 3 (2026-11-07): style-preset plates, editorial/swiss rode
  // the real chatRun (style field, SC-2 plumbing); 5 images, 0 reads. Zones per
  // vision-measured clean rectangles. ----
  template("ed-street", "Morning phở · Editorial", "#b8ada0", "ed-street", [
    { type: "Rect", name: "copy-paper", left: 460, top: 100, width: 580, height: 680, fill: "#eee5d6" },
    text("STREET EATS № 07 · SÀI GÒN", 500, 140, 520, 22, "#6b5f50", { charSpacing: 70 }),
    text("Morning\nPhở", 500, 200, 520, 96, "#2e2620", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("Nước dùng ninh xương qua đêm, ăn ngay kẻo nguội.", 500, 424, 520, 28, "#5d5142", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 500, top: 500, width: 520, height: 1, fill: "#8f7a63" },
    text("Phở bò · nước trong", 500, 530, 520, 30, "#2e2620", { fontFamily: "Georgia" }),
    text("49.000₫", 500, 588, 520, 26, "#b3552e", { fontWeight: 700, textAlign: "right" }),
    text("MỞ 6-11H · 12 NGUYỄN TRÃI", 500, 660, 520, 22, "#6b5f50", { charSpacing: 60 }),
  ], { category: "poster", style: "editorial", pack: "cafe-restaurant", w: 1080, h: 1350 }),
  template("ed-fashion", "The linen edit · Editorial", "#d9cbb8", "ed-fashion", [
    text("THE LINEN EDIT", 670, 90, 360, 22, "#7a6a52", { charSpacing: 80 }),
    text("Soft\nStructure", 670, 148, 370, 78, "#3a3226", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("Washed linen.\nAn easy, generous fit.", 670, 350, 360, 25, "#5f5238", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 670, top: 458, width: 360, height: 1, fill: "#a89070" },
    text("Áo linen oversized", 670, 488, 360, 30, "#3a3226", { fontFamily: "Georgia" }),
    text("1.190.000₫", 670, 550, 360, 26, "#3a3226", { textAlign: "right" }),
    text("BOUTIQUE LANH · OPEN DAILY", 670, 1180, 360, 20, "#7a6a52", { charSpacing: 50 }),
  ], { category: "social-post", style: "editorial", w: 1080, h: 1350 }),
  template("swiss-sneaker", "Veloce Two · Swiss", "#002FA7", "swiss-sneaker", [
    text("DROP 04 / FW", 60, 64, 640, 22, "#ffffff", { charSpacing: 80 }),
    text("RUNNING LEDGER", 760, 64, 260, 22, "#ffffff", { charSpacing: 80, textAlign: "right" }),
    text("VELOCE\nTWO.", 60, 140, 960, 108, "#ffffff", { fontWeight: 200, lineHeight: 1.02, charSpacing: -8 }),
    text("Lighter upper. Softer landing. Your daily trainer.", 60, 424, 880, 28, "#c9d2ee" ),
    { type: "Rect", name: "rule", left: 60, top: 500, width: 960, height: 1, fill: "#3d55b5" },
    text("218g", 60, 540, 300, 54, "#ffffff", { fontWeight: 600 }),
    text("weight, size 42", 60, 614, 300, 20, "#c9d2ee", { charSpacing: 40 }),
    text("8mm", 400, 540, 300, 54, "#ffffff", { fontWeight: 600 }),
    text("heel-toe drop", 400, 614, 300, 20, "#c9d2ee", { charSpacing: 40 }),
    text("499.000₫", 740, 540, 280, 54, "#FFD500", { fontWeight: 600 }),
    text("first run, dec 12", 740, 614, 280, 20, "#c9d2ee", { charSpacing: 40 }),
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
    text("QUARTERLY LOOKBOOK", 80, 72, 720, 22, "#7a6a4e", { charSpacing: 80 }),
    text("The Quiet\nSeason", 80, 220, 760, 110, "#3a3222", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("Twelve pieces, one palette, no noise.", 80, 530, 720, 32, "#5f5238", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 80, top: 620, width: 720, height: 1, fill: "#b09c74" },
    text("VOL. 04 · SPRING LOOKBOOK", 80, 650, 720, 22, "#7a6a4e", { charSpacing: 60 }),
    text("ATELIER THÁI · 2026", 80, 808, 720, 22, "#7a6a4e", { charSpacing: 60 }),
  ], { category: "deck", style: "editorial", w: 1600, h: 900, artworkBox: { left: 880, top: 0, width: 720, height: 900 } }),
  // SC-5 Tet pack: all six now use AI plates; prompts live in template-provenance.ts.
  template("tet-flashsale", "Tết sale 40% · Editorial", "#9e1230", "tet-flashsale", [
    text("TẾT SALE 2027 · MÙA XUÂN", 60, 90, 900, 22, "#E8C868", { charSpacing: 80 }),
    text("Giảm 40%\nToàn bộ", 60, 160, 900, 104, "#F5EFE3", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("Năm cũ thanh toán, năm mới mặc đẹp.", 60, 424, 860, 30, "#E8C868", { fontFamily: "Georgia", fontStyle: "italic" }),
    { type: "Rect", name: "rule", left: 60, top: 502, width: 960, height: 1, fill: "#c05454" },
    text("599.000₫", 60, 530, 440, 56, "#F5EFE3", { fontWeight: 600 }),
    text("999.000₫", 60, 600, 400, 26, "#d9a0a0", { linethrough: true }),
    text("CHỈ ĐẾN 27 TẾT · ONLINE", 540, 560, 480, 24, "#E8C868", { charSpacing: 60, textAlign: "right" }),
  ], { category: "flash-sale", style: "editorial", pack: "tet-sale", w: 1080, h: 1350 }),
  template("tet-gift", "Giỏ quà Tết · Editorial dark", "#1c1712", "tet-gift", [
    text("GIỎ QUÀ TẾT 2027", 60, 80, 800, 22, "#d4a04a", { charSpacing: 80 }),
    text("Xuân\nĐầy Ấm", 60, 140, 800, 96, "#f5e9c8", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("Trà nóng, mứt ngọt, một giỏ trọn vẹn.", 60, 372, 860, 30, "#d8c9a8", { fontFamily: "Georgia", fontStyle: "italic" }),
    text("GIỎ TRÀ + MỨT, 1.290.000₫", 60, 440, 800, 30, "#f5e9c8" ),
    text("ĐẶT TRƯỚC 20 TẾT · GIAO MIỄN PHÍ", 60, 1230, 960, 22, "#d4a04a", { charSpacing: 60 }),
  ], { category: "poster", style: "editorial", pack: "tet-sale", w: 1080, h: 1350 }),
  template("tet-menu", "Bếp xuân · Editorial", "#efe3cf", "tet-menu", [
    text("BẾP XUÂN · ĐƠN TẾT", 60, 90, 800, 22, "#8f1d1d", { charSpacing: 80 }),
    text("Bánh Chưng\nNgày Tết", 60, 150, 940, 96, "#7a1616", { fontFamily: "Georgia", lineHeight: 1.05 }),
    text("Nếp ngọt, đậu bùi, gói bằng lá dong đúng kiểu.", 60, 386, 900, 30, "#6b4a2f", { fontFamily: "Georgia", fontStyle: "italic" }),
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
    text("MỘC STUDIO · MỪNG XUÂN", 60, 900, 500, 20, "#a01818", { charSpacing: 50 }),
  ], { category: "social-post", style: "editorial", pack: "tet-sale", w: 1080, h: 1080 }),
  template("tet-swiss", "Tết sale 50% · Swiss đỏ", "#c8102e", "tet-red-ai-20261112", [
    text("TẾT SALE / XUÂN 2027", 60, 80, 700, 22, "#e8c9c9", { charSpacing: 80 }),
    text("ONLINE", 820, 80, 200, 22, "#e8c9c9", { charSpacing: 80, textAlign: "right" }),
    text("Giảm\n50%", 60, 180, 960, 150, "#f5efe3", { fontWeight: 200, lineHeight: 1.02, charSpacing: -10 }),
    text("Đón xuân mới. Ưu đãi toàn cửa hàng.", 60, 540, 860, 28, "#f0c9c9" ),
    { type: "Rect", name: "rule", left: 60, top: 620, width: 960, height: 1, fill: "#e05a5a" },
    text("3 ngày", 60, 650, 300, 46, "#f5efe3", { fontWeight: 600 }),
    text("còn lại", 60, 708, 300, 20, "#f0c9c9", { charSpacing: 40 }),
    text("Toàn shop", 400, 650, 300, 46, "#f5efe3", { fontWeight: 600 }),
    text("áp dụng", 400, 708, 300, 20, "#f0c9c9", { charSpacing: 40 }),
    text("27 Tết", 740, 650, 280, 46, "#FFD76A", { fontWeight: 600 }),
    text("hết hạn", 740, 708, 280, 20, "#f0c9c9", { charSpacing: 40 }),
  ], { category: "flash-sale", style: "swiss", pack: "tet-sale", w: 1080, h: 1350 }),
  template("tet-voucher", "Lì xì voucher · Swiss vàng", "#fad029", "tet-gold-ai-20261112", [
    text("VOUCHER · TẾT 2027", 60, 80, 700, 22, "#5c5200", { charSpacing: 80 }),
    text("MÃ GIẢM", 760, 80, 260, 22, "#5c5200", { charSpacing: 80, textAlign: "right" }),
    text("Lì Xì\nMay Mắn", 60, 160, 540, 96, "#141414", { fontWeight: 200, lineHeight: 1.04, charSpacing: -8 }),
    text("Nhập mã khi thanh toán.\nĐón lộc trên đơn đầu xuân.", 60, 420, 480, 28, "#5c5200" ),
    { type: "Rect", name: "rule", left: 60, top: 560, width: 460, height: 1, fill: "#8a7a00" },
    text("MÃ: XUAN27", 60, 590, 460, 36, "#8f1d1d", { fontWeight: 600, charSpacing: 20 }),
    text("GIẢM 50.000₫", 60, 650, 460, 40, "#141414", { fontWeight: 700 }),
    text("HSD: ĐẾN 15 THÁNG HAI\nMỘT MÃ MỖI ĐƠN", 60, 730, 400, 20, "#5c5200", { charSpacing: 60 }),
  ], { category: "social-post", style: "swiss", pack: "tet-sale", w: 1080, h: 1080 }),
];
