# Oia landing site

Production static site, promoted from `../concept` (QA ledger in `../concept/SPEC.md`).

## Run locally
```bash
cd site && python3 -m http.server 8765   # → http://localhost:8765
```
No build step. Three files: `index.html`, `styles.css`, `main.js` + `assets/`.

## Deploy
Any static host — pick one:

- **Cloudflare Pages**: create project → framework "None" → build command empty → output dir `site`
- **Netlify**: drag-and-drop the `site` folder, or connect repo with publish dir `site`
- **Vercel**: `vercel site --prod` (auto-detects static)
- **GitHub Pages**: push, Settings → Pages → deploy from branch → `/site`

## Before launch (TODOs marked in index.html)
1. Replace both `href="#"` GitHub/Download links with real URLs
   (lesson from the references: secure the right domain early — invoke.com is
   parked by squatters while the product lives on invoke.ai).
2. Point `og:image` at a hosted absolute URL (currently relative qa-shots).
3. Optionally self-host the 6 CDN libs (gsap ×3, lenis, split-type, three) or
   keep jsDelivr/cdnjs — page is static-first either way; if CDNs fail, the
   page degrades gracefully to the fully-visible no-motion version.

## Engineering notes
- `html.js` class is added only when GSAP loads — no-JS/CDN-fail users get a
  complete static page (all reveals/curtains default visible; gating lives in
  `.js`-scoped CSS).
- `prefers-reduced-motion`: full static fallback + animations disabled.
- Below-fold images `loading="lazy"` + explicit width/height (no CLS).
- Fonts: Anton / Archivo / JetBrains Mono via Google Fonts, `display=swap`.
- Motion stack: GSAP+ScrollTrigger+Draggable, Lenis, SplitType, Three.js grain
  shader (recipe from the Hermes REA teardown in docs/designs/collage-references.md).
