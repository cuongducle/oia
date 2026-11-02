<p align="center">
  <img src="docs/screenshots/banner.png" width="100%" alt="Oia — Generate the image. Keep the control. Three real studio templates: matcha, music festival, and botanical skincare.">
</p>

<p align="center">
  <strong>Open image agent. Generate artwork. Edit the composition. Make it yours.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#what-editable-actually-means">How layers work</a> ·
  <a href="#bring-your-own-provider">Providers</a> ·
  <a href="#build-it-into-your-workflow">API & agent skills</a> ·
  <a href="https://cuongducle.github.io/oia/">Landing page</a> ·
  <a href="LICENSE">MIT license</a>
</p>

---

## Good images are a starting point. Finished designs need control.

A campaign headline changes. An event date moves. A client wants the logo larger. These are layout and copy edits—not reasons to generate a whole new image.

**Oia is a desktop app (macOS + Windows) that pairs AI image generation with a real, layer-based canvas.** Combine generated artwork with editable text, shapes, and your own assets. Refine the composition by hand, keep multiple pages in one project, and export the result without leaving the studio.

Everything runs on your machine. Bring your own supported provider. Keep your projects under your control.

## What editable actually means

<p align="center">
  <img src="docs/screenshots/editor.png" width="100%" alt="Real Oia editor with the Matcha Every Day headline selected as a native text object. Selection handles, text-formatting controls, page thumbnails, and export are visible.">
  <br>
  <sub>Actual editor, bundled Matcha template. The selected headline is a text object—not lettering baked into the photograph.</sub>
</p>

**The image and the design are different things.** An Oia document contains separate canvas objects:

| Object | What you can change |
| :--- | :--- |
| **Text** | Rewrite copy, adjust size, weight, color, alignment, and spacing |
| **Images** | Move, resize, rotate, reorder, or replace artwork and uploaded assets |
| **Shapes & additions** | Add graphic elements, tables, drawings, and more text |
| **Artboard** | Set document dimensions independently for each page |

Move a native headline without moving the photograph. Fix its wording without calling an image model. Duplicate a page and adapt the copy for another placement. Undo changes and let autosave preserve the project.

> **Layers, not magic image decomposition.** Oia does not turn every object or letter inside a generated image into an editable layer. Generated scenes currently contain an artwork image and, when supplied by the planner, a separate copy textbox on the first page. Bundled templates include more deliberately composed text and shape objects. Text already embedded in the artwork remains pixels.

## A studio around your image model

### 01 — Generate a starting point

Describe the visual, choose dimensions and page count, and follow the streamed generation progress. Use a supported image provider for real artwork, or explore the editor with the keyless mock provider and bundled templates.

### 02 — Make the design yours

Edit native objects directly on the Fabric.js canvas. Add your own images and copy, adjust the stacking order, use undo/redo, and work across pages with different dimensions. Save projects locally through the app, reopen them, or publish an editable template.

Brand Kit stores brand information; its written guidance is passed to the generation planner. It is a prompt aid, not a guarantee that every font, logo, or color will be applied automatically.

### 03 — Take it into production

Export **PNG, JPG, PDF, PPTX, or a ZIP of page images**. PDF preserves mixed page sizes. PPTX places rendered artwork on slides; it does **not** convert canvas layers into native PowerPoint text and shapes.

The Toolbox also brings together format conversion, image resizing, chart creation, and provider-backed image tasks.

## When to use this instead of an image chat

**Use an image chat when the image itself is the deliverable. Use Oia when you also need to assemble, revise, and reuse a design.** It adds a workflow around image models—not a claim of a better underlying model.

| Your task | With an image-only result | With Oia |
| :--- | :--- | :--- |
| Change a headline or event date | Edit the image or regenerate it | Edit the native textbox, if the copy is a separate layer |
| Move a logo or adjust a composition | Open a separate editor | Work on canvas objects in the same studio |
| Organize a multi-page project | Manage separate outputs | Keep pages, dimensions, and revisions in one project |
| Reuse a layout | Rebuild it or reuse a flattened image | Save and share an editable scene as a template |
| Deliver files | Convert and assemble them elsewhere | Export images, PDF, PPTX, and ZIP from the editor |
| Automate recurring tasks | Depends on the service and its API | Use the local agent API and coding-agent skills |

**Non-destruction guarantee:** AI refinement never deletes your own layers. Objects you add (uploads, product photos, hand-placed text, tables) are stamped `origin: "user"` and survive every AI refinement on top of the regenerated scene — position intact. Layer objects without provenance (legacy projects) default to the same protection. Removing them is a manual, explicit act.

## Quick start

**Requirements:** Node.js 22 and pnpm 10. macOS or Windows. No provider key, database, or broker is needed to explore the default local setup.

```bash
git clone https://github.com/cuongducle/oia.git
cd oia
pnpm install

# Build the workspace packages before starting the desktop app.
pnpm exec turbo run build --filter='./packages/*'
pnpm --filter @oia/desktop dev
```

Start with a bundled **Sample** project (seeded on first run) to try real text and object editing. The default mock provider is for testing the workflow; it does not generate production AI artwork.

**Real generations:** the app bundles a pinned Codex CLI binary, so the recommended keyless path is zero-setup — open **Runtime** in the app, sign in with ChatGPT, and generate against your plan quota. No API key required. Alternatively set `IMAGE_PROVIDER`/`LLM_PROVIDER` (see `.env.example`) to use OpenAI or fal keys.

> Installers are not published yet. You can build one yourself — no signing, no notarization. Build each platform on its own OS:
>
> ```bash
> pnpm --filter @oia/desktop dist:mac        # macOS: .dmg (fetches the pinned Codex binary first)
> pnpm --filter @oia/desktop dist:mac:dir     # macOS: quick dist/mac-arm64/Oia.app
> pnpm --filter @oia/desktop dist:win        # Windows: dist/Oia-<version>-win-x64.exe (NSIS, per-user, no admin)
> pnpm --filter @oia/desktop dist:win:dir     # Windows: quick dist/win-unpacked/Oia.exe
> ```
>
> The builds are unsigned (deliberate — no signing budget yet). On macOS, a build **downloaded** from GitHub carries a quarantine flag, so on first open right-click the app → **Open** → **Open** (or System Settings → Privacy & Security → "Open Anyway") to pass Gatekeeper. On Windows, SmartScreen shows "Windows protected your PC" → **More info** → **Run anyway**. The Windows installer puts the app in `%LOCALAPPDATA%\Programs\Oia`; projects live in `%APPDATA%\Oia` and survive uninstall and upgrade. There is no auto-update channel until signing exists — pick up new versions from the releases page.

## Bring your own provider

The **provider registry** implements:

| Role | Provider | Setup |
| :--- | :--- | :--- |
| Image | `mock` | Default when no runtime is ready; no credentials (labeled **"Chế độ thử nghiệm"** in the UI) |
| Image | `codex` | Bundled CLI with image generation available and an authenticated ChatGPT login |
| Image | `openai` | `OPENAI_API_KEY` (generations **and** edits with reference images; one pinned model) |
| Image | `fal` | `FAL_KEY` |
| Planner | `mock` | Default; no credentials |
| Planner | `codex` | Same Codex login — text-only `codex exec`, structured plan, no API key |
| Planner | `openai` | `OPENAI_API_KEY` |

A mixed mock/real pair (for example a mock planner feeding the real Codex image channel) **refuses to boot** — canned planner output never rides a real generation channel silently.

For Vietnamese sellers this enables the banner loop end to end: describe the banner in Vietnamese → the planner reads price/date/name out of the request (editable text blocks, font Be Vietnam Pro) → clean-plate artwork (no baked text) is generated through your ChatGPT plan quota → attach the real product photo as a **reference image** (`codex exec -i`) so the scene is built around the actual product → export at marketplace sizes (Shopee / Lazada / TikTok Shop presets).

Codex image generation depends on CLI support and account access, and consumes the applicable account allowance. Other paid providers bill through your own account. **Local does not mean generation is free.** Provider names beyond the implemented registry should not be treated as working integrations.

## Build it into your workflow

The desktop app runs a **loopback agent API** bound to `127.0.0.1` (random port). The port is published in a discovery file `agent-api.json` (mode 0600) under the app's user-data directory (`~/Library/Application Support/Oia` on packaged macOS, `%APPDATA%\Oia` on Windows).

1. Open the app → **For agents** → create an API key (shown once).
2. Point an agent at it — either set `OIA_BASE_URL`/`OIA_API_KEY`, or do nothing: the skill scripts read the discovery file themselves (a stale file whose PID is dead is skipped).

```bash
curl -X POST http://127.0.0.1:<port>/api/tasks/generate-poster \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${OIA_API_KEY}" \
  -d '{"prompt":"A minimal coffee campaign poster"}'
```

The default submission returns a task ID; poll `GET /api/tasks/{id}` for the result. Responses use a `{code, data, msg}` envelope. Task records have a 24-hour TTL. When the app is closed the server goes away — agents get `ECONNREFUSED`.

Quota is protected: at most one metered generation in flight, per-key rate limits on submissions, and every agent-created job is labeled in the app's job feed so you can see who is spending your quota.

Installable instructions for coding agents live in [`packages/skills/skills`](packages/skills/skills).

<details>
<summary><strong>Development, tests, and project structure</strong></summary>

```bash
pnpm build && pnpm test && pnpm typecheck     # gates (turbo)
pnpm --filter @oia/desktop smoke              # happy-path e2e (mock pair, real Electron)
pnpm --filter @oia/desktop crash-smoke        # error-path e2e: kill services → self-heal
pnpm --filter @oia/desktop shot               # visual verification → out/*.png
node config/audit/desktop-audit.mjs           # dependency gate for the shipped tree
```

The repository includes unit and integration coverage for the editor utilities, stream protocol, providers, task processing, persistence, and the loopback API. See the [verification notes](docs/verification/) for recorded editor, export, and parity checks.

```text
apps/desktop         Electron app: main + utility process, renderer (React), shared IPC contracts
packages/agent       Planning and streamed scene generation
packages/canvas      Canvas utilities, page handling, and export planning
packages/providers   Image and language-model adapters (CLI + process-host)
packages/protocol    Stream decoder and message markers
packages/schema      Shared validation and scene schemas
packages/services    Chat orchestration, quota, context
packages/tasks       Task processing, stores, files, projects, and templates
packages/skills      Coding-agent instructions (consumer of the loopback API)
site/                Landing page (static; deployed to GitHub Pages)
```

</details>

## Landing page

The marketing site lives in [`site/`](site/) and is deployed at **[cuongducle.github.io/oia](https://cuongducle.github.io/oia/)**.

```bash
cd site && python3 -m http.server 8765    # → http://localhost:8765
```

No build step: `index.html` + `styles.css` + `main.js`. Pushes to `main` that touch `site/**` redeploy automatically via [`.github/workflows/landing-pages.yml`](.github/workflows/landing-pages.yml). Design references and the QA ledger are kept in [`concept/SPEC.md`](concept/SPEC.md) and [`docs/designs/collage-references.md`](docs/designs/collage-references.md).

## Current boundaries

- **Local storage.** Projects and assets live in the app's data directory as per-project files (atomic writes; a corrupt file never takes the whole library). Import from a legacy web-app `.data` folder via Workspace → **Import from web app**.
- **Artwork remains raster.** Object-level canvas edits do not edit pixels inside the underlying image. Reference-image support also varies by provider.
- **Some tools need extra setup or are unfinished.** Background removal requires `rembg`. PPT Translator is a landing page; the translation task is not implemented yet.
- **Your provider remains involved.** Prompts and images used for generation go to the configured provider. Running locally does not make external model calls private to your machine.

## Open source

Oia is released under the [MIT license](LICENSE). Explore the code, adapt the studio to your workflow, and contribute through [issues](https://github.com/cuongducle/oia/issues) or pull requests.
