import { z } from "zod";

/**
 * BR-BK — Brand kit ("Set up once — logos, colors, fonts, and guidance"):
 * - guidance ≤ 2000 characters
 * - logos ≤ 3 (URL sau upload)
 * - colors ≤ 10, formatted as #RRGGBB
 * - fonts ≤ 10 (font names)
 * - toggle "Apply to new projects and chats"
 */
export const HEX_COLOR = /^#([0-9a-fA-F]{6})$/;

/** Logo references: either an external http(s) URL or the CANONICAL stored-asset form
 *  `/api/files/<key>` — the shape LocalFileStore.put returns (oia:// is renderer-only).
 *  The absolute-URL-only rule silently rejected every logo uploaded through the app's
 *  own uploader (zod .url() refuses relative refs) — found while porting the Brand Kit
 *  panel in reorg step 4d. Path segments must be alnum-first (no leading dot — so no
 *  `..` traversal can be spelled); the store's safeKey() remains the second wall. */
export const LOGO_REF = /^(?:https?:\/\/[^\s]+|\/api\/files\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*)$/;

export const brandKitSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1).max(80).default("Untitled"),
    guidance: z.string().max(2000).default(""),
    logos: z.array(z.string().regex(LOGO_REF)).max(3).default([]),
    colors: z.array(z.string().regex(HEX_COLOR)).max(10).default([]),
    fonts: z.array(z.string().min(1).max(60)).max(10).default([]),
    applyByDefault: z.boolean().default(false),
    createdAt: z.number().optional(),
  })
  .strict();

export type BrandKit = z.infer<typeof brandKitSchema>;

export const BRANDKIT_LIMITS = { guidance: 2000, logos: 3, colors: 10, fonts: 10 } as const;
