# English studio refresh — verification

## Automated checks

- `pnpm typecheck`: 15/15 tasks passed.
- `pnpm build`: 9/9 tasks passed, including production Next.js compilation, type validation, and static page generation.
- `REDIS_URL=redis://:oia@127.0.0.1:6379 pnpm exec turbo run test --force`: **152 passing tests** across seven packages, including real Redis/worker integration and authenticated Codex image generation. A subsequent cached run also passed after the final UI-only edits.
- Added tests cover English document/default locale, legacy Vietnamese preference fallback, English validation messages, Vietnamese UI-string regression scanning (AST, excluding comments/user data), artboard dimensions, zoom-independent insertion, resize/text history events, editable templates, filtering, and first-save scene preservation.
- Strengthened the presentation integration test: inspect PPTX embedded image files, not just the outer ZIP signature. It failed against the old processor and passes after embedding real image bytes.
- `git diff --check`: clean.

## Real Chrome checks

Browser automation used the logged-in Chrome extension through `bsk`. Screenshots were taken after observing the page and checking loaded fonts/rendered previews.

### Layout

- Desktop: **1536×1024**, DPR 1. Home, Toolbox, Brand kit, For Agents, developer docs, poster skill, Workspace, editor, and shared project inspected.
- Phone emulation: **390×844**, DPR 1, touch. Home, Toolbox, Brand kit, For Agents, and editor inspected. Document scroll width remained equal to viewport width on these routes.
- Corrected the mobile Studio header’s oversized privacy note and a composer action wrapping onto a separate line. Re-captured the corrected state.
- Corrected the API-key form’s narrow name field and empty table overflow; separated the empty state from the actual data table.
- The AI dock starts closed on a fresh phone editor load. Canvas, rail, page actions, and export remain visible.
- All four curated Home previews rendered full editable scenes. Shared page 2 initialized after scrolling into view, as intended.
- The exploratory URL `/tools/chart-generator` returned an expected 404; the actual route `/tools/bar-graph-maker` was then inspected and its Create chart action reached “Your file is ready.” The observed debug recording contained this exploratory 404, not a script exception on an exercised product route.

### Editor workflow

- Opened the Matcha template from Home, waited for autosave, renamed it, and inspected persisted API data: **five layers at 900×1200**, not the blank 1360×2048 page produced by the old create endpoint.
- Added a heading: six objects. Undo returned to five; redo returned to six; undo restored the original design.
- Duplicated the page, resized page 2 to **1920×1080**, and switched back to page 1. Persisted API data retained both pages’ distinct sizes and five layers each.
- Reloaded the project in the final production build; the title, artwork, native typography, and two-page structure remained intact.
- Opened the export dialog; Shift+Tab from the first control wrapped to Download rather than escaping the modal.

### Actual downloads

- **PNG:** inspected the downloaded file; exactly **900×1200**, with photograph and rendered typography intact.
- **PDF:** downloaded two pages with different aspect ratios. Final PDF MediaBoxes are **675×900 pt** and **1440×810 pt**, correctly representing 900×1200 and 1920×1080 pixels at 96 DPI.
- **PPTX:** opened the downloaded ZIP structure: two slide XML files and two nonempty embedded PNG files (approximately 1.58 MB and 1.37 MB). Different artwork aspect ratios are fitted, not stretched.
- After export, the live canvas retained five objects, its original zoom, and its original viewport dimensions. Export uses a separate StaticCanvas and cannot feed transient export pages into autosave.

## Evidence

`evidence/` contains actual desktop and phone captures. `concept-home.png` and `concept-editor.png` are design targets, not screenshots of implemented functionality. The original generated background artwork lives in `apps/web/public/studio/`.

## Limits and honest availability

- This was not an exhaustive accessibility or cross-browser certification. Phone checks were Chrome emulation, not physical iOS/Safari testing.
- Not every quick-tool file type, network interruption, or concurrent editing race was retested in Chrome. Existing integration tests are not a substitute for those manual workflows.
- Background removal requires the documented external processor. PPT Translator remains an explicitly marked coming-soon tool.
- The running preview uses `IMAGE_PROVIDER=mock` to make interaction testing deterministic. Real Codex generation passed its separate authenticated integration test; BYOK/provider deployment still requires the appropriate environment configuration.
- Existing user-authored Vietnamese project names and conversation text are intentionally preserved. The application interface, curated examples, accessibility labels, and exposed skill examples are English.
- Two blank projects created during the first-save regression investigation were removed; pre-existing projects and conversations were not deleted or renamed.
