# Collage landing-page references (verified visually, Oct 2026)

Research for the Oia landing page. Every entry below was screenshot-checked and
analyzed visually (not just name-matched). Scores rate fit as a reference for
Oia = "AI image generation + layered canvas editor".

## Tier 1 — Collage landing pages, directly applicable

| Site | What it is | Score | Steal this |
| --- | --- | --- | --- |
| **Visual Electric** (visualelectric.com — product sunset Aug 2026; screenshots on Land-book, id 81773) | AI image generator for designers. Hero is a light-gray artboard: central image with **selection handles**, ~12–15 overlapping moodboard tiles, hand-drawn arrows connecting them, palette-swatch strip as a tile. Section 2 = real app screenshot. CTA orange pulled from the hero photo. | 9/10 | The hero IS the product demo: canvas + selection handles + connector arrows; one accent color sampled from hero imagery; light→dark section rhythm; logo row (IDEO, Netflix, NYT) on black. Watch-outs: white headline over busy photo = contrast risk; 15+ tiles compete with CTA. |
| **Collage Department** (collagedepartment.com — Awwwards HM 2021) | Agency site. Vermillion bg, cream card, vintage cut-outs layered **behind and in front of the headline**, orbiting hand-drawn ellipse, black ticker strip. 3-typeface mix (grotesque + Didone italic + mono). | 8/10 | Cut-outs intersecting the headline instead of sitting in grids; orbiting ellipse as a "layer path"; mixed-type headline; one loud bg color + calm card. Needs a clean zone for product screenshots. |
| **History of Collage** (historyofcollage.site — by Boldare) | Editorial exhibition page. Artwork bleeds off the card edge; type-play (script/italic glyphs swapped into a geometric headline); charcoal-olive bg, putty card, one burnt-orange accent. | 7.5/10 | Frame-breaking (object extends past card = "layer"), glyph-swap typography, museum-caption treatment for template showcase. Weak CTA hierarchy — don't copy that part. |
| **La Palatine** (lapalatine.fr — **OFFLINE globally since ~late 2025**: domain parked at CSC registrar IPs, registration active to 10/2027, so owner shut the site down — not geo-blocking. View via Wayback snapshot 2025-11-09: `web.archive.org/web/20251109223914/http://lapalatine.fr/`) | Music ensemble. 5-layer surreal collage hero (marble texture bg → neon rays → classical bust → cut-out photos → engraved accents), 2 accents only (chartreuse + magenta), asymmetric dense-left/airy-right. | 8/10 | Layer count as a visual thesis; 2-accent discipline mapped to CTA; asymmetric balance; material echo (bg texture rhymes with subject). |
| **Passweird** (passweird.com — Figma 2026 maximalism pick) | Joke password generator. 100%-density sticker-bomb collage (halftone, torn paper, white sticker outlines), one calm cream conversion column through the middle, one neon accent used exactly twice (logo + CTA). | 7/10 | "Chaos surrounds, never invades" the conversion path; sticker outlines to make cut-outs read as layers; on-theme excess only (every sticker argues for the product). Gross-out theme obviously does not transfer. |
| **Starface** (starface.world — Figma 2026 vibrant pick) | Skincare brand. Bento grid with black gutters, full saturation, bubble type, 3D product floats, vertical brand spine. | 7/10 (features section only) | Bento feature grid with black gutters; brand spine; gradient panels for "magic moment" sections. Tone is Gen-Z skincare — borrow structure, not voice. |

## Tier 2 — Product/studio pages, collage-adjacent patterns

| Site | What it is | Score | Steal this |
| --- | --- | --- | --- |
| **108 Supply** (108.supply — motion templates for Jitter) | Dark, near-black chrome; media frames float/tilt/stack in black voids; serif+italic headline accents; tiny technical metadata labels. | 8/10 | Floating tilted media cards = layers suspended in a workspace; italic-accent headlines; mono metadata rows ("precision tool" feel). |
| **Aralesk** (aralesk.es) | Collage artist portfolio. 3×3 grid of the same portrait with generated variations (wigs, tints), retro 70s palette, hover-to-play. | 6.5/10 | **Variant grid** = perfect metaphor for AI generations/iterations; muted retro palette; one tile with "HOVER TO PLAY" ghost letter. |
| **Cassia Freire** (portfolio) | 4-col masonry of saturated work on dark chrome, slim sidebar. | 7/10 | Gallery-as-hero = "wall of generated outputs" (Oia community templates section). |
| **Murmure** (murmure.me) | Studio. Ultra-condensed mega type over masonry of work on near-black. | 6/10 | Type scale contrast; dark gallery wall. Tiles never overlap — the anti-pattern for a layering message. |
| **Norgram** (norgram.co) | Studio. Restrained index grid, floating notification card over a black panel, tiny metadata system. | 6/10 | Floating UI card as "layer" proof-of-concept; metadata rows as layer-name annotations. |
| **EST+6** (estplus6.com) | Studio. Full-bleed stone texture, footnote-superscript headline system. | 6/10 | Footnote/annotation motif (evokes layers + edit history); monochrome texture. Flat — no layering message. |

## Verified NOT collage (do not chase)

- travelers-collage.netlify.app — hand-drawn sketch map, near-empty.
- Mindsparkle "collage" tag — motion videos/packaging, not websites.
- Studio Leichtfried — clean archive grid (5/10).
- pixel77 / Designmodo 2013 round-ups — dead or 2013-era.

## Source galleries for continued digging

- Awwwards tag: awwwards.com/websites/collage/ (small, ~6 sites)
- Land-book search "collage" (loose match; thumbnails are analyzable)
- One Page Love tag "collage" (12 sites, mostly 2012–14)
- Dribbble search "collage website" (mockups, good for hero ideas)
- Figma resource-library 2026 trends (La Palatine, Passweird, Starface picks)

## REA teardown — Collage Department (how it's actually built)

Reverse-engineered Oct 2026 via rea (analyze-web-bundle + inspect-web-page + CDP DOM dump).

- **Stack: Tilda** (RU no-code builder), not React/Next. jQuery 1.10.2 + ~20 Tilda modules
  (`tilda-zero`, `tilda-animation-2.0`, `tilda-animation-sbs`, `tilda-slds`, `hammer.js`…).
  51 blocks; the free-form ones are Zero Blocks (`data-record-type="396"`).
- **Collage = plain DOM layering**, no WebGL/canvas: 104 `<img>` — transparent PNG
  cut-outs, hand-drawn SVGs (`Ellipse_*.svg`, `Union.svg`, arrows), animated GIFs as
  cheap loops. z-index stack 1–13, rotations from {-45°, 1°, 45°, 90°}, artboard
  `overflow: visible` so cut-outs bleed past edges.
- **Responsive by duplication**: each Zero Block re-authored per breakpoint
  (`data-artboard-screens="320,480,640,960,1200"`, twin recs with screen-min/max).
- **Motion**: scroll-triggered fades — fadeinup 31, fadeindown 12, fadein 9, zoomin 5,
  fadeinleft/right 6, zoomout 3 — plus 27 step-by-step (`sbs`) chains. The black
  ticker = 3 copies of a ~3000px-wide text strip offset (-2902 / +3206 px) cycling.
- **Type**: custom display font **Kharkiv** on top of an Arial/Roboto stack,
  wired via `--t-headline-font`.
- **Palette (current live)**: ink `#323232`, paper `#f6f6f6`, accent acid lime
  `#dbff00`, pops of lilac `rgb(211,179,251)` / blue `rgb(55,109,255)`.
- **Perf**: Tilda CDN lazyload with 20px LQIP blur-up placeholders (`-/resize/20x/`).

Transferable: the look needs zero exotic tech — absolutely-positioned PNG/SVG
layers + z-index ladder + a few rotation values + per-layer scroll fades + giant
marquee + one acid accent. The craft is the 104 curated cut-outs, not the code.

## Open-source design tools — landing page survey (verified visually, Oct 2026)

How OSS creative tools present themselves (Oia's actual genre). Screenshot-checked:

| Tool | Site | Hero strategy | Score | Key takeaways |
| --- | --- | --- | --- | --- |
| Blender | blender.org | **Artwork-as-hero**: open-movie frame + massive "5.3 Beta" headline + specific tech copy (DLSS, Gaussian Splatting), dual CTA | 8.5 | Output sells the tool; name real tech; quiet chrome, loud canvas |
| ComfyUI | comfy.org | **Real UI as hero**: node graph transforming headphones (before/after), lime-on-black accent, enterprise logo bar (Harman/HP/Lucid/Netflix/Nike) | 8.5 | Interface motifs as design system (node wires); legible before/after = "control"; one ownable accent |
| Theatre.js | theatrejs.com | **Output-as-hero**: demo reel made with the tool, mint accent on key words only, art-deco wordmark | 8 | Avoid their murky paused-frame mistake — hero must look great as static thumbnail |
| Invoke | invoke.ai (NOT invoke.com — parked/for-sale) | **Real screenshot + glow border** cropped at fold; readable real prompt + output on canvas; "Apache 2.0" named; Sponsor CTA | 8 | Trust stack sentence: free + open-source + self-hosted + named license; dot-grid bg = canvas; put accent ON the CTA button (they didn't) |
| Penpot | penpot.app | Weight-contrast headline ("Together."), MCP-server badge above hero, real cropped screenshot, "open-source" bolded inline | 8 | Badge-above-hero for AI/agent hook; single ink color; app-peek pattern |
| Onlook | onlook.com | "The X for Y" identity headline, "free, local-first" trust line, 27k GitHub stars in nav, real UI peeking from fold | 8 | Local-first = privacy pitch; playful project names inside mock UI; download-framed CTA (not signup) |
| Excalidraw | excalidraw.com | **Product IS the landing page** — live canvas, zero signup, hand-drawn brand font embodying output | 8 | One signature font; honest copy builds trust; no popups = the OSS flex |
| tldraw | tldraw.com | **Editor as landing page** — dropped straight into empty canvas | 8 (product) | Dashed-marquee CTA styled as product motif; auth only gates sharing |
| Remotion | remotion.dev | Terminal CTA `$ npx create-video`, GitHub 68k in CTA, dense real screenshot, self-demo ("made with Remotion"), Ask-AI pill | 8 | One-command install = strongest OSS signal; code-file cue in screenshot (EndCard.tsx:49) |
| Krita | krita.org | Mission copy + download button, empty dark hero | 5.5 | Anti-pattern: image tool with no images |

**Genre pattern:** NO OSS design tool uses collage aesthetics — all are restrained
dark/mono with real-product proof. The fancy collage look lives in agency/brand
sites. For Oia: keep the OSS skeleton (real screenshot, trust stack, one accent,
fold-crop) and spend the "fancy" budget on ONE collage gesture — the hero canvas
built from real outputs (Visual Electric pattern).

## AI-native landing pages added Oct 2026 (user-suggested)

| Site | What | Score | Key takeaways |
| --- | --- | --- | --- |
| **Hermes Agent** (hermes-agent.nousresearch.com, Nous Research) | AI agent install page. Deep navy + film grain, engraved classical Hermes with vector line bursts (a real **surrealist-collage language on a dev product**), editorial serif headline + mono labels, terminal install widget with OS tabs, center-logo split nav, one electric-blue accent. | 8.5 | Proves collage-fancy + OSS-credible CAN coexist. Steal: serif/mono tension, grain texture, gradient edge frame, terminal widget with OS tabs, layered-look hero. Avoid: zero product UI (they can afford it, an editor can't), low-contrast small text. |
| **OpenDesign** (open-design.ai — Astro static site, React islands, PostHog; SEO title "Best Open Source Claude Design Alternative") | AI design-agent workspace. Light painterly hero (impressionist sky), classical painting + laptop collage INSIDE the product screenshot, agent log with real timestamps, Figma-style green cursors, "Download + Join Discord" CTA pair. | 7.5 | Steal: show the AI's *work log* with durations (trust device), cursors-as-agents metaphor, Download+Discord CTA pair. Avoid: light text on light background (contrast fail), flat screenshot for a layered product, unverifiable "The First…" claims, demo content contradicting copy. |

Hermes is now the strongest stylistic bridge: same engraving-meets-modern collage
as La Palatine, applied to an OSS/AI product — pair it with Visual Electric's
canvas-as-hero content strategy for Oia.

## REA teardown — Hermes Agent + OpenDesign (Oct 2026)

**Hermes (hermes-agent.nousresearch.com)** — engineering spent on *atmosphere*:

- **Next.js + Turbopack** (`/_next/static/immutable/chunks/turbopack-*`), **Radix UI** (65
  data-state hooks), Tailwind-style utilities, Vercel. Assets on immutable hash CDN dir.
- **Typography system via CSS vars** (the "expensive" look): one **Rules Variable**
  woff2 serving Rules Regular/Condensed/Extended instances; **Rules Gothic
  Condensed/Compressed** (`--font-display` = Rules Gothic Compressed — the big
  headline is a compressed grotesque, not a serif); body/UI = **Aeonik Fono Pro
  TRIAL** (a trial-license font in production!).
- **Film grain = Three.js r185 canvas**: `<canvas class="pointer-events-none fixed
  inset-0 z-101" style="opacity:0.02">` — full-page WebGL noise shader at 2% opacity.
  Plus a cheap fallback: `.hw-noise` SVG feTurbulence data-URL tiled at 12.8rem.
- Motion = CSS keyframes only: fade/slide/blink/spin-slow/gradient-stroke/
  hermes-button-sweep. No GSAP, no scroll-lib. `motion-reduce` respected.
- Hero art = static `hero.webp` engraving + **49 inline SVGs** (line bursts, wings,
  arcs) + 1 looped muted `<video>` demo with webp poster.
- Colors as semantic tokens (--hermes-paper/ink/line → --marketing-dark-*), themeable.

**OpenDesign (open-design.ai)** — engineering spent on *nothing* (speed):

- **Astro, 100% static** — zero app JS on the page (only PostHog/GTM/Cloudflare
  analytics). The entire fancy hero (painting + laptop + agent log) is **one baked
  WebP** (`hero-workspace-v2-1440.webp`). 6 capability `<video>` with webp posters.
- Fonts: **Albert Sans** (free Google variable) + Remix Icon. Accent lime
  `#83ff3b`/`#d8ffb5` + blue `#1A74FF` on `#fafafa`/`#202020` neutrals.
- Keyframes: marquee-x, agent-logo-scroll, **contributor-orbit-spin** (rotating
  avatar ring), blurTextIn, download-sheen/breathe.
- SEO-first title: "Best Open Source Claude Design Alternative" + ecosystem pages
  (/agents/, /skills/, /codex-plugin/, /llm-arena-for-design/).

**Contrast & lesson:** Hermes pays runtime cost for authored atmosphere (grain
shader + type system); OpenDesign pays nothing, bakes everything static — which is
exactly why its screenshot can't show layers. Oia needs a middle path: static
Astro-style base + ONE interactive hero (exploded layers), free variable fonts
(Archivo/Space Grotesk + mono) approximating the Rules pairing.

## Synthesis for Oia (2026 landing page)

1. **Copy the Visual Electric skeleton** (highest-signal reference): hero = Oia
   canvas as moodboard — bundled templates (matcha / festival / skincare) as
   overlapping tiles, one with selection handles, hand-drawn arrows, palette
   strip; accent color sampled from the template imagery.
2. Layer-count discipline from La Palatine (≤5 visual layers, 2 accents).
3. Conversion path from Passweird: one calm column/zone for headline + single
   CTA that the collage never touches.
4. Showcase section = Cassia/108-Supply dark gallery wall (artwork pops on
   near-black), variant grid (Aralesk) for "generate variations".
5. Typography: mixed-type headline (Collage Department glyph-swap), serif/italic
   accents over sans (108 Supply), mono micro-labels as "layer metadata".
