import catalog from './catalog.json'
import { CATEGORIES, STYLES, PACKS, EXPECTED_TOTAL } from './taxonomy'

export interface Entry {
  id: string
  name: string
  category: string
  style: string | null
  pack: string | null
  width: number
  height: number
  image?: string
}

const categorySlugs = new Set(CATEGORIES.map(([slug]) => slug))
const styleSlugs = new Set(STYLES.map(([slug]) => slug))
const packSlugs = new Set(PACKS.map(([slug]) => slug))

function fail(message: string): never {
  throw new Error(`catalog.json: ${message} (regenerate via apps/site/scripts/export-previews.py)`)
}

// SAFETY: single cast in the codebase. The JSON shape is validated row by row
// immediately after, so the cast cannot lie past this module.
const rows = catalog as unknown[]

if (rows.length !== EXPECTED_TOTAL) {
  fail(`expected ${EXPECTED_TOTAL} entries, found ${rows.length}`)
}
const seen = new Set<string>()
for (const row of rows) {
  const entry = row as Partial<Entry>
  if (typeof entry.id !== 'string' || !entry.id) fail('entry without id')
  if (seen.has(entry.id)) fail(`duplicate id ${entry.id}`)
  seen.add(entry.id)
  if (typeof entry.name !== 'string') fail(`${entry.id}: name must be a string`)
  if (!categorySlugs.has(entry.category as string)) fail(`${entry.id}: unknown category ${entry.category}`)
  if (entry.style !== null && !styleSlugs.has(entry.style as string)) fail(`${entry.id}: unknown style ${entry.style}`)
  if (entry.pack !== null && !packSlugs.has(entry.pack as string)) fail(`${entry.id}: unknown pack ${entry.pack}`)
  if (!Number.isInteger(entry.width) || !Number.isInteger(entry.height)) fail(`${entry.id}: bad dimensions`)
}
for (const slug of categorySlugs) {
  if (!rows.some((row) => (row as Partial<Entry>).category === slug)) {
    fail(`category ${slug} has no templates; update taxonomy.ts deliberately`)
  }
}

export const items = rows as Entry[]
export const byCategory = (slug: string) => items.filter((t) => t.category === slug)
export const byStyle = (slug: string) => items.filter((t) => t.style === slug)
export const byPack = (slug: string) => items.filter((t) => t.pack === slug)
