# Oia landing site

Static site for marketplace sellers, English surface per D8/D19 in
`../docs/designs/desktop-only-reorg.md`. No build step or third-party JS/CSS.

## Visual system

- The existing dark/violet shell stays. Artwork has its own brand palette.
- Three generated outputs only: MORI matcha, its offer repaint, FORMA skincare.
- One genuine Electron screenshot shows the imported MORI artwork and a
  separately authored, selected shipping-note text layer. It is not a recording
  of an end-to-end AI run or proof that baked lettering is already editable.
- Hero choices swap between reviewed outputs and update the short example brief.
  No automatic typing, auto-swapping, or fake generation progress.
- Before/after uses a readable side-by-side image. A split down the middle hid
  both offer badges on the same side of the composition, so the slider was removed.
- No old video, background plates, or template contact sheets. Template pages are
  explicitly text indexes; the app's actual templates and assets are untouched.
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

README uses `../docs/screenshots/overview.png`, the same composition as the
social card. The two fictional brands are campaign examples, not bundled
examples or customer endorsements. Reference-image edits preserve visual
intent, not every pixel.

Exact prompts, output hashes, and generation thread identifiers:
`../docs/verification/marketing-assets-provenance.json`.
Visual review rounds and scope:
`../docs/verification/marketing-assets.md`.

Rebuild the three derived composites, without network or quota:

```bash
python3 docs/screenshots/build-marketing.py
```

Requires Pillow with FreeType WOFF2 support. Fonts come from the self-hosted
`site/fonts/` files, not `/tmp` or downloads.

## Checks and local preview

```bash
python3 config/audit/marketing-assets.py --self-test
python3 config/audit/marketing-assets.py
python3 site/templates/build.py
python3 -m http.server 8765 --directory site
```

The media-reference check also runs before GitHub Pages deployment. It includes
nested template pages, local social-image URLs, and README images. Use a fresh
local origin for visual QA when a browser has cached previous site versions.

## Shared contracts

- `styles.css` supplies tokens, `.btn*`, `.kicker`, `.mono` to `pages.css` and
  content pages. Keep these stable. One `max-width:960px` block owns landing
  responsiveness.
- `fonts/` is self-hosted, including Vietnamese subsets for content.
- `main.js` null-guards landing-specific elements. Content pages reuse the
  download resolver, GitHub API with a bounded timeout and one fallback version.
  Release assets still have versioned names, unversioned URLs remain D19 debt.
- `faq-schema.js` derives JSON-LD from the visible FAQ, no duplicate copy.
- `templates/build.py` generates category/style/pack text indexes. Deep pages
  use one extra parent traversal for site resources and links.
- `/install/`, `/templates/`, `/prompts/`, and `/use-cases/` remain static pages.

## Deploy

The domain oia.solutions uses Cloudflare static assets. Operational details live
in `docs/private/landing-deploy.md` (gitignored). Pushes touching the landing or
its marketing asset inputs also publish the GitHub Pages copy. This change does
not deploy to Cloudflare or publish a release automatically from the local tree.
