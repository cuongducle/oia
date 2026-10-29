# Oia — Open image agent (banner-maker concept)

* **Author:** cuongducle + EGM Goldfish swarm (6 lenses)
* **Date:** 2026-10-28
* **Status:** brainstorm brief — findings and proposed directions, pending owner decisions

## Overview

Oia targets online sellers and shop operators who make promo banners — not professional designers. Today they generate whole images in ChatGPT. Revision is possible there, but every revision is another full generation — liked details drift, lettering can garble, quota burns again, and nothing in the output is an editable object, so there is no way to change only a number while the rest stays identical.

The proposed core loop:

1. User describes the banner.
2. Oia generates background/composition artwork through the user's existing ChatGPT login (Codex CLI channel; no API key purchase).
3. Transactional copy (price, discount %, date, product name) lands as editable native text layers.
4. When a real product is involved, its photo enters generation as a reference image (Codex `exec -i` / OpenAI image edits) so the model builds the scene around the actual product; manual layering is a fallback tool.
5. Export PNG/JPG at the sizes target platforms need.

State today vs. state promised (all Goldfish lenses demanded this split):

| Claim | Runs today | Requires new work |
| --- | --- | --- |
| Layer editor (text/image/shapes, undo, export PNG/JPG/PDF/PPTX) | Yes — web app | Desktop packaging only |
| Generate via ChatGPT login (Codex CLI) | Yes — macOS-verified only; Windows path parsing and `.cmd` spawn broken | `CliRuntime` + Windows verification |
| Keyless planner (describe in Vietnamese → structured copy) | **No** — planner is `mock` or `openai` (API key); mock returns a canned string | `CodexLlmProvider` or form-field input |
| Structured copy fields (price/%/date/name as separate layers) | No — one free-text Textbox at a fixed position | Planner contract + scene schema |
| Text-free artwork with reserved space | No — the Codex prompt bakes text into pixels, then a duplicate overlay box is added | Invert the text contract |
| Product-photo compositing | Partially — manual layer placement; no bundled cutout; provider ignores reference images | Cutout story + slot reservation |
| Desktop app (Windows + macOS), no terminal, no Node/Redis/Docker | No — research doc only | Full Electron migration |

## Analysis

Findings below are deduplicated across the six lenses (Contrarian/YAGNI, cost & quota, UX/ergonomics, migration/compatibility, observability, maintainability). Each is grounded in the current repository, not in marketing language.

### Blockers

**B1. The ChatGPT-login channel is a non-contractual foundation.**
The whole "no API key" premise rides the undocumented Codex CLI `$imagegen` surface: stdout format OpenAI can change at any time (the code says so), one experimental data point (~15k tokens/image, one free account, one date), quota ceilings unmeasured, no SLA, and ToS/enforcement risk when a distributed app drives consumer ChatGPT logins at scale — with account bans landing on users, not on Oia. There is no second login-based provider to fall back to, and the persona rejects API-key providers, so the registry fallbacks are commercially void. Required: a documented degradation path (editor + paste-image-from-ChatGPT still works with zero CLI), quota/health telemetry, and an explicit ToS risk position before distribution.

**B2. The flagship promise silently runs on a stub for exactly the target user.**
Planner providers are `mock` (returns hardcoded "GIAM GIA 20%") or `openai` (needs an API key). A ChatGPT-login-only user therefore never gets their real price/date as editable text — the demo works, the field degrades. Shipping UI on top of this would harden into permanent debt. Required: either a `CodexLlmProvider` (text-only `codex exec`, JSON plan) or deterministic labeled form fields (price/%/date/name) that populate native text layers with no LLM in the loop; mock output must never reach real users silently.

**B3. The text contract is inverted: baked plus duplicated.**
The Codex prompt instructs the model to "Render all text exactly as written" — text is baked into pixels — then the designer overlays one hardcoded Textbox (fixed position, fixed font) with a single free-text `copy` blob. Result: doubled or colliding text, no separately addressable fields, and the user's most-wanted edit (change the price) still fights the artwork. Required: invert the pipeline — image prompts demand text-free artwork with reserved negative space; the planner emits structured fields; the scene builder places named textboxes (price, discount, date, name); layout is data-driven and user-adjustable.

**B4. Windows is half the stated audience and is broken today.**
`extractImagePath()` only matches POSIX paths (`C:\…` and `C:/…` both fail — verified in `docs/desktop-architecture.md` §6); the mtime fallback misattributes images on overlapping jobs; `spawn("codex")` cannot resolve npm `.cmd` shims on Windows; launching from Start Menu has a different PATH than a dev shell. Required: the `CliRuntime` abstraction (bundled vs. PATH binary, `.exe`/`.cmd`, per-job output dirs, process-tree cleanup) and a real Windows verification gate — a passing macOS build is not evidence.

**B5. Desktop is research; the migration is months, while the loop is testable now.**
Not one line of desktop code exists. Meanwhile steps 3–4 of the loop are feasible on the current web app today (Fabric layers, upload → image layer, export). The lenses converge: validate the banner loop with real sellers on the existing self-hosted web app before committing to Electron; then desktop is packaging, not a rebuild. The persona also contradicts today's onboarding (install CLI, `codex login` in a terminal, set env vars, restart server) — the product's own research doc already forbids this class of barrier.

**B6. Paid-quota jobs retry silently; nothing is cancellable or diagnosable.**
BullMQ `attempts: 3` re-runs paid Codex generations (up to ~45k tokens burned per task) with no surfaced retry counter — contradicting the project's own rule against repeating paid generations. The SSE stream has no `cancel()` handler; closing the tab leaves the CLI child burning quota; timeouts kill only the direct child. `isAvailable()` collapses "missing binary / not logged in / hang" into one boolean; transcripts are destroyed on success; `msgId = Date.now()` collides. Required: non-retryable-by-default paid jobs, an error taxonomy, first-class cancellation, per-job correlation IDs, and a persisted transcript ring buffer.

**B7. Persistence cannot survive a desktop product.**
Generated images are embedded as base64 data URLs inside scene JSON (multi-MB blobs replayed through SSE/IPC, duplicated as thumbnails); `projects.json` is rewritten whole with a plain `writeFile` (a crash corrupts all projects); no `schemaVersion` exists to key migrations on; data lives under the current working directory; the Home→Editor handoff passes the full scene through `localStorage` (~5MB quota, fails silently). Required — as a precondition for Electron, not a follow-up: asset-ID indirection through the existing file store, atomic per-project files, `schemaVersion`, userData-rooted storage, handoff by projectId.

### Majors (selected)

* **M1 (decision reversed by owner, 2026-10-28, after documentation research).** Reference-first generation is the designed path: Codex documents reference images as first-class (its own product-photo example included), and OpenAI `/v1/images/edits` is built for compositing (up to 16 inputs, `input_fidelity: high`). Manual layering is a fallback tool. Cutout stays optional.
* **M2. Refinement can destroy the user's hand-composited work.** The AI edit flow may replace the active page — wiping the real product photo the user just placed. Required: a non-destruction rule — agent edits never remove user-added layers; page replacement requires an explicit confirm naming what is lost.
* **M3. Error surface is developer-facing.** Raw stderr, exit codes, mixed Vietnamese/English inside one message ("codex timeout sau 360s"), and no mapping from failure to a plain-Vietnamese message plus one next action ("Đăng nhập lại" / "Thử lại"). The persona cannot act on any current error.
* **M4. Telemetry stance is undefined for a product whose "oncall" is the user.** No structured logs, no durable job records (in-memory Map, wiped on restart), no diagnostics export. For a non-technical audience, an in-app "export diagnostics bundle" is the only incident artifact — treat it as launch-blocking for desktop.
* **M5. Dual-runtime split-brain.** Porting to IPC while keeping 19 fetch-called API routes means every feature is implemented twice. Decide the web app's fate (transitional / co-maintained / sunset) and extract the service boundary first, as the desktop research already specifies.
* **M6. Scope: banner lane vs. studio monorepo.** The repo carries 15 skills, brand kit, community library, share links, agent API. The concept serves one persona. Declare the banner lane the only desktop-v1 scope; everything else stays on web or is cut.
* **M7. Iteration burn.** Every composition-level miss costs a full regeneration (~15k tokens, up to 6 minutes). No attempt budget, no quota meter, no cancel button, and multi-page projects multiply this up to 9×. A free-tier user can exhaust a day's quota in one session.

### Nits

* Marketplace size presets (Shopee/Lazada/TikTok Shop) are absent — sellers think "khung Shopee," not pixel dimensions. One-constant change; defer multi-size batch export until asked for.
* `.env.example` advertises unimplemented providers (`replicate`, `comfyui`, `openrouter`, `ollama`) — align or implement.
* Fabric version drift between packages (`^6.9.1` vs `^6.7.1`) and a duplicated `"7.3.1"` scene-version literal; Oia needs its own `schemaVersion` distinct from Fabric's.
* Test infrastructure pins one macOS stdout fixture; no Windows/degraded-output corpus, no injectable failing provider.
* Distribution carries recurring costs and license hygiene: Apple Developer Program, Windows signing/SmartScreen, update hosting, and a no-GPL-code-copy rule (reference apps studied are AGPL/GPL; Oia is MIT).
* Positioning: Canva plus its AI already bundles a similar capability. The differentiator is the integrated loop for Vietnamese sellers (describe once → editable layers → real product photo → marketplace sizes), not "first editable AI banner."

## Goals vs. Non-Goals

* **In-Scope Goals**
  * One persona served end-to-end: the Vietnamese online seller making promo banners on Windows or Mac.
  * Describe → generate (ChatGPT login) → edit text layers → composite real product photo → export at marketplace sizes.
  * A keyless path that works without API keys and without a terminal.
  * Honest degradation when the Codex channel is unavailable or exhausted.
* **Out-of-Scope Non-Goals**
  * Porting the whole studio (skills, community library, share links, agent API) to desktop in v1.
  * Native PowerPoint objects, background removal as a hard dependency, multi-size batch export (until users ask).
  * A hosted multi-user service; account system; billing.
  * Any claim of editable layers inside generated pixels.

## Alternatives Weighed

1. **Commit to Electron now vs. validate on the existing web app first.** Rejected "Electron first": zero desktop code exists, while the differentiating loop (layers + product photo + export) is testable on the current web app within days. Desktop becomes packaging after the loop is validated with real sellers.
2. **`CodexLlmProvider` (LLM planner over the ChatGPT login) vs. labeled form fields.** Kept open: a text-only `codex exec` planner keeps "describe it in chat" but adds a second fragile CLI surface; form fields (price/%/date/name) are deterministic, instant, and always available. Proposed resolution: form fields as the floor, planner as the enhancer.
3. **Regenerate-with-reference vs. manual layering for product photos.** Initially rejected (references ignored by providers; inpainting needed API keys). **Superseded 2026-10-28:** documentation research showed reference images are a documented first-class capability on both channels (Codex reference prompts; OpenAI image edits). Reference-first (both channels behind the existing `referenceImages` contract) is the chosen answer; manual layering is the fallback.
4. **Keep `mock` as the silent keyless default vs. forbid it for real users.** Rejected the status quo: mock planner output reaching users is the single biggest honesty risk in the current pipeline.
5. **Pitch as "first editable AI banner" vs. "the integrated loop for sellers."** Rejected the former: Canva bundles similar capability; the honest, defensible pitch is the loop and the marketplace fit.

## Key Decisions & Staging for Next Steps

Owner review (2026-10-28):

* **Accepted as valid findings:** B1 (channel risk), B2 (planner stub for keyless users), B3 (text baked + duplicated), B4 (Windows path/spawn), B6 (paid retry + no cancellation), B7 (persistence). The reference-image finding was first rejected, then **re-accepted the same day** after documentation research (Codex reference images + OpenAI image edits are documented capabilities); see M1 and Alternatives #3.
* **Current phase: documentation only.** No implementation work has started; the fixes below are to be specified in the design document first.

Proposed staging (documentation now; implementation only after the design is approved):

* **Stage 0 — validate the loop on the current web app (days, not months).**
  Invert the text contract (text-free artwork + structured named textboxes: price/discount/date/name); add labeled form fields as the deterministic keyless path; add a paste-image lane so users can bring ChatGPT-generated art in without the CLI; marketplace size presets; non-destruction rule for AI edits. Test with real banner makers.
* **Stage 1 — make the ChatGPT-login channel survivable.**
  `CliRuntime` with Windows support and verification; paid jobs non-retryable by default; cancellation; error taxonomy with Vietnamese-first user messages; per-job correlation IDs and transcripts; quota counters surfaced.
* **Stage 2 — persistence hardening.**
  Asset-ID indirection (no base64 in scenes), atomic per-project files, `schemaVersion` + migrations, userData-rooted storage, handoff by projectId.
* **Stage 3 — Electron packaging.**
  Banner lane only; bundled or auto-provisioned Codex runtime with in-app login; signing/notarization/update budget accepted.

Decisions the owner must make before `/egm-draft`:

1. Accept the Codex-login ToS/quota risk profile, and with which degradation path?
2. Planner architecture: `CodexLlmProvider`, form fields, or both (fields as floor)?
3. Fate of the Next.js web app: transitional, co-maintained, or sunset?
4. Is there migration surface for existing `.data` users, or is desktop a clean-slate audience?
5. Bundle a cutout tool in v1, or ship manual layering with honest examples?
