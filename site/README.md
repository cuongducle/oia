# Oia landing site

Static site for marketplace sellers, English surface per D8/D19 in
`../docs/designs/desktop-only-reorg.md`. No build step or third-party JS/CSS.

## Visual system

- The existing dark/violet shell stays. Artwork has its own brand palette.
- Reused generated outputs: MORI matcha, its offer repaint, FORMA skincare,
  plus the fictional STILL product/reference pair from the reviewed feature pack.
- The v0.6.1 template gallery uses real desktop/Fabric scene renders. All 30
  Studio previews show complete artwork, never background-only mockups.
- The price-edit pair changes one native menu price from 42.000₫ to 46.000₫.
  Source pixels outside that price region are identical before WebP compression.
  It proves template editing, not OCR reconstruction of a flat image.
- The older brown text-only OCR demonstration and checkerboard livestream crop
  are retired from landing/README. Livestream is explained with text, without
  pretending a transparent overlay is photographic artwork.
- Content does not wait for a reveal animation to become visible, including
  background tabs. Fixed-header anchors have a scroll margin.
- One genuine Electron screenshot shows the imported MORI artwork and a
  separately authored, selected shipping-note text layer. It is not a recording
  of an end-to-end AI run or proof that baked lettering is already editable.
- Hero choices swap between reviewed outputs and update the short example brief.
  No automatic typing, auto-swapping, or fake generation progress.
- Before/after uses a readable side-by-side image. A split down the middle hid
  both offer badges on the same side of the composition, so the slider was removed.
- No old video, background-only plates or tiny contact sheets. Category, style
  and pack pages use real previews from one exported desktop catalog: 35 scenes
  across eight categories. Transparent livestream/overlay entries remain text
  listings, not misleading photo composites.
- Mobile images keep their complete composition. The studio and comparison link
  to full-size images, rather than cropping away controls to enlarge the artwork.

## Asset inventory

| File in `assets/` | Purpose |
| --- | --- |
| `mori-campaign.webp` | Generated square campaign, 20% offer |
| `mori-repaint.webp` | Reference-image edit, 30% offer |
| `forma-editorial.webp` | A contrasting portrait skincare campaign |
| `studio.webp` | Actual desktop editor screenshot |
| `mori-comparison.webp` | Side-by-side proof derived from the MORI pair |
| `og-hero.png` | 1200×630 social card |
| `still-product.webp`, `still-campaign.webp` | Product reference and corresponding image-channel campaign outputs |
| `templates/studio-*.webp` | 30 complete desktop scene previews, with AI-generated background imagery and native text |
| `templates/menu-price-edited.webp` | Same menu scene, one native price edit; no provider call |

Older `editable-text-*.webp` and `livestream-safe-zones.webp` files remain only
as historical verification inputs, not images on the current landing or README.

README uses `../docs/screenshots/overview.png`, the same composition as the
social card. The fictional brands are campaign examples, not bundled
examples or customer endorsements. Reference-image edits preserve visual
intent, not every pixel.

Exact prompts, output hashes, and generation thread identifiers:
`../docs/verification/marketing-assets-provenance.json`.
Visual review rounds and scope:
`../docs/verification/marketing-assets.md`.

Rebuild the historical campaign composites, without network or quota:

```bash
python3 docs/screenshots/build-marketing.py
python3 docs/screenshots/build-feature-assets.py
```

The feature builder uses committed outputs and reviewed source images, with
hashes and evidence boundaries in `../docs/verification/feature-assets.json`.
`--refresh-editable` imports newer private renderer outputs when those are
available, it does not run AI. SurgePix captures stay private and are never
inputs to the public marketing builder.

Requires Pillow with FreeType WOFF2 support. Fonts come from the self-hosted
`site/fonts/` files, not `/tmp` or downloads.

## Checks and local preview

```bash
# Refresh actual scene previews when the desktop bundle changes:
pnpm --filter @oia/desktop template-qa
python3 site/templates/export-previews.py
python3 site/templates/build.py

# Static release gates:
python3 config/audit/marketing-assets.py --self-test
python3 config/audit/marketing-assets.py
node --test config/audit/marketing-downloads.test.cjs
python3 -m http.server 8765 --directory site
```

The media-reference check also runs before GitHub Pages deployment. It includes
nested template pages, local social-image URLs, README images and SHA-256 hashes
of all 31 template/edit previews. Provenance is in
`../docs/verification/template-marketing-assets.json`. The exporter verifies the
native price edit changes no source pixels outside the price bounds. Use a fresh
local origin for visual QA when a browser has cached previous site versions.

## Shared contracts

- `styles.css` supplies tokens, `.btn*`, `.kicker`, `.mono` to `pages.css` and
  content pages. Keep these stable. One `max-width:960px` block owns landing
  responsiveness.
- `fonts/` is self-hosted, including Vietnamese subsets for content.
- `main.js` null-guards landing-specific elements. Every page (landing,
  install, prompts, use-cases and the whole templates tree) shows both the
  macOS and Windows download buttons as direct file links; the resolver
  updates each link independently from the GitHub latest release, falling
  back per platform to the pinned v0.6.1 files. A platform missing from a
  newer release keeps that button on the matching fallback tag, never a
  mixed tag/filename URL. The media audit fails any page that ships
  `data-dl` buttons without loading `main.js`.
- The category/facet chip rows are `div role="group"`, not `<nav>`: reading
  extensions (Speechify/ReadAloud style) pin extra `<nav>` elements fixed
  over the header, covering the nav download button. Headers keep z-index
  200 for the same reason.
- `faq-schema.js` derives JSON-LD from the visible FAQ, no duplicate copy.
- `templates/catalog.json` is exported from the shared desktop template catalog,
  not manually maintained. `templates/build.py` generates the hub, eight category
  pages, two style pages and three pack pages from that snapshot. Deep pages use
  one extra parent traversal for site resources and links.
- `/install/`, `/templates/`, `/prompts/`, and `/use-cases/` remain static pages.

## Deploy

The domain oia.solutions uses Cloudflare static assets. Operational details live
in `docs/private/landing-deploy.md` (gitignored). Pushes touching the landing or
its marketing asset inputs also publish the GitHub Pages copy. This change does
not deploy to Cloudflare or publish a release automatically from the local tree.
