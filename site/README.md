# Oia landing site

Production static site. Positioning decision: `../docs/designs/desktop-only-reorg.md` (D19);
marketplace-seller first, English surface per D8.

## Architecture (2026-11-09 rework: see D19 + the reorg doc's landing/README section)

- **Zero third-party JS/CSS.** No GSAP/Lenis/Draggable/SplitType/three.js, the
  page is `index.html` + `styles.css` + `main.js` (vanilla) + `faq-schema.js`.
  The only remaining motion: the hero typewriter (synced to the banner swap),
  the before/after slider, CSS reveals via IntersectionObserver.
- **Fonts self-hosted** in `fonts/` (fontsource woff2, latin + vietnamese
  subsets, 252 KB total, Tết copy renders diacritics). No Google Fonts
  request: a "local-first" pitch should not phone Google.
- **Film grain** = one inline SVG `feTurbulence` data-URI on `body::after`.
- **Hero = the value prop in 3 seconds** (review option B): the real
  `price-20/30.webp` pair, a prompt chip that types seller prompts, and two
  repaint buttons that crossfade the banner. No draggable moodboard anymore.
- **Layers section is static** (no ScrollTrigger pin), offsets are CSS
  transforms that scale with the cards, so nothing overflows on mobile.
- `styles.css` keeps exactly one `@media(max-width:960px)` block; keep it that way.
- Footer links use `.footlinks` (NOT `.navlinks`) so they stay visible on
  mobile when the nav collapses, the internal-link surface survives.
- **No version hardcode pair**: `main.js` resolves the latest release from
  `api.github.com` (3.5 s timeout) and falls back to a single `FALLBACK` const;
  bump that const on every release. JSON-LD `softwareVersion` stays hand-set.
- Assets still version-named (`Oia-0.4.0-arm64.dmg`), D19 debt: switch to
  unversioned asset names so `releases/latest/download/<name>` can be pinned
  without the API round-trip.

## Reproducible assets

- `docs/screenshots/banner.png` (README hero) ← `docs/screenshots/make-banner.py`
  (PIL, fonts from google/fonts in `/tmp/oia-fonts`). QA at GitHub's ~830px width.
- `site/assets/og-hero.png` (social card, 1200×630, no fake buttons) ←
  `docs/screenshots/make-og.py`, supersedes
  `docs/research/site-artwork-2026-11/make-og-hero.py` (kept for history).
- `price-20/30.webp` are REAL generations (the repaint pair); the before/after
  slider and the hero swap both reuse them.

## Content sync: what must not drift from the product

- Hero prompt chip = composer vocabulary (size pill `Shopee 1:1`, cost pill
  `up to 2 img + 2 reads` = the real Auto refine cost label, DA-5).
- Workflow step copy follows the real loop: describe → outline approval
  (outline edits free) → repaint/edit (preview-apply) → export.
- `#templates` = FEATURE WALL (owner 2026-11-03: tags name FEATURES, never
  origins; all-English samples).
- `#workflow` video = REAL codex run (`demo-loop` webm/mp4, lazy via
  IntersectionObserver, paused off-screen, poster-only under
  prefers-reduced-motion). **Owner decision (2026-11-03, standing): demo
  recordings use the REAL codex pair by default, no per-run confirmation.**
  The light app sits in a light `.appbar` window chrome, intentional
  contrast with the dark site, don't "fix" it away.
- Download buttons (`a[data-dl]`): OS + arch detection including iPadOS and
  Intel Mac (both intentionally get the releases page, with a note); version
  microcopy lands in `[data-dl-ver]`. `/install/` carries Gatekeeper /
  SmartScreen / xattr / checksums steps and is in `sitemap.xml`.
- FAQ JSON-LD is DERIVED from the visible DOM (`faq-schema.js`), one source,
  zero drift.

## Pages

- `/` landing (above) · `/install/` install help · `/templates/` gallery
  · `/prompts/` prompt library · `/use-cases/{flash-sale-banners,
  livestream-overlays,presentations}/` keyword pages, all static, crawlable,
  styled by `pages.css` on top of the shared primitives in `styles.css`
  (keep `:root` tokens, `.btn*`, `.kicker`, `.mono` stable, pages depend on them).
- Subpages load `main.js` for the download resolver only; every feature in it
  null-guards its elements.

## Run locally

```bash
cd site && python3 -m http.server 8765   # → http://localhost:8765
```
No build step.

## Deploy

The domain oia.solutions is a static-assets Cloudflare Worker; ops details
(account, who deploys, cache purge) live in `docs/private/landing-deploy.md`
(gitignored). `wrangler deploy` from the repo root; pushes touching `site/**`
also redeploy the github.io copy via `.github/workflows/landing-pages.yml`,
keep both in sync until the infra is unified.
