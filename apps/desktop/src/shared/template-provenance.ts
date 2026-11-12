/**
 * SC-5: template provenance: the exact prompts that grew the AI-plated studio
 * templates (social-card-style-presets.md). A preset pack's differentiator is
 * reproducibility: the artwork is not stock, it grew from a recorded prompt
 * the user can rerun, remix, or point at their own subject. Data only; the
 * site pack pages and any future in-app provenance surface read from here.
 *
 * Quota ledgers: social-card-style-presets.md and template-bundle-audit.md.
 */
export interface TemplateProvenance {
  templateId: string;
  /** The exact clean-plate prompt sent to the real generation path. */
  prompt: string;
  mode: "clean-plate";
  style?: "editorial" | "swiss";
  generatedAt: string; // ISO date of the harvest run
}

export const TEMPLATE_PROVENANCE: readonly TemplateProvenance[] = [
  {
    templateId: "studio-ed-menu3",
    prompt:
      "Editorial food photography for a cafe menu template: a tight cluster of cafe breakfast items (cardamom buns, flat white, small brunch board) ALL confined to the BOTTOM THIRD of the frame, the entire TOP TWO THIRDS is a completely plain smooth warm terracotta backdrop with only a very soft light gradient, absolutely no objects, no napkins, no props, no shadows of objects in the top area, generous negative space for large text overlay in the upper area, no text anywhere, shot from above",
    mode: "clean-plate",
    generatedAt: "2026-11-07",
  },
  {
    templateId: "studio-ed-product2",
    prompt:
      "Skincare serum bottle standing on warm travertine stone, one green leaf casting a soft shadow, dune-toned paper backdrop, soft directional daylight, quiet minimal editorial still life, large empty area on the left half for text overlay, no text anywhere",
    mode: "clean-plate",
    generatedAt: "2026-11-07",
  },
  {
    templateId: "studio-ed-holiday2",
    prompt:
      "Holiday gift still life on dark midnight background, warm candlelight glowing from the left, gilded ribbon and pine sprig on a wrapped box, deep soft shadows, editorial dark photography, empty lower third for text overlay, no text anywhere",
    mode: "clean-plate",
    generatedAt: "2026-11-07",
  },
  {
    templateId: "studio-ed-poster2",
    prompt:
      "Sunlit pottery atelier corner with drying ceramic bowls on wooden shelves, terracotta and cream palette, long soft afternoon shadows, quiet editorial interior photography, empty upper half for text overlay, no text anywhere",
    mode: "clean-plate",
    generatedAt: "2026-11-07",
  },
  {
    templateId: "studio-ed-street",
    prompt:
      "Vietnamese street food hero for an editorial poster: a steaming bowl of pho with herbs on a worn wooden stool, shot at golden hour from a low angle, ALL food confined to the BOTTOM THIRD, the entire TOP TWO THIRDS is a completely plain warm cement-grey backdrop with only a soft light gradient, no objects or props above, generous negative space for large text, no text anywhere",
    mode: "clean-plate",
    style: "editorial",
    generatedAt: "2026-11-07",
  },
  {
    templateId: "studio-ed-fashion",
    prompt:
      "Boutique fashion editorial: a linen shirt on a wooden hanger against a warm plaster wall, soft window light from the left, the garment occupies the LEFT HALF only, the RIGHT HALF is completely plain plaster backdrop with a gentle gradient, no objects on the right, generous negative space for a text column, no text anywhere",
    mode: "clean-plate",
    style: "editorial",
    generatedAt: "2026-11-07",
  },
  {
    templateId: "studio-ed-deck",
    prompt:
      "Editorial presentation cover: a single ceramic vase with dried grass on a warm oat-colored paper backdrop, soft directional light, the vase sits in the BOTTOM RIGHT quarter, the entire top-left two thirds is plain textured paper with subtle grain, no other objects, generous negative space for a title block, no text anywhere",
    mode: "clean-plate",
    style: "editorial",
    generatedAt: "2026-11-07",
  },
  {
    templateId: "studio-swiss-sneaker",
    prompt:
      "Swiss style product shot: a single white sneaker floating on a completely flat Klein blue background, one hard diagonal shadow, the sneaker occupies the bottom-left third, the top two thirds is pure flat blue with no gradient and no texture, extreme minimalism, generous negative space for large light typography, no text anywhere",
    mode: "clean-plate",
    style: "swiss",
    generatedAt: "2026-11-07",
  },
  {
    templateId: "studio-swiss-bottle",
    prompt:
      "Swiss style product shot: a matte white cosmetic bottle standing on the bottom edge of a completely flat lemon yellow background, one hard vertical shadow to its right, the bottle occupies the bottom-right quarter, the rest is pure flat yellow with no gradient and no texture, generous negative space for large light typography, no text anywhere",
    mode: "clean-plate",
    style: "swiss",
    generatedAt: "2026-11-07",
  },
  {
    templateId: "studio-tet-flashsale",
    prompt:
      "Tet festival sale hero: red and gold lucky money envelopes stacked with a small kumquat tree, ALL objects confined to the BOTTOM THIRD, the entire TOP TWO THIRDS is a completely plain deep crimson backdrop with only a very soft light gradient, no objects or shadows above, generous negative space for large text, no text anywhere",
    mode: "clean-plate",
    style: "editorial",
    generatedAt: "2026-11-08",
  },
  {
    templateId: "studio-tet-gift",
    prompt:
      "Tet gift basket editorial still life on dark background: a woven basket with tea, dried fruits and a red ribbon, warm golden light from the left, the basket occupies the BOTTOM RIGHT quarter, the top-left two thirds is plain dark charcoal paper with subtle grain, generous negative space for a title block, no text anywhere",
    mode: "clean-plate",
    style: "editorial",
    generatedAt: "2026-11-08",
  },
  {
    templateId: "studio-tet-menu",
    prompt:
      "Vietnamese Tet food photography: banh chung square sticky rice cakes tied with bamboo strings on a wooden tray with spring flowers, ALL food confined to the BOTTOM THIRD, the entire TOP TWO THIRDS is a completely plain warm cream paper backdrop with a soft light gradient, no objects above, generous negative space for large text, no text anywhere",
    mode: "clean-plate",
    style: "editorial",
    generatedAt: "2026-11-08",
  },
  {
    templateId: "studio-tet-greeting",
    prompt:
      "Tet greeting editorial: a single branch of yellow apricot blossom in a ceramic vase, the vase sits in the BOTTOM RIGHT quarter, the entire top-left two thirds is plain warm beige paper with subtle grain and soft shadow, no other objects, generous negative space for a greeting text block, no text anywhere",
    mode: "clean-plate",
    style: "editorial",
    generatedAt: "2026-11-08",
  },
  {
    templateId: "studio-tet-flashsale",
    prompt:
      "Tet festival sale hero: red and gold lucky money envelopes stacked with a small kumquat tree, ALL objects confined to the BOTTOM THIRD, the entire TOP TWO THIRDS is a completely plain deep crimson backdrop with only a very soft light gradient, no objects or shadows above, generous negative space for large text, no text anywhere",
    mode: "clean-plate",
    style: "editorial",
    generatedAt: "2026-11-08",
  },
  {
    templateId: "studio-tet-gift",
    prompt:
      "Tet gift basket editorial still life on dark background: a woven basket with tea, dried fruits and a red ribbon, warm golden light from the left, the basket occupies the BOTTOM RIGHT quarter, the top-left two thirds is plain dark charcoal paper with subtle grain, generous negative space for a title block, no text anywhere",
    mode: "clean-plate",
    style: "editorial",
    generatedAt: "2026-11-08",
  },
  {
    templateId: "studio-tet-menu",
    prompt:
      "Vietnamese Tet food photography: banh chung square sticky rice cakes tied with bamboo strings on a wooden tray with spring flowers, ALL food confined to the BOTTOM THIRD, the entire TOP TWO THIRDS is a completely plain warm cream paper backdrop with a soft light gradient, no objects above, generous negative space for large text, no text anywhere",
    mode: "clean-plate",
    style: "editorial",
    generatedAt: "2026-11-08",
  },
  {
    templateId: "studio-tet-greeting",
    prompt:
      "Tet greeting editorial: a single branch of yellow apricot blossom in a ceramic vase, the vase sits in the BOTTOM RIGHT quarter, the entire top-left two thirds is plain warm beige paper with subtle grain and soft shadow, no other objects, generous negative space for a greeting text block, no text anywhere",
    mode: "clean-plate",
    style: "editorial",
    generatedAt: "2026-11-08",
  },
  {
    templateId: "studio-swiss-flashsale",
    prompt: "Create a premium fashion clearance advertising CLEAN PLATE, portrait 4:5. A pair of sculptural ivory leather sneakers with a cobalt blue sole detail and a folded navy sweatshirt arranged as a beautiful commercial still life entirely in the BOTTOM 35 percent. White seamless studio background, natural hard sunlight and one deliberate diagonal shadow. The TOP 65 percent is empty near-white studio wall with a very subtle natural light gradient, completely free of objects and shadows, reserved for large black typography that will be added later. Strong art direction, tangible premium materials, crisp product photography, asymmetric Swiss editorial composition. No text, no letters, no numbers, no logos, no watermarks, no border. The shoes must be substantial, not tiny props.",
    mode: "clean-plate", style: "swiss", generatedAt: "2026-11-12",
  },
  {
    templateId: "studio-swiss-spec",
    prompt: "Premium design furniture product photography CLEAN PLATE, square. A real elegant brushed aluminium table lamp, circular shallow dome shade, thin stem, cylindrical weighted base, switched on with soft warm illumination. The lamp occupies the RIGHT 40 percent of the square from y=20 percent down to y=92 percent. A flat pale cool-grey seamless studio background fills the image. The LEFT 55 percent is completely plain pale grey with no objects, no shadows and no texture, reserved for text. Sophisticated Swiss design catalog aesthetic, precise geometry, single small cobalt-blue book under the lamp base, beautifully believable metal and lighting. No text, no logos, no lettering, no watermark, no border.",
    mode: "clean-plate", style: "swiss", generatedAt: "2026-11-12",
  },
  {
    templateId: "studio-swiss-statement",
    prompt: "Premium independent creative studio desk photograph CLEAN PLATE in landscape 16:9. A stylish open cream notebook with completely blank pages, a capped vivid orange fountain pen and a compact black camera form a strong graphic still life restricted entirely to the RIGHT 40 percent of the frame. Photograph from overhead with clean directional daylight and crisp shadows restricted to that right area. Entire LEFT 58 percent is a clean near-white seamless desktop, absolutely no props, no cast shadows in left area, reserved for big typography and three statistics underneath. Restrained Swiss editorial art direction, tactile high-end materials, geometric composition, orange is the only saturated accent. No words, no letters, no numbers, no logos, no watermark.",
    mode: "clean-plate", style: "swiss", generatedAt: "2026-11-12",
  },
  {
    templateId: "studio-ed-menu",
    prompt: "Beautiful artisan cafe menu CLEAN PLATE, portrait 4:5, high-end food editorial photography. A close-up still-life of a cardamom knot pastry on a small white ceramic plate, a flat white with immaculate latte art and a folded oat linen napkin. All food, ceramics, napkin and their shadows are confined to the BOTTOM 30 percent of the image. The TOP 70 percent is plain warm light ivory plaster with subtle natural paper-like texture, no objects, no shadows and no pattern, a clean space for an editable cafe menu to be overlaid. Warm morning window light, natural honey and cream palette, real appetizing food texture, calm spacious magazine art direction. No text, no lettering, no prices, no labels, no logo, no watermark, no border.",
    mode: "clean-plate", style: "editorial", generatedAt: "2026-11-12",
  },
  {
    templateId: "studio-ed-feature",
    prompt: "Editorial journal article CLEAN PLATE, square. An atmospheric close-up of a sunlit reading nook with a simple oak chair, a folded natural linen throw and a single closed unlabelled book beside a small olive branch in a ceramic vessel. Everything is confined to the BOTTOM 38 percent, composed as a beautiful intentional still life with angled afternoon sunlight. TOP 62 percent is entirely plain warm ivory plaster with a gentle light falloff, no props, no patterns, no cast shadows, ample empty space for a headline and article summary. Warm cream, olive, honey wood palette, luxurious but authentic quiet-life editorial photograph, fine film grain, realistic materials. Absolutely no text, letters, book titles, logos or watermark.",
    mode: "clean-plate", style: "editorial", generatedAt: "2026-11-12",
  },
  {
    templateId: "studio-tet-swiss",
    prompt: "A premium Vietnamese Tet fashion sale campaign CLEAN PLATE, portrait 4:5. Beautiful sculptural deep crimson silk fabric and an elegant red gift box with a restrained gold ribbon, a small branch of yellow apricot blossoms, and two unmarked red lucky-money envelopes arranged across the BOTTOM 35 percent. Entire TOP 65 percent is a plain rich crimson seamless background, completely free of props, shadows, flowers or ornaments, reserved for editable sale typography. Strong contemporary luxury editorial photography, beautifully lit dimensional materials, subtle warm gold highlights, tasteful not kitschy. No text anywhere, no letters, no numerals, no calligraphy, no symbols, no logos, no watermark, no border.",
    mode: "clean-plate", style: "swiss", generatedAt: "2026-11-12",
  },
  {
    templateId: "studio-tet-voucher",
    prompt: "Modern Vietnamese Tet voucher advertising CLEAN PLATE, square. Warm golden-yellow seamless studio background. A beautiful arrangement of two rich red blank lucky-money envelopes, a subtle gold coin and one apricot blossom sprig sits only in the BOTTOM RIGHT quadrant, with soft natural side lighting and clean dimensional shadows confined to that quadrant. The entire TOP 65 percent and LEFT 60 percent are completely plain warm yellow background, no objects or shadows, ample negative space reserved for big dark editable typography and a coupon code. Premium product photography with stylish Swiss graphic restraint, vivid true yellow and lacquer red, carefully crafted paper textures. Absolutely no text, no numbers, no Chinese characters, no calligraphy, no logos, no watermark, no borders.",
    mode: "clean-plate", style: "swiss", generatedAt: "2026-11-12",
  },
  {
    templateId: "studio-perspective",
    prompt: "Premium strategy presentation cover CLEAN PLATE, landscape 16:9. A sophisticated architectural still-life of a tall clear refractive glass prism and a translucent lavender glass sphere on a minimal stone plinth, photographed against a very pale lavender seamless studio background. Glass objects and plinth occupy only the RIGHT 42 percent of the frame and create interesting believable refracted light in that right area. Entire LEFT 55 percent remains completely plain pale lavender, no shapes, no shadows, no lines or gradients beyond a soft natural falloff, reserved for a big editable business presentation title. Professional contemporary design consultancy art direction, expensive tactile photography, quiet daylight, sharp but graceful. No text, no letters, no numbers, no logos, no watermark, no frame.",
    mode: "clean-plate", generatedAt: "2026-11-12",
  },
]
