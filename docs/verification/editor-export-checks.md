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

## Stage-0 remediation checks (2026-10-30, real Chrome + live codex)

Environment: macOS, codex-cli 0.163.0 logged in (`IMAGE_PROVIDER=codex LLM_PROVIDER=codex`, fresh `OIA_DATA_DIR`, no Redis), production `next start` on :3100, Chrome via browser-skill.

**Real Codex flow (one quota-billed run):**
- Prompt "banner trà sữa giảm 20% ngày 8/11" (clean-plate default ON) → planner + one image turn (~40 s); the stored project contains `block:headline "TRÀ SỮA"`, `block:discount "GIẢM 20%"`, `block:date "NGÀY 8/11"` as separate editable textboxes, artwork as `/api/files/<key>` (asset ref, origin "generated").
- `/api/provider/status` quota counters moved 0 → {planner: 1, image: 1}; chip visible on Home.
- Home → "Open editor" hands off by projectId; editor loads the project by id.

**Stop control (found and fixed a real bug in this pass):**
- First attempt: pressing Dừng killed the CLI tree (0 orphan `codex exec` processes, image counter unchanged) but the client aborted its own stream reader before the terminal event arrived — the seller never saw the cancelled message. Fixed: Stop calls only the cancel API; the server emits the terminal `cancelled` event and closes the stream. Re-verified in Chrome: alert shows "Đã dừng tạo ảnh theo yêu cầu." and no orphan processes remain.

**Mock labeling:** restarted with the default mock pair — the status banner reads "Chế độ thử nghiệm — ảnh placeholder, không phải AI thật".

**Marketplace presets:** editor Settings → Recommended Size shows Shopee Product (1:1) 1024×1024, Lazada Product (1:1) 800×800, TikTok Shop Product (1:1) 1080×1080 (existing TikTok 9:16 intact).

**CI:** GitHub Actions green on the remediation commit (1m53s).

**Limits:** one real generation per pass (quota); stop verified twice on macOS only (Windows remains gated to the desktop design per the Stage-0 doc).


## Desktop shell D2 — remediation checks (2026-10-30, real Electron window)

The first D2 pass shipped with a green event-stream smoke but a canvas that could not
display artwork — nobody had opened the window. The fix pass added visual verification
(`OIA_DESKTOP_SHOT=1`: real window → chat through the bridge → DOM + painted-pixel
assertions → PNG capture) and it found, in order:

1. `/api/files/<key>` scene srcs are same-origin on the web but dead under `file://` —
   fixed with the privileged `oia://files/<key>` protocol serving the LocalFileStore.
2. The sandboxed preload was silently dead: `require("@oia/services")`/`require("zod")`
   got externalized (sandbox allows only electron) and `"type":"module"` made a `.js`
   preload load as ESM (unsupported sandboxed). Channels are now pure data, schemas are
   main-only, preload emits `.cjs`.
3. Even with the protocol working, every scene image failed CORS: objects carry
   `crossOrigin="anonymous"`, so the scheme needed `corsEnabled: true` + ACAO. Probed
   in-page: `{"none":"OK","anonymous":"FAIL"}` → after the fix both OK.
4. The painted-pixel check itself had a wrong selector (fabric's upper-canvas is a
   sibling) — the verification layer must be verified too.

Final: `{"ok":true,"painted":407160,"err":""}` + `out/desktop-shot.png`; smoke mode
still asserts the event stream (no base64, `</Content>`). Window-close now cancels
in-flight jobs; CSP serves `oia:`/`data:` only; zod and provider-config failures render
in Vietnamese; CI runs the desktop smoke under xvfb.
