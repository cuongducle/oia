# Oia landing concept: spec (final, v7)

Formula (from docs/designs/collage-references.md):
skeleton = Hermes Agent · hero content = Visual Electric · OSS trust = Invoke/Remotion.
Concept built WITHOUT Image Gen (unavailable in this environment), replaced by a
reference-comparison QA loop mandated by the user: screenshot → vision review vs
the collected reference corpus → fix → repeat.

## Stack (libraries, per user requirement)
- GSAP 3.12 + ScrollTrigger, entrance timeline, scroll reveals, hero depth parallax
  (each collage layer moves at a different speed = the layer metaphor), pinned
  "explode layers" scrollytelling
- Draggable (GSAP), hero canvas tiles are actually draggable, bring-to-front on
  grab ("the product is the demo")
- Lenis, smooth scroll (integrated with ScrollTrigger)
- SplitType, char-stagger headline entrance
- Three.js r128, full-page WebGL film-grain shader canvas @ 7.5% opacity
  (exact recipe lifted from the Hermes REA teardown)
- No framework, single static file (OpenDesign lesson: static-first)

## Tokens
- bg #0e0d1f ink-violet · band #0b0a18 · paper #f4f1e8 · muted #b3afcc
- ONE accent: Oia violet #7c5cff, spent ONLY on: primary CTA + selection system
  (handles, dashed text-layer border, token chips, spinner tip) + violet arrow @65%
- Type: Anton (compressed display) / Archivo (body) / JetBrains Mono (metadata), free stand-ins for Hermes' Rules/Rules Gothic/Aeonik Fono
- Marquee ticker (Collage Dept steal) between hero and layers

## QA loop ledger (vision-reviewed vs reference corpus)
| Round | Score | Key fixes made |
|---|---|---|
| v1 | 6.0/10 | baseline, purple overuse, orphaned palette tile, festival tile sliver, stray dashed line, staircase headline, no visible grain, tiles melting |
| v2 | 8.0/10 | accent reduced, tiles interlocked + 4th tile added, dashed line killed, headline recut, grain raised, layer-chip collision fixed |
| v3 | 8.5/10 | grain visible, matcha left-edge lifted, arrow reversed (prompt→layer), headline cream, value-prop bolded, hover-select added |
| v4 | 7.0/10 full-page | orphan word in h2 (fixed via text-wrap:balance), muted layer lifted ~15%, hero de-clutter, workflow log rows aligned, duplicate copy reworded |
| v5 | 7.0/10 (new reviewer) | library stack added; flagged: arrow wrong target, blank text tile |
| v6 | 7.5/10 | arrow re-terminated, board caption cleared, real "text layer" card, coarser grain |
| v7 | **8.7/10 hero, SIGNOFF YES** | caption collisions resolved, prompt card cleared text card, arrow violet @65% |
| mobile | **96/100** | chips hidden on touch, tiles re-inset, trust-line token wrapping, tap targets bumped |
| copy-diet v8 | **9.0/10 · SIGNOFF YES** | "visuals tell the story" pass: all body paragraphs removed (~65% less text), hero sub, layers paragraph (→ chip row), gallery sub, workflow paragraphs (→ heading + telemetry), OSS cell bodies, footer to one line. 3 nits fixed: chips visible pre-pin, trust-line emphasis, micro-label contrast bump |
| motion v11 | **motion + seamlessness round** | GSAP everywhere: idle-float per tile image, mouse-parallax on canvas UI chrome, custom cursor (dot+ring), scroll progress hairline, chapter rail (01-05 narrative spine), headline x-drift, gallery curtain reveal + odd/even column parallax, editor-frame clip reveal + hover tilt, workflow slide-in, terminal line-by-line boot. Seamless bands (gradients replaced hard borders). Fixed: .reveal×gsap.from opacity conflict (from-tween captured CSS 0 as end value → animated 0→0), missing #hero id, ScrollTrigger.refresh on load+fonts. "Fog above tile tops" investigated and cleared: baked-in poster artwork, not a rendering bug. |
| video QA v4 | **9.2/10 motion signoff** | video comparison loop (user-mandated): captures failed while tab was occluded (Chrome stops painting background tabs, timers ran, paint froze). Fix: `bsk tab select` foreground before recording. Take 4 (foregrounded): scroll 100% continuous, scrub smooth, entrance 9/10, cursor sweep 9/10, drag 10/10, terminal lands. Applied final fix: explode separation amplified (±170-190px, ±6-8°), verified unmistakable. Capture recipe in SPEC: scrollRestoration=manual, scrollTo(0,0) pre-record, synthetic mouse for drag, 35-55px scroll steps. |
| video compare vs Hermes | **Oia 9.2 vs Hermes 6.5** | Hermes video benchmark: aesthetic motion 10/10 (grain integrated into artwork, signal-distortion art) but kinetic/interactive 3/10 · flat native scroll, no entrance choreography, no pinning/parallax, static terminal widget. Oia wins choreography + interactivity (drag/pin/curtain/cursor); borrowed from Hermes: grain bumped 7.5%→9% (verified tactile, text stays crisp). Remaining gap to Hermes: their grain distorts *inside* the artwork (shader displacement), ours is an overlay; grain scale could go finer. |
| v0.2 sync | **content refresh, vision QA loop (bsk), 2026-11-02** | Landing synced to shipped UI v1.1 / v0.2.0: hero prompt chip = composer vocabulary (size pill `Shopee 1:1 · 2K` + brand pill + `≈ 1 image` cost), telemetry = RunSteps (planning › painting › composing + cost row); ticker 9 items incl. livestream overlays / preview-apply / outline-first; workflow 3 → 4 steps (adds REVIEW outline + replace-one-layer); new `#bring` section (deconstruct B1, `≈ 1 image + 1 read`); templates section carries the livestream-overlay frame (safe zones C3); editor/overlay/deconstruct frames are real v1.1 screenshots (`apps/desktop/out`, 1600w webp 36-71 KB); JSON-LD 0.2, MAC + WINDOWS in trust line. Fixes found by the loop: ① prompt-card/tile/arrow collisions at short viewports (cards grew taller, 3 geometry rounds: t-persp bottom 26%, chip-log top 17%, chip-prompt bottom 3% + one-line prompt, arrow right 25%/bottom 28%, cap got chip backing); ② **pre-existing bug**: `.editor-frame.in` clip `inset(0)` hid every caption hanging at `bottom:-26px` (old qa-shot 4 confirms) → now `inset(0 0 -32px 0)`, all 3 captions verified visible. qa-shots regenerated at 1600w + new `6-bring.png`. Capture lessons: agent window defaults to 960 CSS px = exactly the mobile breakpoint (resize to 1680×1050 first); bsk context goes stale after every action, sync before each scroll/shot; full-page capture needs a visible tab. |

## Intentional deviations / known notes
- "KEEP THE CONTROL." kept verbatim, Oia's own README tagline.
- Collage edge-bleed on mobile is intentional aesthetic (verified pass).
- OSS terminal line may clip on narrow screens (cosmetic, logged).
- GitHub href="#", real repo URL pending.
- Assets are the product's real templates (matcha/festival/botanical/perspective
  + real editor screenshot), repetition across sections is honest, not lazy.

## Run
cd concept && python3 -m http.server 8765 → http://localhost:8765
| D16 frames round | **content, real generations, owner-directed** | Landing follows D16 (baked text default): hero chip English, workflow frame = the live-verified 20%→30% repaint (same glossy 3D style), #bring retitled twice ("Beautiful baked text. Still editable." → "Change the price. Keep the style.") after owner rejected the editable-after frames (flat text reads ugly; SurgePix never shows such a state). Lessons: sequence shots BEFORE destructively editing the demo project (2 images wasted re-staging); cache-bust img src (?v=) on every asset swap, HTML max-age=600 otherwise lies to returning visitors. |
| SEO surface | **static SurgePix pattern, prompts/templates/use-cases/FAQ** | /prompts/ (18 curated, copy buttons), /templates/, 3 keyword use-case pages, homepage FAQ + FAQPage JSON-LD, sitemap ×6 URLs, pages.css zero-CDN. Self-review caught an honesty bug same day: title claimed "18 tested" while only 3 are verified, fixed in #27 (curated + tested-marked). qa-shots later removed from the deploy (25MB, og:image moved to assets/og-hero.png). |
| P0-P2 self-review fixes | **product quality, the teardown list executed** | #28 shared pollTask (2 verbatim copies → 1 DI lib + 6 error-path tests), honest late-stop notice, poster-blocks drop warning (was silent copy loss); #29 structured editMode contract (agent-layer clauses, planner-proof) + variant target binding (TOCTOU gate); P2 pathOf (local-path refs, no base64 round-trip, no leaked abs paths, pinned byte-for-byte via fs.readFile) + site hygiene (one 960px media block, ticker JS-cloned single source, FAQ schema DOM-derived, ld:6 dom:6 sync:true). Decisions recorded in docs/designs/selection-bound-edits.md. |
