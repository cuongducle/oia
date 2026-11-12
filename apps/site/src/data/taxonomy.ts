// Shared template taxonomy, mirrored from the desktop bundle
// (apps/desktop/src/shared/bundled-templates.ts via catalog.json).
// EXPECTED_TOTAL is a ratchet: adding a desktop template means regenerating
// the catalog AND bumping this number consciously.
export const CATEGORIES: [string, string][] = [
  ['flash-sale', 'Flash sale'], ['new-product', 'New product'], ['livestream', 'Livestream'],
  ['menu', 'Menu'], ['social-post', 'Social post'], ['deck', 'Presentation'],
  ['poster', 'Poster'], ['overlay', 'Overlay'],
]
export const STYLES: [string, string][] = [['editorial', 'Editorial'], ['swiss', 'Swiss']]
export const PACKS: [string, string][] = [
  ['cafe-restaurant', 'Café & restaurant'],
  ['product-launch', 'Product launch'],
  ['tet-sale', 'Tết sale'],
]
export const EXPECTED_TOTAL = 35
