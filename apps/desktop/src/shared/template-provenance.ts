/**
 * SC-5 — template provenance: the exact prompts that grew the AI-plated studio
 * templates (social-card-style-presets.md). A preset pack's differentiator is
 * reproducibility: the artwork is not stock — it grew from a recorded prompt
 * the user can rerun, remix, or point at their own subject. Data only; the
 * site pack pages and any future in-app provenance surface read from here.
 *
 * Quota ledger lives in the design doc (10 images + 0 reads across 3 batches).
 */
export interface TemplateProvenance {
  templateId: string;
  /** The clean-plate prompt as sent through the real chatRun. */
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
];
