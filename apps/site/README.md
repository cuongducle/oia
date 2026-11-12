# Oia landing site (Astro)

Static marketing site for marketplace sellers, English surface per D8/D19 in
`../../docs/designs/desktop-only-reorg.md`. Astro 7, static output, no client
framework, no CDN, self-hosted fonts.

## Layout

- `src/pages/**` — one file per URL. `templates/[...slug].astro` generates the
  8 category + 2 style + 3 pack pages from `src/data/catalog.json`.
- `src/data/` is the data layer. `catalog.json` (exported by
  `scripts/export-previews.py`, never hand-edited) is loaded through
  `catalog.ts`, which validates every row and ratchets the expected total in
  `taxonomy.ts`; a bad or drifted catalog fails the build. `releases.json` is
  the single source for installer tag/names/sizes; `public/main.js` carries a
  parallel runtime fallback that `config/audit/marketing-assets.py` forces to
  match, so a release bump cannot update one and miss the other.
- `src/layouts/Page.astro` — content-page shell (sticky nav + footer + main.js).
  `src/pages/index.astro` owns its own landing shell.
- `public/` ships verbatim: `main.js`, `styles.css`, `pages.css`, fonts,
  assets, sitemap, robots, `feature-review/`. Nothing in `public/` is
  processed, hashed or bundled.

## Hard rules

- **Relative links only** (`../`, `../../`), never absolute `/templates/`:
  the github.io copy is served from a subpath. Every page passes `base` to its
  layout; deep pages compute it from route depth.
- **Download CTAs** go through `components/DownloadButtons.astro`, which reads
  `src/data/releases.json`. Do not hand-write `data-dl` links or point any CTA
  at the GitHub releases listing. A release bump = edit `releases.json` AND
  the FALLBACK in `public/main.js` (the audit fails on drift), plus README
  prose.
- **Braces are expressions.** Raw `{`/`}` in markup (JSON-LD, code samples)
  must go through frontmatter strings + `set:html`, as `index.astro` does.
- **No islands, no client framework** unless a real need appears; the site's
  JavaScript budget is `main.js` (~3 KB) plus tiny inline page scripts.
- The category/facet chip rows are `div role="group"`, NOT `<nav>`: reading
  extensions pin secondary `<nav>` elements fixed over the header and cover
  the nav download button. Headers keep z-index 200 for the same reason.
- `404.astro` is standalone (inline CSS, root-relative links): it is served at
  arbitrary depths where relative URLs break. Do not wrap it in Page.astro.
- Astro is pinned exactly (`7.4.11`) in `package.json`. Major upgrades are a
  deliberate, reviewed change: 5→6 changed content collections (`slug`→`id`),
  7 swapped the compiler to Rust and stopped silently fixing malformed HTML.
  `typecheck` runs `tsc --noEmit` over the data layer; `astro check` is
  currently unusable under pnpm's strict layout (its wasm runtime cannot
  resolve `@emnapi/core`), revisit if that changes.

## Build, checks, preview

```bash
pnpm --filter @oia/site build        # static output → apps/site/dist
pnpm --filter @oia/site typecheck     # tsc over the data layer
python3 config/audit/site-links.py --self-test
python3 config/audit/site-links.py    # links, anchors, unique ids, sitemap parity
python3 config/audit/marketing-assets.py --self-test
python3 config/audit/marketing-assets.py   # scans dist/, run after build
node --test config/audit/marketing-downloads.test.cjs
pnpm --filter @oia/site preview      # or: python3 -m http.server 8765 --directory apps/site/dist
```

Both audits fail closed when `dist` is missing or suspiciously thin: build
first. `site-links.py` exists because wrong relative bases shipped twice
during the port; it also rejects duplicate DOM ids and sitemap drift.

The media-reference audit also runs in CI before Pages deploy. It includes
nested pages, local social-image URLs, README images (resolve from repo root,
`apps/site/public/assets/...`) and SHA-256 hashes of all 31 template/edit
previews. Provenance: `../../docs/verification/template-marketing-assets.json`.

## Refreshing template previews

When the desktop bundle changes:

```bash
pnpm --filter @oia/desktop template-qa
python3 apps/site/scripts/export-previews.py   # writes catalog.json + public/assets + provenance
```

Historical campaign composites (MORI/FORMA/STILL) rebuild without network:

```bash
python3 docs/screenshots/build-marketing.py
python3 docs/screenshots/build-feature-assets.py
```

The feature builder's `--refresh-editable` imports newer private renderer
outputs when available; it never runs AI. Exact prompts, hashes and evidence
boundaries: `../../docs/verification/marketing-assets-provenance.json` and
`../../docs/verification/feature-assets.json`.

## Blog (planned, not built)

When the blog is green-lit: content collections under `src/content/blog/`,
one Markdown file per post with frontmatter, list + post pages under
`src/pages/blog/`. No scaffolding exists yet on purpose; build it properly
when the first post is ready.

## Known debt (deliberate)

- `src/pages/index.astro` keeps the landing body as one verified block;
  section components are a future cleanup, not a regression to fix urgently.
- Content pages pass their own nav/footer link arrays: the old site had
  context-specific navs and the port preserved them.
- `feature-review/` moved out of `public/` to
  `docs/verification/feature-review-page/`; it no longer ships to production.

## Deploy

oia.solutions is a static-assets Cloudflare Worker; `wrangler deploy` from the
repo root publishes `apps/site/dist` (build first). Ops details live in
`../../docs/private/landing-deploy.md` (gitignored). Pushes that touch the
site also republish the github.io copy via `.github/workflows/landing-pages.yml`;
keep both origins in sync until the infra is unified.
