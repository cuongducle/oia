# AGENTS.md: rules for coding agents working on the Oia site (apps/site)

Read `README.md` in this directory first; it owns the full contract. The short
version, in the order agents most often violate it:

1. **Relative links only.** No leading-slash hrefs. Compute `base` from route
   depth and pass it to `Page.astro`; deep template pages already do.
2. **Download CTAs** go through `components/DownloadButtons.astro`. Do not
   hand-write `data-dl` links or point any CTA at the GitHub releases listing.
3. **`public/` is verbatim.** Files there are served as-is; if you need
   processing (hashing, bundling), it does not belong in `public/`.
4. **Braces in markup are Astro expressions.** JSON-LD and code samples use
   frontmatter strings + `set:html` (see `index.astro`).
5. **Chip rows are `div role="group"`, never `<nav>`**; headers stay z-index
   200. Reading extensions pin `<nav>` elements over the header.
6. **Astro is pinned** (`7.4.11`). Do not run `astro upgrade` or widen the
   range casually; majors change content collections and the compiler.
7. **After edits**: `pnpm --filter @oia/site build`, then both audits
   (`config/audit/marketing-assets.py`, `node --test
   config/audit/marketing-downloads.test.cjs`), then click through the built
   pages in a real browser before claiming anything visual.
8. The template catalog is generated, not curated. Change
   `src/data/catalog.json` only via `scripts/export-previews.py`.
