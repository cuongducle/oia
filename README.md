<p align="center">
  <img src="docs/screenshots/overview.png" width="100%" alt="Oia, your words, your visual world. Two generated campaigns: MORI matcha in forest green and FORMA skincare in blush pink, with bold editorial typography.">
</p>

# Oia

**A free, open-source banner studio for marketplace sellers.** Type a sentence, attach your product photo, and get a finished Shopee / Lazada / TikTok Shop banner, then refine the artwork or edit native text layers. Start from a bundled template to change prices without generating another image. Runs on your machine (macOS + Windows), on your own AI provider.

<p>
  <a href="https://github.com/cuongducle/oia/releases"><img src="https://img.shields.io/github/v/release/cuongducle/oia?color=7c5cff&label=release" alt="latest release"></a>
  &nbsp;<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8ef0a6" alt="MIT license"></a>
  &nbsp;<img src="https://img.shields.io/badge/platform-macOS%20%C2%B7%20Windows-f4f1e8" alt="macOS and Windows">
</p>

[Download](#download) · [What you get](#what-you-get) · [Providers](#bring-your-own-provider) · [Agent API](#agent-api) · [Build from source](#build-from-source) · [Landing page](https://oia.solutions/)

---

## Download

**Current release: [v0.6.1](https://github.com/cuongducle/oia/releases/tag/v0.6.1).** Ready-made installers and SHA-256 checksums are on the release page, no account, no signup.

| Build | File | For |
| :--- | :--- | :--- |
| macOS | [`Oia-0.6.1-arm64.dmg`](https://github.com/cuongducle/oia/releases/download/v0.6.1/Oia-0.6.1-arm64.dmg) (~413 MiB) | Apple Silicon (M1 and newer), macOS 13+ |
| Windows | [`Oia-0.6.1-win-x64.exe`](https://github.com/cuongducle/oia/releases/download/v0.6.1/Oia-0.6.1-win-x64.exe) (~400 MiB) | Windows 10/11 64-bit, per-user install (no admin) |

Intel Mac: no build yet; [build from source](#build-from-source) works today.

The builds are unsigned (no signing budget yet), so the first open needs one extra click:

- **macOS:** right-click the app → **Open** → **Open** (or System Settings → Privacy & Security → **Open Anyway**). If macOS says the app "is damaged", run `xattr -d com.apple.quarantine /Applications/Oia.app`.
- **Windows:** SmartScreen shows "Windows protected your PC" → **More info** → **Run anyway**.

Step-by-step with screenshots-level detail: **[oia.solutions/install](https://oia.solutions/install/)**. There is no auto-update channel yet; pick up new versions from the releases page; your projects survive upgrades.

---

## What you get

<p>
  <a href="apps/site/public/assets/studio.webp"><img src="apps/site/public/assets/studio.webp" width="100%" alt="Real Oia desktop editor: MORI artwork on the canvas, a separate shipping-note text layer selected, the Layers panel and native text controls."></a>
  <br><sub><b>A real canvas, not a mockup.</b> The campaign lettering is baked into the image. The selected shipping note is a separate, editable text layer. Click for the full-size screenshot.</sub>
</p>

- **Banners with real typography, from one sentence**: describe the sale like a caption; research and auto-refine agent loops check facts and the rendered copy before you ever export. Every loop is priced before you run it.
- **A layer canvas, not a flat picture**: text, images, shapes and your uploads are separate objects. Move the headline without touching the photo; fix a price without regenerating. Outline edits and object edits cost zero images.
- **35 bundled templates, eight categories**: flash sale, new product, livestream, menu, social post, presentation, poster and overlay. Includes Swiss and Editorial collections, plus café, product-launch and Tết packs. All 30 Studio compositions include real subject or background imagery; the five compositing graphics keep their transparent canvases. Opening a template and editing native text use no AI quota.
- **Marketplace sizes built in**: Shopee / Lazada / TikTok Shop squares, TikTok 9:16, livestream overlays with safe zones, posters, decks, A4.
- **Export anywhere**: PNG, JPG, PDF (mixed page sizes), PPTX, ZIP of page images.

<p>
  <img src="apps/site/public/assets/mori-comparison.webp" width="100%" alt="MORI reference-image edit: the 20% OFF offer becomes 30% OFF, retaining the matcha campaign's composition, typography and lighting style.">
  <br><sub><b>Change the offer. Keep the visual direction.</b> Two real image outputs, one reference-image edit apart (about 1 image). Fine image details can change; repaint is not a pixel lock. MORI and FORMA are fictional campaign examples, not bundled-template previews.</sub>
</p>

### Your product photo, a campaign to build around

<p>
  <img src="apps/site/public/assets/still-product.webp" width="49%" alt="Product reference: a fictional STILL coffee bag on a neutral background.">
  <img src="apps/site/public/assets/still-campaign.webp" width="49%" alt="A warm coffee campaign generated using the STILL product image as a reference.">
  <br><sub>Two actual image-channel outputs. STILL is fictional and the reference photo is AI-generated. Packaging details can change; this pair is not a full Oia research/auto-refine run.</sub>
</p>

### Real artwork, ready to make yours

<p>
  <a href="apps/site/public/assets/templates/studio-swiss-flashsale.webp"><img src="apps/site/public/assets/templates/studio-swiss-flashsale.webp" width="32%" alt="Actual bundled Clearance 50% Swiss template with sneaker photography and editable sale typography."></a>
  <a href="apps/site/public/assets/templates/studio-ed-menu.webp"><img src="apps/site/public/assets/templates/studio-ed-menu.webp" width="32%" alt="Actual bundled Morning Rituals editorial café menu, with native menu text, a pastry and a flat white."></a>
  <a href="apps/site/public/assets/templates/studio-tet-swiss.webp"><img src="apps/site/public/assets/templates/studio-tet-swiss.webp" width="32%" alt="Actual bundled Tết sale 50% Swiss template, with red silk, gift-box photography and editable Vietnamese offer text."></a>
  <br><sub>Actual v0.6.1 scenes, rendered with the desktop canvas engine. AI-generated photography and native text layers, not promotional mockups. Click a preview for the full composition.</sub>
</p>

[Browse all 35 templates](https://oia.solutions/templates/) · [Café pack](https://oia.solutions/templates/packs/cafe-restaurant/) · [Product-launch pack](https://oia.solutions/templates/packs/product-launch/) · [Tết pack](https://oia.solutions/templates/packs/tet-sale/)

### How a banner happens

1. **Describe it**: “matcha campaign, 20% off today”, pick a marketplace size. The full cost (`up to N images + N reads`) shows before you run.
2. **Approve the outline**: multi-page plans land as an outline first; editing it is free.
3. **Make it yours**: repaint by asking, or edit objects directly. AI edits show a preview first; you apply only what you keep. Your own layers are never deleted by AI refinement.
4. **Export**: marketplace sizes, overlays, decks; PDF/PPTX included.

### Text: baked by default, editable on demand

Generations render the copy into the artwork for the best-looking typography. Two paths keep text editable: flip **“Editable text right away”** before generating (clean-plate artwork + native text layers), or select a baked design and click **“Make text editable”** (up to 1 image + up to 6 reads on dense artwork; font matching runs locally). Once rebuilt, retyping text uses no image quota. Recovered single-line boxes grow while typing without changing font size; explicit line breaks still work.

<p>
  <a href="apps/site/public/assets/templates/studio-ed-menu.webp"><img src="apps/site/public/assets/templates/studio-ed-menu.webp" width="49%" alt="Original Morning Rituals template with the Cardamom knot price set to 42,000 dong."></a>
  <a href="apps/site/public/assets/templates/menu-price-edited.webp"><img src="apps/site/public/assets/templates/menu-price-edited.webp" width="49%" alt="The same template after a native text edit changes only the Cardamom knot price to 46,000 dong."></a>
  <br><sub><b>Template editing, no generation.</b> Only the price changed from 42.000₫ to 46.000₫; the background artwork is unchanged. These are real scene renders, not a demonstration of extracting text from a flat image. Text reconstruction is a separate paid operation; fonts are approximate, OCR needs checking, and erased regions can change.</sub>
</p>

### Livestream offers, with room for the controls

Three portrait presets (1080 × 1920) cover flash-sale prices, freeship and a **static** countdown frame. Two landscape overlays (1920 × 1080) add a host introduction or a shop offer. All five keep their transparent canvases for compositing over your own video. Safe-zone guides stay in the editor, not the exported artwork. TikTok zones are community-measured, not an official platform specification. [Livestream workflow](https://oia.solutions/use-cases/livestream-overlays/).

---

## Bring your own provider

| Role | Provider | Setup |
| :--- | :--- | :--- |
| Image | `codex` | Bundled Codex CLI + ChatGPT login (recommended, zero-setup) |
| Image | `openai` | `OPENAI_API_KEY` (generations and edits with reference images) |
| Image | `fal` | `FAL_KEY` |
| Image / planner | `mock` | Testing fallback; no credentials, no real artwork |
| Planner | `codex` | Same ChatGPT login, text-only `codex exec`, structured plan |
| Planner | `openai` | `OPENAI_API_KEY` |

The desktop UI exposes ChatGPT login and mock mode, not an OpenAI/fal API-key form. The other adapters are code-level integrations, not a promised desktop onboarding flow.

A mixed mock/real pair (mock planner feeding a real image channel) refuses to boot, canned plans never ride a real generation channel silently.

**Local does not mean generation is free:** generations consume your ChatGPT plan allowance or bill through your own API account. Every action shows its price before it runs. Prompts and images go to the provider you configure.

For Vietnamese sellers the loop works end to end in Vietnamese: describe the banner in Vietnamese, the planner reads price/date/name out of the request, attach the real product photo as a reference image, export at marketplace sizes, the banner copy renders with full Vietnamese diacritics.

---

## Agent API

The desktop app runs a loopback HTTP API on `127.0.0.1` (random port) for coding agents:

1. Open the app → **For agents** → create an API key (shown once).
2. Set `OIA_BASE_URL` / `OIA_API_KEY`, or do nothing: the bundled skill scripts read the discovery file (`agent-api.json` in the app's user-data directory) themselves.

```bash
curl -X POST "$OIA_BASE_URL/api/tasks/generate-poster" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${OIA_API_KEY}" \
  -d '{"prompt":"A minimal coffee campaign poster"}'
```

Responses use a `{code, data, msg}` envelope; poll `GET /api/tasks/{id}` for the result (24-hour TTL). Quota is protected: one metered generation in flight, per-key rate limits, every agent job labeled in the app's job feed. Installable agent instructions live in [`packages/skills/skills`](packages/skills/skills).

---

## Build from source

Requires Node.js 22 and pnpm 10.

```bash
git clone https://github.com/cuongducle/oia.git
cd oia
pnpm install
pnpm exec turbo run build --filter='./packages/*'   # packages before apps
pnpm --filter @oia/desktop dev                      # run the desktop app

# gates
pnpm build && pnpm test && pnpm typecheck

# installers (build each platform on its own OS; unsigned)
pnpm --filter @oia/desktop dist:mac        # .dmg (fetches the pinned Codex CLI first)
pnpm --filter @oia/desktop dist:win        # NSIS .exe, per-user
```

```text
apps/desktop         Electron app: main + utility process, renderer (React), shared IPC contracts
packages/schema      Shared validation and scene schemas
packages/protocol    Stream decoder and message markers
packages/providers   Image and language-model adapters (CLI + process-host)
packages/agent       Planning and streamed scene generation
packages/canvas      Canvas utilities, page handling, export planning
packages/tasks       Task processing, stores, files, projects, templates
packages/services    Chat orchestration, quota, context
packages/skills      Coding-agent instructions (consumer of the loopback API)
site/                Landing page (static, no build step) → oia.solutions
```

---

## Contributing & limits

MIT license, explore the code, adapt the studio, and contribute through [issues](https://github.com/cuongducle/oia/issues) or pull requests. Verification notes for editor/export behavior live in [`docs/verification/`](docs/verification/).

Known boundaries, so nothing surprises you:

- **Artwork is raster**: object edits don't repaint pixels inside an image; reference-image support varies by provider.
- **Local tool prerequisites**: background removal needs `rembg`. Local SAM 3 layer splitting is a preview: the real-model desktop end-to-end gate is still open, so no marketing result is shown for it yet.
- **Model licenses are separate from the MIT code license**: the bundled Lens font recognizer has a non-commercial restriction. Commercial use of that component requires the author's permission or removing/replacing it. Check model notices before commercial distribution.
- **Storage is local**: projects live in the app's data directory with atomic writes; there is no cloud sync (by design).
- **macOS builds are Apple Silicon only** for now.
