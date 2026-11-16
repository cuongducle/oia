import { z } from "zod";

/**
 * W1.1 product profile, seller-workflow redo (docs/designs/execution-plan.md).
 * Owner model 13-16/11/2026: NO structured fields beyond these; the free-text
 * description IS the product data (price included as prose), tags carry
 * brand/collection grouping, and facts are the content source for image text
 * (each keeps provenance for the small footnote), never a publication gate
 * (the anti-fabrication check was dropped 16/11).
 */

/** Stored-asset or http(s) photo ref. Same shape as LOGO_REF (see brandkit.ts
 *  for the .url() rejection story); product photos ride the same LocalFileStore.
 *  http URLs exclude quotes/brackets/backslash so the string stays inert when a
 *  later lane (PPTX/HTML export, W4.10) interpolates it into another format. */
export const PRODUCT_PHOTO_REF = /^(?:https?:\/\/[^\s"'<>\\]+|\/api\/files\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*)$/;

/** Where a fact came from; `name` is what the Facts screen chips show
 *  (file name, "Listing description", "Shop", or a typed-in label). */
export const factSourceSchema = z
  .object({
    kind: z.enum(["description", "file", "typed", "shop"]),
    name: z.string().trim().min(1).max(120),
    /** Free provenance detail (test id, page, date) printed as the footnote. */
    detail: z.string().max(300).default(""),
  })
  .strict();

export type ProductFactSource = z.infer<typeof factSourceSchema>;

export const productFactSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().trim().min(1).max(500),
    source: factSourceSchema,
    /** Unchecked facts stay stored but leave the image-text suggestion pool. */
    kept: z.boolean().default(true),
  })
  .strict();

export type ProductFact = z.infer<typeof productFactSchema>;

/** Fact ids are React keys and delete targets inside one profile; a duplicate
 *  would make one delete remove two rows. Enforced here so EVERY caller
 *  (renderer, future Mass Upload parser, loopback API) gets the same rule. */
export const productFactsSchema = z
  .array(productFactSchema)
  .max(200)
  .refine((facts) => new Set(facts.map((f) => f.id)).size === facts.length, {
    message: "fact ids must be unique within a product",
  });

export const productPhotoSchema = z
  .object({
    ref: z.string().regex(PRODUCT_PHOTO_REF),
    /** Optional caption (e.g. "packshot", "swatch"); order in the array is meaningful. */
    note: z.string().max(120).default(""),
  })
  .strict();

export type ProductPhoto = z.infer<typeof productPhotoSchema>;

export const productProfileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(200),
    /** Free text, pasted from the listing; price is prose here, never a field. */
    description: z.string().max(20_000).default(""),
    photos: z.array(productPhotoSchema).max(24).default([]),
    tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
    /** W1.4: notes the AI lanes must obey verbatim (structure-only edits). */
    lockNotes: z.string().max(2000).default(""),
    facts: productFactsSchema.default([]),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
  })
  .strict();

export type ProductProfile = z.infer<typeof productProfileSchema>;

/**
 * Limit rationale (numbers are OURS, not platform rules; platform caps are
 * data-driven destination checks in W4.6, never store constants):
 * - photos 24: headroom over the 9-per-listing marketplace slot, supplier packs
 *   and shop-frame variants ride in the same array; a number here only bounds
 *   one profile's size, it does not claim any platform allows 24.
 * - facts 200 / fact text 500: a tech sheet yields tens of lines, not hundreds;
 *   500 chars is a long sentence with provenance, not a paragraph dump.
 * - description 20k: full listing paste including variant tables.
 */
export const PRODUCT_LIMITS = {
  name: 200,
  description: 20_000,
  photos: 24,
  tags: 30,
  tagLength: 40,
  lockNotes: 2000,
  facts: 200,
  factText: 500,
} as const;
