# Oia banner-maker loop (Stage 0 — web)

*   **Author:** cuongducle
*   **Status:** Approved (owner, 2026-10-29)
*   **Date:** 2026-10-28
*   **Predecessor:** [`concepts_brief.md`](../../concepts_brief.md) (EGM brainstorm via [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model), 2026-10-28)

--------------------------------------------------------------------------------

## Overview

**The end product is a desktop app (Windows + macOS). This document is step 1 on the path to it, not the desktop build itself.**

| Step | What happens | Where |
| --- | --- | --- |
| **1 — this document** | Fix the engine: real planner via the ChatGPT login, editable text blocks, single-attempt paid jobs, cancellation, asset persistence, Windows-capable CLI, reference-image generation | The existing web app — the only runnable shell today. Nearly all fixes land in `packages/` (providers, agent, tasks), which the desktop shell reuses unchanged |
| 2 — later design | Persistence hardening for install-and-upgrade (schemaVersion, migrations, per-project files) | same engine |
| 3 — later design | The desktop shell itself: Electron packaging, installers, signing, updates. **Web-app fate (owner, 2026-10-28): transitional — retired when desktop ships; the public website becomes a landing/download page only.** Importing existing `.data` (projects, sessions, templates) into the desktop app is a required input for this design | new code |

Why fix the engine on the web shell first: the desktop app has no code yet, the engine is shared, and the banner loop must be proven with real sellers before months of packaging work wrap around an unproven loop.

**How Stage 0 is validated (seller access and exit criteria).** Sellers do not self-host. The owner runs the web app locally (own Codex login and quota) and sits with 3–5 sellers in moderated sessions; each seller drives the loop herself — describe → generate → edit copy → attach the real product photo → export — with narration only, no developer hands on the keyboard. Success criteria: every seller completes the loop without developer intervention; each session produces at least one real edit-without-regeneration; each seller exports a file she says she would post. Exit criteria: met → proceed to roadmap step 2 with the findings; not met → the blocker list becomes the next design's input. A hosted trial is explicitly out — hosting would route every seller's generation through the owner's account, instead of each seller using her own ChatGPT login (the posture the desktop app restores).

**Known validation gaps (recorded, not hidden):** (1) seller onboarding — installing Node, the Codex CLI, and logging in — is *not* tested by these sessions; it is a desktop-era question. (2) *Assumption:* the target sellers' ChatGPT plans include Codex image generation with usable quota — unverified; if wrong, the keyless channel serves nobody. (3) Sessions run without `REDIS_URL` (chat path only — the worker is not exercised). **Session operations:** each session carries a quota budget for the owner's account plus a backup plan (secondary account or API key) — image turns burn limits 3–5×; and each seller consents to her product photos transiting the owner's OpenAI account before the session starts.

**Reference-fidelity criterion (pre-committed):** every session includes at least one reference run with a packaged product; pass = product recognizable and label text legible at export size in ≥ 2/3 of reference runs across sessions. Below threshold the fallback engages without a new decision: the reference prompt gains a "minimize brand text on packaging" variant and the manual-layering path is surfaced first for packaged products; G8's default flips only by owner decision.

Oia serves online sellers who make promo banners with ChatGPT today: they generate a whole image, and when one detail is wrong (a price, a fake-looking product), they must regenerate from scratch. Oia's promised loop is: describe the banner → when a real product is involved, send its photo into generation as a **reference image** (`codex exec -i` on the keyless channel, `/v1/images/edits` for API-key users) so the model builds the scene around the actual product → copy lands as editable native text layers (clean-plate mode) or renders in-image (poster mode) → export at marketplace sizes. Manual photo layering remains an editor fallback tool.

This design covers **Stage 0: making that loop real on the existing web app**. The Goldfish review found that several loop promises are currently contradicted by the code itself. This document specifies the fixes as design work only — no implementation has started, and no desktop/Electron work is in scope.

## The Problem

Two layers of problems must both be solved for the loop to hold.

**User-level problem.** A seller types "banner trà sữa giảm 20% ngày 8/11" into ChatGPT and gets a flattened image. Revision is possible — she can ask again ("đổi thành 30%") and even attach her real bottle photo — but every revision is another full generation: the parts she liked drift, lettering can garble, the product may change shape, quota burns again, and the same request yields a different result each run. There is no way to change only the number while everything else stays pixel-identical, because nothing in the output is an editable object. That is the gap Oia fills: transactional copy becomes native layers she edits for free, the real product goes through reference generation, and iteration stops re-rolling the whole design.

**Implementation-level problems** (found by code-grounded review, accepted by the owner on 2026-10-28):

1. **Text handling serves two masters.** Rendering text into the artwork is deliberate (`codex.ts` builds "Render all text exactly as written, keep it sharp and readable" because image models garble lettering without that guard — the current concept is a complete AI poster, the same shape users get from ChatGPT). The designer adds an editable textbox only when the planner returns `copy`, first page only, at one fixed position. For banners whose numbers change often, baked text is the pain; when both exist, the same copy appears twice. The fix is an explicit generation mode, not a silent inversion.
2. **The step that reads the request is fake for login-only users.** When she types "banner trà sữa giảm 20% ngày 8/11", one part of the app must read that sentence and pick out the price and the date for the editable text layers. Today that part has only two modes: `openai`, which needs a paid API key she will not buy, or `mock`, which reads nothing and always returns the same hardcoded string "GIAM GIA 20%". Her real "20%" and "8/11" therefore never become editable text. Her ChatGPT login could do this job — the same CLI already generates her images — but the app has no code that connects the planner to it. TP.2 adds that connection.
3. **Failed paid generations silently retry.** The queue retries every task up to 3 times, including Codex generations that consume the user's ChatGPT allowance (per the Codex docs, image turns burn included limits ~3–5× faster than comparable turns) — up to 3× spend per failure, invisible to the user.
4. **Nothing is cancellable.** The SSE stream has no cancel handler; closing the tab leaves the Codex child process running (up to 6 minutes), burning quota with no user feedback and no stop button anywhere.
5. **The Home → Editor handoff can silently fail.** The generated scene (with the artwork embedded as a base64 data URL) is passed through `localStorage` (~5 MB quota). Oversized scenes vanish: the user lands on an empty canvas after paying for a generation.
6. **Windows output parsing is broken.** The image-path parser only matches POSIX-style paths; `C:\…` and `C:/…` forms fall through to a "newest file in 10 minutes" scan that can attach the wrong image. Spawning `codex` also fails on npm `.cmd` shims without PATHEXT handling. Windows is a primary platform for this audience (owner interview — sellers use both Windows and Mac).
7. **The generation channel is a non-contractual dependency.** The "no API key" promise rides an undocumented Codex CLI surface whose format and quota can change unilaterally. There is no user-visible degradation path today.

**Superseded decision (owner, 2026-10-28, after documentation research):** the earlier call — "manual layering is the designed behavior; reference generation is not a v1 promise" — was overturned. Codex documents reference images as a first-class capability (transform an asset or use it as visual guidance, multiple references, with the docs' own product-photo example), and OpenAI's `/v1/images/edits` is purpose-built for compositing (up to 16 input images, `input_fidelity: high`). The designed path is **reference-first generation**; manual layering stays as an editor fallback tool.

## Goals

*   **G1 — Editable-copy default for the banner flow.** The Home banner flow defaults to clean-plate mode: text-free artwork with reserved space, and the planner's free-form text `blocks[]` become individually named, editable textboxes — editing copy never requires regeneration. Poster mode (text rendered in-image, fidelity-guarded) stays available as an explicit toggle and remains the default for skills/templates built on baked text.
*   **G2 — Keyless structured copy via the ChatGPT login.** A `CodexLlmProvider` (text-only `codex exec`) produces a structured plan (`imagePrompt` + free-form text `blocks[]`) over the user's existing ChatGPT login. Mock planner output must never reach a real user silently; when the planner fails or is unavailable, the failure surfaces explicitly (G7) rather than falling back to canned copy. *(Owner decision 2026-10-28: Option 2 — planner via Codex, no form-fields floor.)*
*   **G3 — Paid jobs run exactly once.** Metered generation (Codex-plan quota or API-key billing) is non-retryable per job; a user-initiated retry starts a new job linked with `retryOf: <original jobId>` so retry chains stay traceable. Max one metered job in flight per app instance; concurrent metered jobs on one ChatGPT account are refused with `rate_limited`.
*   **G4 — Cancellable generation.** A stop control plus disconnect handling (tab/window close) terminates the CLI process tree and emits a terminal `cancelled` event.
*   **G5 — Lossless handoff.** Home → Editor passes a `projectId`, not a scene blob; generated images persist through the file store and scenes reference asset IDs. No base64 in `localStorage`; no silent white canvas.
*   **G6 — A runtime the desktop era can build on.** A generic `CliRuntime` layer resolves the Codex binary, manages process trees, and scopes fallback scans per job — verified on macOS in Stage 0 (the dev environment). Windows-specific resolution and verification are specified and gated in the step-3 desktop design (owner decision 2026-10-29).
*   **G7 — Explicit degradation (no-silent-fallback).** When the Codex channel is missing, logged out, or exhausted, the editor still works: paste-or-upload an image from ChatGPT web and keep every layer feature. Errors surface as plain-Vietnamese messages with one next action each. *No-silent-fallback rule (defined here, used throughout): every failure surfaces with one error class and one action; nothing falls back silently.*
*   **G8 — Real product through the model.** The user's product photo enters generation as a reference image on both channels — Codex (`codex exec -i`, documented capability) and OpenAI (`/v1/images/edits`, up to 16 inputs, `input_fidelity: high` where supported) — so the scene is built around the actual product with matching lighting and perspective. Manual layering stays available as an editor fallback.

## Non-Goals

*   No desktop/Electron packaging work (Stage 3 concern; this design is web-only).
*   No generic inpainting studio (no freeform mask-painting UI); reference use is the documented product-photo flow, not a general edit surface.
*   No bundled background-removal requirement (cutout stays optional).
*   No multi-size batch export; marketplace size presets are constants only.
*   No hosted multi-user service, accounts, or billing.
*   No claim of editing pixels inside generated images.

## Resolved Decisions

*   **Q1 — RESOLVED (2026-10-28):** Planner = `CodexLlmProvider` (Option 2). No form-fields floor in Stage 0.
*   **Q2 — RESOLVED (2026-10-28):** Owner accepts the Codex-login channel risk — other shipped products ride the same channel. No public ToS statement ships; the G7 degradation lane remains the practical safety net if the channel closes.
*   **Q3 — RESOLVED (2026-10-28):** Quota visibility ships in Stage 0: Oia-local per-session/per-day generation counters, plus `quota_exceeded` parsed from Codex output (with reset time where the CLI shows it). Codex's own remaining allowance (5-hour/weekly) is displayed only if a stable local source (app-server/daemon) is verified during implementation; quota is never queried by spending an agent turn.

## Critical User Journeys (CUJs)

### CUJ 1 — First banner, no API key

*   **Given:** the app runs with `LLM_PROVIDER=codex` and `IMAGE_PROVIDER=codex`; the user has no API key and is logged in to Codex with her ChatGPT account.
*   **When:** she opens Home and types "banner trà sữa giảm 20% ngày 8/11".
*   **Then:** the Codex planner returns a plan with `imagePrompt` (clean-plate composition) and `blocks[]` (price="20%", date="8/11", product="trà sữa", each with its own role); generation (clean-plate is this flow's default) produces text-free artwork plus those values as named editable textboxes; she edits "20%" to "30%" and exports — no regeneration, no API key, no canned mock copy.

### CUJ 2 — Regenerate nothing, fix everything

*   **Given:** a generated banner whose composition she likes.
*   **When:** she changes the date field, moves the product photo, and swaps the headline wording.
*   **Then:** all three edits apply to layers immediately; the artwork image is untouched; no generation job starts.

### CUJ 3 — A failure costs one attempt, not three

*   **Given:** IMAGE_PROVIDER=codex with a logged-in CLI; a generation fails mid-run.
*   **When:** the failure surfaces.
*   **Then:** exactly one attempt was spent; the UI shows the error class in plain Vietnamese with one action ("Thử lại" as an explicit button); no automatic re-run occurs.

### CUJ 4 — Close the tab, stop paying

*   **Given:** a Codex generation is streaming.
*   **When:** she closes the tab or presses Stop.
*   **Then:** the CLI process tree terminates, a `cancelled` terminal event is recorded, and no orphan process keeps consuming her allowance. Stop kills immediately; an accidental tab close has a ~10 s grace window before the job is killed (artwork already produced is persisted).

### CUJ 5 — Big artwork survives the handoff

*   **Given:** a generated scene whose artwork exceeds the old localStorage budget.
*   **When:** generation finishes and the editor opens.
*   **Then:** the editor loads the project by ID with artwork served from the file store; the canvas is never blank; the scene JSON contains an asset reference, not a base64 blob.

### CUJ 6 — Windows first run *(deferred to the step-3 desktop design; Stage-0 sessions run on macOS)*

*   **Given:** a Windows machine with the Codex CLI installed via npm and the app launched normally (not from a dev shell).
*   **When:** she generates a banner.
*   **Then:** the binary resolves through the `.cmd` shim, the output path in `C:\…` form parses, and the correct image lands on the canvas — verified on a real Windows machine before release.

### CUJ 7 — Real product, real scene

*   **Given:** the user has a product photo and is logged in to Codex.
*   **When:** she attaches the photo and asks for a sale banner featuring this product (clean-plate mode).
*   **Then:** the photo is passed to generation as a reference; the returned scene contains her actual product with consistent lighting and perspective and clear copy zones; the product's own packaging text (labels, logo) is preserved unaltered; the price/date blocks remain editable textboxes. One test variant uses a product whose packaging carries printed text.

## Technical Plan (Architecture)

All changes are web-app-scope (no Electron work). Architecture decision on record: the keyless planner is a `CodexLlmProvider` over the same Codex CLI bridge as image generation — one login, one channel, two uses.

### End-to-end flow

```text
User (Home)
  │  "banner trà sữa giảm 20% ngày 8/11"
  ▼
POST /api/chat/send ── assigns jobId (UUID) ──────────────────────────┐
  │                                                                    │
  ├─► CodexLlmProvider ── codex exec (text-only) ──► plan JSON        │
  │        { imagePrompt, blocks: [{role, text, styleHint}...] }      │
  │                                                                    │
  ├─► CodexImageProvider ── codex exec $imagegen ──► PNG file         │
  │        text-free artwork, reserved copy zones                     │
  │        bytes ──► LocalFileStore ──► assetId                       │
  │                                                                    │
  └─► SceneBuilder: artwork(assetId) + named textboxes(blocks)        │
           │                                                          │
           ▼                                                          │
     ProjectStore (atomic write) ──► /editor?id=<projectId>           │
                                                                      │
Abort path: Stop button / tab close ──► AbortController ──►           │
  kill CLI process tree ──► terminal "cancelled" event ───────────────┘
```

Every SSE event, task record, and CLI invocation carries the same `jobId`, so one banner attempt is fully reconstructable from local artifacts. In the diagram, `$imagegen` is the Codex CLI's built-in image-generation skill; "the designer" is the planner→image→scene orchestration in `packages/agent/src/designer.ts`.

### TP.1 — Planner contract: free-form text blocks

*   The planner contract stays general. It gains one optional field: `blocks[]`, where each block is `{ role, text, styleHint? }` and `role` is a free-form string chosen by the planner ("headline", "price", "date", "slogan", "subtitle"…), not a fixed enum. A sale banner naturally yields price/date blocks; a presentation yields titles; a poster whose text should stay baked yields none. Zero, one, or many blocks — the planner decides from the request.
*   Legacy `{title, imagePrompt, copy}` keeps working: `copy`, when present, is read as a single block. The fixed-position overlay (today's `pi === 0 && copy` textbox at 72% height) is replaced by placement from `styleHint` plus a safe-zone default, so blocks no longer collide with the composition.
*   Each block lands on the canvas as a named Textbox (the editor already preserves object `name`), so "select the price" is a first-class operation for users and for the agent's selection-mention flow.
*   Zone geometry (shared with the crop anchor, TP.8): top band = 8–24% of canvas height, full width; side block = right 34% width, 28–72% height. Role→zone defaults: headline/title/subtitle → top band; price/discount → side block upper; date/name/slogan/unknown → side block lower; `styleHint` overrides the default. Overflow stacks downward with a 4%-height gap, clamped to the canvas.
*   Page scope matches current behavior: blocks are placed on the first page only (today's `pi === 0 && copy` rule). Per-page blocks for multi-page series are deferred until asked for.
*   **Vietnamese typography:** native text layers default to fonts with full Vietnamese diacritic coverage (the app already ships Be Vietnam Pro as a webfont — the editor and exports render in-browser, so page-loaded webfonts apply everywhere and OS substitution never touches VN glyphs). Seller sessions include one explicit question on whether native-layer text looks acceptable next to baked-in text — if sellers reject the look, the clean-plate-default hypothesis itself is at stake.

### TP.2 — CodexLlmProvider over a shared CLI bridge

Why a CLI transport at all: plan-quota generation through a ChatGPT login has no HTTP API — the Codex CLI is the only client for that channel, and that channel is the entire "no API key" value proposition. Every other provider (OpenAI API, fal, a future Gemini adapter) speaks HTTP; none of them touch the CLI layer.

*   A new LLM provider (`LLM_PROVIDER=codex`) calls `codex exec` in text-only mode with hard guards (flags verified on CLI 0.163.0): prompt goes in via **stdin** (`codex exec -`) — never argv; the working root is an **empty scratch directory** (`-C`); `--sandbox read-only` so the planner agent can never run state-changing commands; the plan is returned under **`--output-schema`** (JSON Schema for the plan contract) rather than parsed from free stdout. Parsing stays strict — a malformed plan fails with `plan_parse_failed` after exactly one attempt; no silent retry, no silent mock fallback; the request then surfaces per G7. The planner is an agent, not a bare model: user input is data (prompt-injection surface), and the read-only sandbox plus empty cwd bound the blast radius. Planner turns are metered turns (TP.6). **Config hygiene:** the planner runs with `--ignore-user-config` (verified flag; auth still honored) so a user's personal `config.toml` — model choice, reasoning effort, MCP servers — cannot silently change planner quality, latency, or cost between machines; the bridge pins `-m <model>` and reasoning effort explicitly, and the empty `-C` scratch directory also avoids project `AGENTS.md`. S2 verifies the exact effort key and confirms MCP/web-search can be disabled for the run. **Bridge-level invariant (both channels):** every `codex exec` invocation runs with stdin prompts, `--ignore-user-config`, and a pinned model; the sandbox is role-scoped — `read-only` for the planner, `workspace-write` limited to the job scratch directory for the image path (which must write the PNG). The image path receives user photos — a stronger injection vector than typed text; hardening one of two invocations of the same agent runtime is not a security design.
*   The process-management mechanics currently living in `image/codex.ts` (spawn, availability check, timeout, output capture, cancellation) are extracted into **two layers**: a generic `CliRuntime` (binary resolution incl. `.exe`/`.cmd`/PATHEXT, argument-array spawn, timeout, abort → process-tree termination, per-job scratch directories, transcript capture — knows nothing about Codex and serves any external CLI tool, `rembg` included) and a thin Codex bridge on top (exec argument patterns, login-status diagnostic, output parsing). Both the image and LLM providers use the bridge; process handling exists in exactly one place.
*   `isAvailable()` upgrades from a boolean to a structured diagnostic (binary found / version / login state / last error) consumed by the health panel (TP.6) and tests.

### TP.3 — Two explicit generation modes (not a silent inversion)

Baking text is the current design, not an accident: the "render all text exactly as written" instruction guards text fidelity, and today's output concept is a complete AI poster. Observation (unsourced): commercial banner tools appear to ship first-generation output as flattened images and add editable layers through later edit steps — matching the two-mode design. This design keeps that behavior and adds a second, explicit per-request mode:

*   **Poster mode:** text renders in the artwork, fidelity-guarded as today; planner `blocks[]` are optional and only for copy that must stay separately editable (or none at all). Default for skills/templates built on baked text.
*   **Clean-plate mode (default for the Home banner flow):** the image prompt forbids **added** typography and reserves calm space (top band / side block); lettering that is part of the user's own product packaging or label must be preserved exactly. Every piece of copy arrives as `blocks[]` textboxes — the banner-maker loop.

Coherence rule (prompt-enforced, soft): one generation never produces the same copy twice. In clean-plate mode the image prompt omits wording that exists as blocks; in poster mode the planner does not emit a block duplicating baked text. Home exposes the mode as one toggle ("Chữ sửa được ngay"): the banner flow defaults to clean-plate; baked-text skills/templates default to poster.

Known limitation (accepted): image models sometimes draw stray text or logos despite the prohibition, and zone adherence is best-effort. Stage 0 guarantees the *blocks placement*, not artwork text purity; the user recourse is dragging the textbox or regenerating the artwork.
*   Terminology: **skills** are the app's generation presets that structure planner output (Presentation Maker, Xiaohongshu Post Maker, Background Remover — the Toolbox's AI Skills); **templates** are the bundled studio templates. Both are app-level registries — not `packages/skills`, which holds installable coding-agent instructions. "Baked-text skills/templates" above refers to these.

### TP.4 — Paid jobs run once; error taxonomy

*   Today one global policy applies to every task class: `attempts: 3` with exponential backoff (3 s base) in `packages/tasks/src/bullmq.ts`, while the in-process backend runs once — identical failures behave differently depending on `REDIS_URL`. The policy becomes per-task-class: metered generation (Codex-plan quota or API-key billing) is non-retryable (`attempts: 1`); only explicitly classified transient errors (e.g., network dial failure) may opt in later.
*   A stable error taxonomy is introduced: `provider_missing`, `not_logged_in`, `quota_exceeded`, `rate_limited`, `content_refused`, `timeout`, `format_drift`, `no_output`, `plan_parse_failed`, `capability_unsupported`, `persistence_failed`, `network`, `cancelled`, `unknown`. Every task record and SSE failure event carries `errorClass`, `attemptNumber` (always 1 for metered jobs), `provider`, and `jobId`. A user-initiated retry creates a new job with `retryOf: <original jobId>`. Retry is stage-aware: if the planner succeeded and only the image stage failed, the retry reuses the stored plan and re-runs the image stage only — never a second planner turn. Rate limits must never be rewritten as timeouts (pi's rule) — the classes exist separately.
*   Each class maps to one plain-Vietnamese sentence and one action ("Đăng nhập lại" / "Thử lại" / "Xem hướng dẫn") in a single UI message map. Raw stderr, exit codes, and mixed-language internals never reach the user.

### TP.5 — Cancellation and process-tree cleanup

*   The SSE route installs a `cancel()` handler on its stream and an `AbortController` per job. Stop button, tab close, and window close all signal the same controller.
*   The controller propagates: designer loop stops → shared CLI bridge kills the child process **tree** → a terminal `cancelled` event is emitted and persisted with the job record. Kill mechanics per platform: POSIX uses a process group (`detached: true` is POSIX-only); Windows uses `taskkill /T /F` on the root PID — and when a shell wrapper was involved the tracked PID is the shell's, which is one more reason prompts travel via stdin and binaries are resolved to real executables.
*   **Scope:** the chat SSE path runs the designer in the web process **with or without `REDIS_URL`** — CUJ 4 therefore holds in every Stage-0 configuration, and moderated seller sessions (chat-only, no Redis) always sit on the in-process path. Task-API jobs *do* move to the worker when `REDIS_URL` is set; cancelling those needs a cross-process signal — a Redis pub/sub channel `cancel:<jobId>` — whose **contract and worker-side consumption both ship inside Stage 0, in Slice 4** — test-covered but validation-unexercised: no Stage-0 session runs the worker.
*   **Disconnect handling (owner decision 2026-10-29 — reattach cut from Stage 0):** a short grace window (~10 s) covers accidental disconnects; after it, the job is killed. The Stop button kills immediately. If the artwork was already produced when the cancel lands, the asset is persisted anyway (the quota was already spent); the terminal `cancelled` event then carries the `afterCompletion: true` outcome flag. Full reattach-by-jobId (reconnect endpoint, event buffer, client persistence) is a desktop-era candidate: the generation outcome is already durable (TP.7), so on this transitional shell reattach would only preserve the live-streaming view.
*   Timeout budget (verified gap): the route's `maxDuration = 300` was compared against the image provider's 360 s — but one request is pre-flight + planner `exec` + image `exec` serially, plus CLI startup twice. The budget (owner decision 2026-10-29, generous option): pre-flight ≤ 10 s (probe cached ~60 s TTL) + planner exec ≤ 120 s + image exec ≤ 300 s + 30 s margin = **480 s total**, enforced by the internal AbortController. Deployment reality: self-hosted `next start` treats `maxDuration` as advisory, so internal enforcement is the real budget; the platform-killed-stream case applies only where a platform enforces the hint — and in every case a killed stream emits the same terminal event and process-tree cleanup as a user cancel (its late-written image must not be picked up by a later fallback scan). S2's latency numbers are re-checked before Slice 1 ships and these values adjusted once, here.

### TP.6 — Pre-flight provider check and explicit states

What the code does today: `isAvailable()` exists (runs `codex login status`) but nothing in the app calls it — a missing or logged-out CLI surfaces as a raw spawn error mid-chat, after the user has committed to a generation. Provider selection is env-only, and the default mock provider returns an 8×8 placeholder PNG by design (keyless offline pipeline, demos, CI), with a mock planner returning canned copy.

TP.6 is four small, code-grounded behaviors:

1.  **Pre-flight check:** before the planner/image nodes run, call the availability probe once (a cheap `codex login status`); on failure, abort immediately with the mapped error class (`provider_missing` / `not_logged_in`) and its one Vietnamese action — zero generation attempts spent on a doomed job. The probe result is cached with a short TTL (~60 s) so every request does not pay the cold `login status` round trip.
2.  **Structured diagnostic:** `isAvailable()` returns why (binary found? version? login state? last error?) instead of a boolean, so the error map (TP.4) can distinguish "Chưa đăng nhập ChatGPT — Đăng nhập lại" from "Chưa cài Codex — Xem hướng dẫn".
3.  **Explicit mock labeling:** when running on the default mock provider, Home and the chat say so ("Chế độ thử nghiệm — ảnh placeholder, không phải AI thật") so a keyless first-run user never mistakes the placeholder for her banner. The upload/paste-image and template flows already work provider-free — they are the degradation lane; no new feature, only the status that routes users to it.
4.  **Quota visibility (Q3):** Oia counts metered turns per session/day — image generations and planner turns — and shows the count; Codex limit-exhaustion output (including reset time where the CLI shows it) maps to `quota_exceeded` and updates the panel. If implementation verifies a stable local quota source (the Codex app-server/daemon that status tools read), the panel also shows Codex's own remaining 5-hour/weekly allowance. Quota is never queried by spending an agent turn.

### TP.7 — Persistence and handoff (Stage-0 scope)

*   Generated artwork bytes go through the existing local file store; scenes reference an asset URL/ID. The no-base64 rule is enforced **on save, not on load**: legacy projects/sessions containing data URLs still open (read-tolerant), and a migrate-on-save pass extracts embedded bytes into the asset store and rewrites references; new saves may not contain base64. Thumbnails reference the same asset. Asset-reference syntax (pinned): scene `src`/`thumbnail` hold the storage URL `/api/files/<key>` exactly as `LocalFileStore.put()` returns it — same-origin, browser-loadable, no resolution layer; the storage key is the asset ID.
*   Home → Editor handoff switches from `localStorage` blobs to: create the project (atomic write) → navigate to `/editor?id=<projectId>` (route already supported). Both handoff sites are converted — template open (`page.tsx` `oia:scene`/`oia:project`) and the post-generation/pptx branch — and the localStorage keys are no longer written.
*   Chat-session persistence stops failing silently: the SSE route's `chatSessions.append(...).catch(() => {})` swallows write errors today ("my banner vanished from history" with no trace) — failures are logged and surfaced per the TP.4 taxonomy, and `chat-sessions.json` stops embedding data-URL canvases for the same asset-ID reason as scenes.
*   `ProjectStore.save()` becomes atomic (temp file + rename, with retry/backoff on `EPERM`/`EBUSY` — Windows antivirus and indexers can hold the target mid-rename) with a single writer. A `schemaVersion` field and full migrations remain Stage-2 work; this design only stops the corruption and data-loss paths that affect the banner loop.

### TP.8 — CliRuntime: Windows-capable binary and output handling

*   **Argument hygiene (BatBadBut / CVE-2024-27980):** user text — prompts, copy, product descriptions — never enters argv. It travels via stdin (`codex exec -`, verified). argv carries only flags and ASCII paths; scratch and reference files are named with ASCII UUIDs. Binary resolution and process-tree termination use the standard libraries `cross-spawn` and `tree-kill` (new runtime dependencies, owner-approved 2026-10-29); hand-rolled PATHEXT/`.cmd`/shim handling is dropped — bespoke code keeps only the stdin discipline and Codex argument patterns. PATH is resolved against the app's environment, not a dev shell. (Windows-specific verification is specified in the step-3 desktop design.)
*   Output path parsing accepts POSIX, drive-letter backslash, and drive-letter forward-slash forms, with tests pinning all three.
*   **Output location — resolved by spike S1 (2026-10-29).** No output-dir flag exists and `CODEX_HOME` overrides would drop auth; `-C` does not redirect. The bridge locates the result via the **session directory**: parse the session id from the exec header/`--json` events, then take the `exec-*.png` inside `~/.codex/generated_images/<session-id>/`. Attribution is per-run by construction; the `File:` stdout marker, when present, is a cross-check hint; the mtime scan over the shared tree remains only as a provenance-marked last resort.
*   **Size policy (Codex channel):** exact pixels cannot be requested — the prompt carries orientation only. Naive cover-crop is **rejected**: a 2:3 return on a 3:4 canvas crops ~11% of the scaled image height in total, split across top and bottom — into the band where clean-plate reserves the top copy zones — and it can cut into a reference product. Policy: (a) restrict Codex-channel canvas presets to the ratios the channel actually returns — S1 records observed output ratios and the preset list follows the evidence; (b) if a mismatch still occurs, crop is **zone-anchored** (the crop keeps the side carrying copy zones and never crops into the reference product's bounding box), and copy-zone coordinates are recomputed in post-crop canvas space; (c) the actual output size is recorded on the job record.
*   Windows verification is a release gate **owned by the step-3 desktop design** (moved with the Windows work, 2026-10-29, so the gate is not lost): at least one physical-machine generate → edit → export run with a logged-in account before any Windows claim ships. Stage-0 sessions run on the owner's machine (macOS), chat-path only, no Redis.

### TP.9 — Reference-first product flow

`ImageGenInput.referenceImages` already exists end-to-end, and the editor's AI-edit composer already derives references from up to two canvas image layers (`editor/page.tsx`) — but no provider consumes them. Both channels get a real implementation:

*   **Codex channel:** `CodexImageProvider` materializes each reference (URL/data URL) to a temp file in the job's scratch directory — ASCII UUID filename — and attaches it via `codex exec -i <file>`. The prompt follows the documented patterns: identify images by order ("Image 1 is the product photo, Image 2 is the style reference"), state what must stay the same ("keep the product, camera angle, lighting; preserve the product's own packaging and printed labels exactly"), and in clean-plate mode leave copy zones clear while keeping product labels intact. Temp files are removed with the job.
*   **OpenAI channel:** the provider gains an edit path — `POST /v1/images/edits` with `images[]` (up to 16, `image_url` or File API id) and `input_fidelity: "high"` on models that support it. **Both calls (generations and edits) pin one configured model — currently `gpt-image-2.5-sunburst`, the verified server default** — because omitting the model lets a server-side default change silently invalidate the declared capabilities (`sizePolicy`, `input_fidelity`) and split the two paths onto different models. Changing models is an intentional, config-visible upgrade; `OPENAI_IMAGE_MODEL` remains the override. The Codex built-in channel pins its own model internally; we do not control or hardcode it.
*   **Size handling fix:** `sizeFor()` today collapses every request to three fixed sizes — a 900×1200 (3:4) banner is sent as 1024×1536 (2:3), distorting the aspect. `gpt-image-2`/`2.5` accept arbitrary `WIDTHxHEIGHT` (divisible by 16, ratio 1:3–3:1): requested dimensions are rounded **up** to the nearest multiple of 16 (900×1200 → 912×1200), the canvas keeps its nominal size, and the artwork layer is placed to cover — no preset snapping, no distortion.
*   **Windows gate addition:** openai/codex#40233 reports `image_gen` hanging on Windows when a local reference image is attached (Aug 2026; fix status unknown). The TP.8 Windows verification must include one reference-image run on a real Windows machine with the shipped CLI version before this flow is labeled Windows-ready.

### TP.10 — Non-destruction rule for AI refinement

The README already warns that the AI refinement flow can replace the active page and does not guarantee preservation of existing layers. For the banner loop this is the worst-case failure: the user layers her real product photo, asks for a small tweak, and the whole composite is wiped. Stage 0 makes the rule explicit:

*   **Provenance field:** scene objects gain optional `origin: "user" | "agent" | "generated"` — the editor stamps user-added layers, the scene builder stamps generated ones; the survival rule is enforced on `origin === "user"`. Objects without `origin` (legacy scenes) default to `"user"` — the conservative choice that keeps TP.10 protecting old projects.
*   Agent refinement never deletes or replaces user-added layers (upload, product photo, hand-placed text) without an explicit confirmation that names exactly what will be lost.
*   Page-replacing regeneration requires confirmation by default; the confirmation distinguishes "regenerate artwork" from "replace everything on this page".
*   After any refinement, user-added layers that existed before the request are still present — verified by a test that places a layer, runs a refinement, and asserts the layer survives.

### TP.11 — Provider extensibility contract (Gemini and future models)

Reference architecture studied: the [pi agent's provider system](https://github.com/earendil-works/pi) (provider registry, model metadata as data, shared wire implementations, "smallest integration" ladder). The seam already exists here too: `ImageProvider` / `LlmProvider` interfaces with a registry, and providers know nothing about scenes or agents. Adding Gemini (or any future model) must mean one adapter or one config entry — never pipeline changes. Transport follows the channel: HTTP APIs by default (`openai-images` wire today, a `gemini-images` wire with `GEMINI_API_KEY` when Gemini lands); the CLI transport exists solely for the Codex channel.

**Stage-0 scope of this contract:** capabilities data (`referenceImages`, `sizePolicy`, `isMock`), the generic error classes, and the registry-as-map. The ladder, config overrides, credential specs, and the new-provider checklist serve no Stage-0 goal and move to a separate provider-platform design (roadmap step 2); they are kept here as the recorded direction.

**The ladder — choose the smallest integration (borrowed from pi):**

| Need | Integration |
| --- | --- |
| A service that speaks a supported protocol (OpenAI-compatible images API, many gateways do) | Config entry only: `baseUrl` + key env + model id in settings — no code |
| Redirect an existing provider (proxy/gateway, different endpoint or model) | Partial override of that provider's `baseUrl`/`headers`/model — built-in catalog preserved, no copy that can drift |
| A new protocol (Gemini native, another CLI) | Full adapter file + one registry entry |

**Four rules keep the ladder true:**

1.  **Model metadata is data, not code assumptions.** Every image model declares `capabilities` — `referenceImages: boolean`, size policy (max, divisibility, ratio bounds), transparent background — plus a cost hint. Home/editor read the declaration ("can you take my product photo?", "what sizes?") instead of hardcoding which provider supports what; unsupported capabilities hide their UI path per the no-silent-fallback rule (G7) instead of silently dropping a request.
2.  **Shared wire modules, thin adapters.** Protocol handling lives in reusable wire implementations (`openai-images`: generations + edits; `gemini-images`; the Codex CLI bridge). An adapter owns only auth, endpoint, model mapping, and error mapping — it delegates transport. Copying a wire implementation per provider is forbidden for the same reason pi forbids it: drift.
3.  **Auth is uniform.** Each provider declares its credential spec (API-key env var, or the Codex login flow). Resolution, storage, and the health panel consume the same interface, so a new provider brings no new auth code paths.
4.  **Generic error classes with provider discipline.** The error taxonomy is defined once in TP.4 (14 classes) and referenced everywhere else; TP.11 does not maintain a second list. Every event carries `provider`. An adapter normalizes only its own quirks into these classes — it must not rewrite rate limits as timeouts or vice versa (pi's rule, kept verbatim).

**Registry as a plain map** composed with config overrides: built-in adapters (`mock`, `codex`, `openai`, `fal`, `gemini`…) plus config-only entries above them — settings can redirect an endpoint or pin a model without forking an adapter. Observation (unsourced): commercial banner tools tend to fix one server-side model behind pooled credits; per-call model selection from capability data is the differentiator this contract enables (a model picker appears only when more than one provider is configured).

**New-provider checklist** (the entire surface a future adapter owns): adapter implementing the two contracts via a shared wire module; capabilities + size policy declaration; credential spec; structured diagnostic; error mapping into the generic taxonomy; Vietnamese message entries; prompt-template override if the model needs different text-free phrasing; test suite adapted from the shared provider tests (success, each mapped error class, abort mid-run, Unicode paths/filenames, malformed output, credential refresh/expiry). Docs (`.env.example`, README provider matrix) list the provider only once implemented. Gemini's image models accept input images, so reference-first compositing slots into the same `referenceImages` contract unchanged.

### Components touched (summary; full file list comes in the implementation section)

```text
packages/schema      blocks[] contract, no-base64 scene rule
packages/providers   shared Codex CLI bridge, CodexLlmProvider, reference-image input
                     (codex -i, openai edits), CliRuntime resolution, diagnostics
packages/agent       planner ingestion, scene builder (named textboxes),
                     jobId propagation, abort support
packages/tasks       per-class retry policy, error taxonomy, cancellation hooks,
                     atomic project writes, asset-referenced scenes
apps/web             SSE cancel handler, stop button, Vietnamese error map,
                     provider-health panel, projectId handoff
tests                Windows path fixtures, plan-JSON fixtures, failing-mock
                     provider, cancellation e2e
```


## Alternatives Considered

Sourced from the brainstorm brief and the owner gates held during drafting (all 2026-10-28).

1. **Desktop-first vs. engine-first.** Chosen: engine-first on the web shell (this document). Rejected “commit to Electron now”: the desktop shell has zero code, while the banner loop is testable on the web app in days; packaging an unproven loop risks months of wrapper work around nothing. Desktop packaging becomes its own later design once the loop survives real sellers.
2. **Keyless planner: `CodexLlmProvider` vs. labeled form fields vs. both.** Chosen: `CodexLlmProvider` only (owner gate). Rejected form-fields-only: loses the “describe it in chat” experience and cannot enrich the image prompt. Rejected “both (form floor + planner enhancer)”: doubles the Stage-0 UX surface; revisit only if planner reliability proves insufficient in the field.
3. **Real product photo: reference-first vs. manual layering.** Chosen: reference-first on both channels (Codex `exec -i`; OpenAI `/v1/images/edits`), manual layering demoted to a fallback tool. Manual layering was the initially recorded decision, overturned after documentation research showed reference images are a first-class documented capability on both channels. Rejection reason, in the owner's words: pasting a rectangular photo over artwork is “not AI, ugly as hell”.
4. **Copy contract: fixed field enum vs. free-form blocks.** Chosen: free-form `blocks[] {role, text, styleHint}`. Rejected the fixed price/discount/date/name enum (owner gate): too rigid — it does not generalize to presentations, slogans, or posters whose text should stay baked.
5. **Text handling: blanket “no baked text” inversion vs. two explicit modes.** Chosen: two explicit modes — revised during review: the Home banner flow defaults to clean-plate, poster mode stays available and remains the default for baked-text skills/templates. Rejected the blanket inversion proposed by the review: baking text is deliberate design (the garble guard), and today's output shape matches what users get from ChatGPT; a silent inversion would break working behavior.
6. **Mock as silent keyless default vs. forbidding silent mock output.** Chosen: mock stays for tests and demos but must be labeled (“Chế độ thử nghiệm”) and may never silently reach a real user. Rejected the status quo: canned "GIAM GIA 20%" reaching real users is the largest no-silent-fallback violation in the pipeline.
7. **Quota visibility: querying Codex vs. local accounting.** Chosen: local per-session/day counters plus parsed limit errors (with reset time); Codex's own remaining allowance is shown only if a stable local source is verified during implementation. Rejected spending an agent turn to query quota: it consumes the very resource being measured.
8. **Public ToS statement about the Codex channel.** Chosen: none — the owner accepts the channel risk (other shipped products ride it); the degradation lane is the safety net. Rejected drafting a public position in Stage 0: adds no user value and creates speculative commitments.
9. **OpenAI image model default.** Chosen: pin one configured model on both paths (currently `gpt-image-2.5-sunburst`, the verified server default) so capabilities are declared against a known model and upgrades are intentional. Rejected keeping the `gpt-image-1` pin: superseded, lacks current size and fidelity capabilities. Rejected omitting the model to follow the server default: silent capability drift, and the two paths could end up on different models.
10. **Size handling: fixed three-size snapping vs. true-ratio sizes.** Chosen: pass the true `WIDTHxHEIGHT` (divisible by 16) supported by `gpt-image-2`/`2.5`. Rejected the current `sizeFor()` snapping: it distorts a 3:4 banner into 2:3.
11. **Web-app fate (brief question 3) and migration surface (brief question 4).** Chosen (owner, 2026-10-28): the web app is transitional and retired when the desktop app ships — the public website becomes a landing/download page only; importing existing `.data` into the desktop app is a required input for the step-3 design. Rejected co-maintaining two editors across two transports indefinitely.
12. **Process plumbing: hand-rolled vs standard libraries.** Chosen (owner, 2026-10-29): `cross-spawn` + `tree-kill` under the thin bridge — binary resolution and tree termination are solved problems with maintained libraries; the stdin/BatBadBut discipline and Codex argument patterns stay bespoke. Rejected hand-rolling: permanent liability duplicating maintained code for the exact bug class (shell-PID, `.cmd` escaping) those libraries exist to prevent.

## Detailed Implementation Plan

Stage 0 scope: engine fixes on the existing web app. C = create, M = modify. No code here — contracts, schemas, and behavior only.

**Order of execution — spikes first, then slices:**

*   **Pre-slice spikes:** S1 and S2 ran on 2026-10-29 — both resolved (see Spikes); TP.2 wires `CodexLlmProvider` as default per S2's pass rule, and TP.8 uses the session-directory locator per S1.
*   **Slice 1 — the loop:** minimal A contracts + **core `CliRuntime` and Codex bridge (argument-array spawn, stdin discipline, timeout, POSIX process-group kill)** + TP.1, TP.2, TP.3, TP.4, E error map, core tests. The runtime ships here because TP.2 and TP.5 both sit on it — it cannot wait for Slice 4.
*   **Slice 2 — control + handoff:** TP.5 cancellation/timeout, TP.6 pre-flight + quota, and the **projectId handoff** part of TP.7 (localStorage must be gone before any seller touches the app — a multi-MB Codex PNG at ~1.33× base64 against the ~5 MB quota is a blank-canvas mid-session risk).
*   **Slice 3 — data:** the rest of TP.7 (asset-ID indirection, migrate-on-save, atomic writes, session persistence).
*   **Slice 4 — platform:** TP.9 reference flow + worker-side cancel consumption. **Windows-specific work is deferred to the step-3 desktop design (owner decision 2026-10-29):** PATHEXT/`.cmd` resolution, `taskkill`, Windows path fixtures, and the S3 physical-machine gate move there — where Windows has users and a machine to verify on. The cross-platform atomic-write retry stays.
*   **Slice 5 — safety + presets:** TP.10 non-destruction, Vietnamese marketplace size presets, terminology pass (no-silent-fallback), risk register.

Each slice ships with green tests. Moderated seller sessions may start after Slice 2 as **early signal only** — the reference-product flow (TP.9) does not exist until Slice 4, so exit criteria are evaluated only after Slice 4 on a complete loop.

### A. Contracts & schema

*   **C** `packages/schema/src/plan.ts` — planner plan contract: `{title, imagePrompt, imagePrompts?, outline?, blocks[]}` where each block is `{role, text, styleHint?}`; `role` free-form; `blocks` optional (legacy `copy` accepted on read → treated as one block). Also: provider `capabilities` type (`referenceImages`, `sizePolicy`, `transparentBg`, `isMock`), the `origin: user|agent|generated` provenance type (TP.10), and the full 14-class error enum (TP.4).
*   **M** `packages/schema/src/index.ts` — export the new contract types.
*   **C** `packages/schema/src/plan.schema.json` — the checked-in JSON Schema handed to `--output-schema`; a unit test regenerates it from the `plan.ts` types and fails on drift.
*   **M** `packages/schema/src/protocol.ts` — `ChatEvent` gains `jobId`; failure events carry `errorClass`, `attemptNumber`, `provider`. Terminal `cancelled` = a ChatEvent with `status: "cancelled"` plus an `afterCompletion: boolean` outcome flag (job outcome, not an error class). Planner degradation = an ordinary failure event carrying the planner's mapped errorClass (`not_logged_in` / `quota_exceeded` / `timeout` / `plan_parse_failed`) — **the job aborts before image generation**; no text-free empty banners ship from a failed planner. Confirmation round-trip: `renderData.confirmRequest: { jobId, losses: string[] }` on the refinement result; approve re-sends the request with `confirm: true`, deny is a no-op — no new transport channel.
*   **M** `packages/schema/src/task.ts` — task records gain `jobId`, `attemptNumber`, `provider`, `errorClass` (durability in D-group).
*   **M** `packages/schema/src/scene.ts` — validation only: no base64 **on save**; reads stay tolerant (legacy data URLs load); accepts the asset-reference form (`/api/files/<key>` URL, TP.7) and optional `origin` provenance. The base64→asset extraction itself runs in Group D (the schema package cannot do I/O).

### B. Provider engine (TP.2, TP.8, TP.9, TP.11)

*   **C** `packages/providers/src/cli/runtime.ts` — generic `CliRuntime` (TP.8), provider-agnostic, built on `cross-spawn` (binary resolution) and `tree-kill` (process-tree termination) — no bespoke platform plumbing: argument-array spawn under the stdin discipline (user text never in argv; scratch/reference files named with ASCII UUIDs), timeout, AbortSignal wiring, per-job scratch directories, transcript capture with prompt/image content redacted by default (hashes only, 24 h retention). Usable by any external tool — `rembg` is an existing candidate consumer (adoption optional in Stage 0).
*   **C** `packages/providers/src/codex/bridge.ts` — the Codex-specific bridge on the generic runtime: `exec` argument patterns, structured availability diagnostic (binary/version/login/last error), output-path parsing (POSIX, `C:\…`, `C:/…`). Both paths share the invariant flag set: stdin prompts, `--ignore-user-config`, pinned `-m` model and reasoning effort. Planner: `-C` empty scratch + `--sandbox read-only` + `--output-schema` + `-o --output-last-message <scratch>/plan.json` (deterministic plan transport — no stdout delimiting). Image: `--sandbox workspace-write` scoped to the job scratch + `-i` ASCII-named reference files. Output-location strategy resolved by spike S1.
*   **C** `packages/providers/src/wire/openai-images.ts` — shared wire module for the OpenAI images protocol (generations + edits: `images[]` up to 16, `input_fidelity`, true-ratio `WIDTHxHEIGHT` divisible by 16). Used by the openai adapter now and by future config-only compatible endpoints.
*   **C** `packages/providers/src/llm/codex.ts` — `CodexLlmProvider`: text-only `codex exec` via the bridge, JSON plan in / strict parse out, exactly one attempt, `plan_parse_failed` on malformed output — never silent mock fallback.
*   **M** `packages/providers/src/image/codex.ts` — refactors onto the shared bridge; mode-aware prompt templates (poster default / clean-plate); `-i` reference attachment (URL or data URL → temp file in the job's scratch dir, removed with the job); output-path parser accepting POSIX, `C:\…`, and `C:/…` forms; fallback scan scoped to the job directory with provenance marking (`parsed` vs `fallback-scan`, frequent fallback → `format_drift` warning). Records the actual output size on the job result.
*   **M** `packages/providers/src/image/openai.ts` — delegates to the shared wire module; edit path enabled when references are present; **both calls (generations and edits) pin the configured model** — default `gpt-image-2.5-sunburst`, replacing today's `gpt-image-1` constructor pin; `OPENAI_IMAGE_MODEL` remains the override; true-ratio sizes with round-up-to-16 replace the three-size snapping.
*   **M** `packages/providers/src/types.ts` — interface extensions: `capabilities` declarations (Stage 0: `referenceImages`, `sizePolicy`, `isMock`); `isAvailable()` returns the structured diagnostic. Credential specs are deferred with the rest of the TP.11 platform work.
*   **M** `packages/providers/src/registry.ts` — plain-map registries (config overrides are deferred with the TP.11 platform work); registers `LLM_PROVIDER=codex`; **mixed-config startup guard (bidirectional)**: a mock provider paired with a non-mock provider in either direction fails startup with an explicit message — this configuration pair never boots (CI may set both mocks explicitly).
*   **M** `packages/providers/src/llm/mock.ts` — declares `isMock: true` capability so the UI can label "Chế độ thử nghiệm — ảnh placeholder"; behavior otherwise unchanged (tests/CI).
*   **M** `packages/providers/src/image/mock.ts` — declares `isMock: true` as well (today only the LLM mock would; the 8×8 placeholder is what a keyless first-run user actually sees).
*   **M** `packages/providers/src/index.ts` — exports.
*   **M** `.env.example` — provider matrix aligned with the registry (adds `LLM_PROVIDER=codex` documentation; lists only implemented providers).

### C. Agent pipeline (TP.1, TP.3, TP.5, TP.10)

*   **C** `packages/agent/src/copy-zones.ts` — the single constants module pairing copy zones between prompt template and textbox placement (prevents prompt/canvas drift). Owns the fit algorithm for the Codex channel: observe the returned image's ratio; on mismatch with the canvas, zone-anchored cover-crop (keep the copy-zone side; never crop into the reference product's bounding box) and recompute zone coordinates in post-crop canvas space (TP.8 size policy).
*   **M** `packages/canvas/src/editor.ts` — add `"origin"` to the `FabricObject.customProperties` whitelist (today only `name` survives `toObject()`, silently stripping provenance on every save/reload; without this, TP.10's survival rule is unenforceable).
*   **M** `packages/agent/src/designer.ts` — eight changes, itemized:
    *   blocks ingestion (legacy `copy` → one block)
    *   mode-aware image-prompt building (poster keeps the fidelity guard; clean-plate forbids added typography and reserves zones)
    *   scene builder places named textboxes from `styleHint` + copy-zone defaults (the fixed 72% overlay is removed; blocks apply to the first page, matching current behavior)
    *   `jobId` UUID generated at entry and attached to every event
    *   AbortSignal threading end to end
    *   mock-planner output never reaches a real user silently: planner failure aborts the job before image generation (explicit failure event; no image-only banners)
    *   refinement flow gains the non-destruction contract (user-added layers survive; page replacement emits `confirmRequest`; a confirmed re-request replaces the page)
    *   generated objects stamped `origin: "generated"` so TP.10 is enforceable

### D. Tasks & persistence (TP.4, TP.5, TP.7)

*   **M** `packages/tasks/src/bullmq.ts` + **M** `packages/tasks/src/queue.ts` — retry policy per task class: metered generation jobs (Codex-plan quota or API-key billing) get `attempts: 1`; a classified-transient allowlist (network dial) may opt in later; the same policy object is shared by both backends so in-process and queue runs behave identically.
*   **M** `packages/tasks/src/store.ts` — per-job AbortController registry (cancel API); task records gain the D-group fields and are persisted to disk (job log with TTL) instead of memory-only; retry chains carry `retryOf`; the cross-process cancel contract (Redis pub/sub `cancel:<jobId>`) is defined here with worker-side consumption landing in the platform slice; grace-window-then-kill semantics and the `cancelled`-with-`afterCompletion` outcome persisted (job outcome flag, not an error class).
*   **M** `packages/tasks/src/projects.ts` — `ProjectStore.save()` atomic (temp file + rename with `EPERM`/`EBUSY` retry-backoff, single writer); the save/append paths own migrate-on-save — base64 data URLs are extracted into `LocalFileStore` and rewritten to `/api/files/<key>` references; the chat route stops swallowing persistence failures (the `.catch(() => {})` sits at the route call-site, not in the store — fixed in Group E); stored canvases stop embedding data URLs (asset references instead).
*   **M** `packages/tasks/src/storage.ts` — `LocalFileStore` becomes the home for generated artwork bytes (asset-ID indirection); per-job scratch directories lifecycle.
*   **M** `packages/tasks/src/processors.ts` — reference-capable tasks check provider `capabilities` before accepting references (honest refusal when unsupported).
*   **M** `packages/tasks/src/index.ts` — exports.
*   **M** `apps/worker/src/index.ts` — logs carry `jobId`, prompt fragments redacted by default; retry-policy parity with the web process.

### E. Web app (TP.5, TP.6, TP.7, TP.10 UX)

*   **C** `apps/web/libs/provider-errors.ts` — the single errorClass → i18n-key mapping; the message text itself lives in `i18n.ts`; raw stderr/exit codes never reach the UI.
*   **M** `apps/web/app/api/chat/send/route.ts` — pre-flight provider check before the planner node (abort with mapped error, zero attempts spent); SSE `cancel()` handler wired to the job AbortController; `maxDuration` set to 480 s matching the internal budget (pre-flight 10 + planner 120 + image 300 + margin 30, per TP.5 — internally enforced; the platform hint is advisory on self-host); platform-killed streams emit the same terminal event as user cancel; session-persistence failures surfaced.
*   **M** `apps/web/app/page.tsx` — converts `openTemplate()` itself to the projectId handoff (covers template open, the pptx branch, and the post-generation Open-editor button); `oia:scene`/`oia:project` no longer written; generation-mode toggle ("Chữ sửa được ngay"); owns the provider-status banner and the per-day quota chip (reads the runtime snapshot; mock banner when `isMock`).
*   **M** `apps/web/app/editor/page.tsx` — Stop control for in-flight generation; error banner consuming the provider-errors map; reference-composer path capability-gated; user-added layers stamped `origin: "user"`; approve/deny dialog for `confirmRequest` (TP.10); load-by-id path unchanged.
*   **M** `apps/web/libs/i18n.ts` — user-facing strings for mode toggle, mock banner, stop control, degradation lane, and the Vietnamese error-message strings keyed by errorClass (TP.4).
*   **M** `packages/canvas/src/presets.ts` — add Vietnamese marketplace entries to `SIZE_PRESETS`: **Shopee Product (1:1) 1024×1024 · Lazada Product (1:1) 800×800 · TikTok Shop Product (1:1) 1080×1080** (the existing `TikTok (9:16)` stays; no collision). A constants addition — the Home ratio select and editor preset list are unchanged mechanisms. Dimensions follow the marketplaces' current seller guides and are re-verified against each seller center when this slice lands. Codex-channel availability of each ratio is gated by spike S1's observed set; ratios outside it route through the zone-anchored crop path.
*   **M** `apps/web/libs/runtime.ts` — exposes the provider registry snapshot (capabilities + diagnostics) to routes/UI; quota counters (per-session/per-day) recorded on every metered turn (image generation and planner) and on limit-error parse.
*   **M** `README.md` — provider matrix (`LLM_PROVIDER=codex`), reference-first flow, refinement non-destruction guarantee replaces the current warning paragraph.

### F. Tests & fixtures

*   **C** `packages/providers/test/fixtures/` — stdout corpus: POSIX path, `C:\…`, `C:/…`, degraded output, quota/limit error output, login-expired output.
*   **C** `packages/providers/test/failing-mock.ts` — injectable provider failing with a configurable errorClass/latency (shared by agent/tasks/web test suites).
*   **M** `packages/providers/test/codex.test.ts` — parser fixtures for all path forms; provenance marking; plan-parse failure; structured diagnostics.
*   **M** `packages/agent/test/designer.test.ts` + **M** `packages/agent/test/pipeline.integration.test.ts` — blocks placement and modes; jobId propagation; abort mid-run; non-destruction (place a layer → run refinement → assert the layer survives); planner-failure abort (degraded path); CUJ 2 assertion (edit three layer types, zero generation jobs).
*   **M** `apps/web/test/api.test.ts` + **M** `apps/web/test/tasks-api.test.ts` — single-attempt semantics, cancellation, error taxonomy in the response envelope.
*   **M** `apps/web/test/editor-persistence.test.ts` — projectId handoff; no localStorage writes remain.
*   **M** `apps/web/test/integration.e2e-flows.test.ts` — CUJ coverage: CUJ 1, 3, 4, 5, 7 (keyless blocks; one attempt; cancel; oversized-artwork handoff; reference run when a capable provider is configured, including the packaging variant). CUJ 2 is asserted in the designer unit tests; CUJ 6 is deferred with the Windows work (step-3 design). planner sandbox test — command-like user input causes no writes under the read-only sandbox (credential-gated: skipped in CI without Codex, like the existing codex integration test).
*   **M** `packages/protocol/src/decoder.ts` + **M** `packages/protocol/test/decoder.test.ts` — tolerant decoding of the new event fields (`jobId`, `errorClass`, terminal `cancelled`); existing events decode unchanged.
*   **M** `turbo.json` — rule: every provider env var introduced by this design (`OPENAI_IMAGE_MODEL`, …) joins `globalEnv` so cache keys stay correct.
*   **M** `packages/tasks/test/bullmq.test.ts` + `bullmq.integration.test.ts` — per-class retry policy (metered generation `attempts: 1`).
*   **C** `packages/tasks/test/` additions — startup guard, atomic-save retry, migrate-on-save, `CliRuntime` units (fake binaries: resolution / timeout / abort), quota counters.

### Verification gates (from the design, restated)

*   Windows machine gate: moved to the step-3 desktop design together with the Windows-specific work; the gate checklist re-checks openai/codex#40233 at gate time.
*   All existing suites stay green; new fixtures run in CI without network or credentials.

### Risks & Mitigations (register)

| Risk | Mitigation | Decision |
| --- | --- | --- |
| Codex-login channel closes or changes (no contract) | Risk accepted (Q2); the explicit-degradation lane (G7) keeps the editor fully usable | 2026-10-28 |
| Text purity of generated artwork is best-effort | TP.3 known limitation: blocks placement is the guarantee; user recourse documented | 2026-10-28 |
| Codex image output location uncontrollable | Spike S1 decides per-job scoping vs tightened scan | 2026-10-29 |
| Slow generations vs timeout arithmetic | 480 s internal budget (owner), internally enforced; re-checked after S2 | 2026-10-29 |
| Reference fidelity (labels on packaging) | ≥ 2/3 session criterion with pre-committed fallback | 2026-10-29 |
| Prompt injection via user photos / CLI agent | Bridge invariant: stdin, `--ignore-user-config`, pinned model, role-scoped sandbox | 2026-10-29 |
| `.cmd`/argv injection (BatBadBut) | Stdin discipline + `cross-spawn` | 2026-10-29 |
| Seller onboarding & plan quota unverified | Recorded as validation gaps (Overview); desktop-era questions | 2026-10-28 |
| Windows support | Deferred to the step-3 desktop design with its own verification gate | 2026-10-29 |

### Spikes (pre-implementation verification)

Verified facts (2026-10-28, Codex CLI 0.163.0 `exec --help`):

| Fact | Value | Verdict |
| --- | --- | --- |
| Prompt via stdin | `-` reads instructions from stdin | supported |
| Structured output | `--output-schema <FILE>` | supported |
| Final message to file | `-o --output-last-message <FILE>` | supported |
| Sandbox modes | `read-only` / `workspace-write` / `danger-full-access` | supported |
| Image attachment | `-i/--image <FILE>...` | supported |
| Config isolation | `--ignore-user-config` (auth still honored) | supported |
| Output-directory flag | — | absent |
| Per-job `CODEX_HOME` override | auth lives there | not viable |
| `-C` redirects image output | scratch stayed empty; image in `~/.codex/generated_images/<session>/` | not viable |
| Session id in exec output | printed in the header; available via `--json` events | supported |
| `File:` stdout marker | absent in the 2026-10-29 run | unreliable |

*   **S1 — RESOLVED (2026-10-29, run on machine):** `-C` does **not** redirect image output — the scratch dir stayed empty and the image landed at `~/.codex/generated_images/<session-uuid>/exec-<uuid>.png` (32 s, 11,899 tokens). The `File: [name](path)` stdout marker was **absent** from this run's output — format drift is real, so stdout parsing is demoted to a best-effort hint. The robust locator is the **session directory**: the session id is printed in the exec header and available in `--json` events; the image is the `exec-*.png` inside that session's directory. Each exec run gets its own session directory, so attribution is precise with no mtime guessing and no cross-job misattribution. TP.8/bridge implement this locator; the shared-tree mtime scan is demoted to last-resort with provenance marking.
*   **S2 — RESOLVED, PASS (2026-10-29, five runs):** parse-success **5/5**, latency 6–9 s (**p50 8 s** vs the 60 s ceiling). Output quality on a Vietnamese prompt: Vietnamese title and `headline/price/date/name` blocks with sensible styleHints, English art-direction `imagePrompt`. `CodexLlmProvider` is wired as the default planner per the pass rule. Two implementation facts discovered: (a) OpenAI strict structured output **requires every property in `required`** — optional fields must be `required` + nullable (`styleHint: {"type":["string","null"]}`), which is the pattern `plan.schema.json` uses; (b) without pinning, exec inherits the user's `config.toml` model (observed `gpt-6-luna`) — confirming the bridge's `-m` pin and `--ignore-user-config` invariant from TP.2.
*   **S3 — Windows reference run** *(moved to the step-3 desktop design with the Windows work; the gate checklist re-checks openai/codex#40233 at gate time)*: one `-i` generation on a physical Windows machine.

### Sources

*   OpenAI Images API — create image edit: <https://developers.openai.com/api/reference/resources/images/methods/edit> (model set incl. the `gpt-image-2.5` default; arbitrary `WIDTHxHEIGHT` divisible by 16, ratio 1:3–3:1; up to 16 input images)
*   Codex image generation docs (official): <https://developers.openai.com/codex/image-generation> (reference images, `$imagegen`, limit burn 3–5×, built-in `gpt-image-2`)
*   openai/codex#40233 — Windows `image_gen` hang with local reference: <https://github.com/openai/codex/issues/40233>
*   BatBadBut: <https://flatt.tech/research/2024/04/26/batbadbut/> and CVE-2024-27980 — `.cmd` argument injection on Node `spawn`
*   pi provider architecture (reference for TP.11): <https://github.com/earendil-works/pi>
*   EGM workflow: <https://github.com/google/elephant-goldfish-model>
*   Quota cost: Codex docs state image generations consume included limits ~3–5× faster than comparable turns; the older "~15k tokens/image" figure was a single-account experiment (in-code comment, 2026-10-27) — Stage 0 measures actuals instead of quoting it.

---

## Appendix — Implementation status (2026-10-30, cuongducle)

All five slices are implemented and merged behind green tests (build 9/9, tests 16/16
force-run, typecheck clean; real-machine verification noted per slice). This appendix
records what shipped, execution decisions taken inside the design's latitude, defects
found on the way, and what remains gated for later steps. The design text above is the
approved record and is unchanged.

### Shipped per slice

* **Slice 1 — the loop.** Schema contracts (`blocks[]`, 14-class error taxonomy,
  `origin` provenance, capabilities data, generated `plan.schema.json` with drift
  test); generic `CliRuntime` (cross-spawn + tree-kill, stdin discipline, timeout /
  abort ⇒ process-tree kill, per-job scratch, redacted transcripts 24 h) and the
  Codex bridge (pinned `-m` + reasoning effort, `--ignore-user-config`, role-scoped
  sandbox, session-directory locator per S1, POSIX/`C:\`/`C:/` parsing); the
  `CodexLlmProvider`; mode-aware Codex image prompts (poster / clean-plate) with
  `-i` reference attachment and PNG-IHDR size recording; the shared openai-images
  wire (generations + edits, true-ratio sizes, `gpt-image-2.5-sunburst` pin);
  copy-zones module (prompt↔canvas pairing, zone-anchored cover-crop); designer
  rework (jobId correlation, named `block:<role>` textboxes in Be Vietnam Pro,
  first page only, planner-failure aborts before image, AbortSignal threading,
  `origin: "generated"` stamping); per-class retry policy (metered = attempts 1);
  the errorClass → Vietnamese message map; the bidirectional mixed mock/real
  startup guard; stdout fixtures (3 OS forms + quota/login errors), failing-mock
  providers, fake-binary CliRuntime tests. Real-machine verified: image generation
  via the new bridge (~30 s, provenance "parsed") and a Vietnamese planner plan
  (blocks price/discount + date, ~6 s) on codex-cli 0.163.0.
* **Slice 2 — control + handoff.** SSE route owns a per-job AbortController
  (pre-generated jobId); Stop via `POST /api/chat/cancel` kills immediately,
  disconnect gets a ~10 s grace window, an internal 480 s budget behaves like a
  user cancel; terminal `cancelled` event with `afterCompletion`; Stop UI on Home
  and in the editor AI dock; TP.6 pre-flight (zero metered attempts on a doomed
  job), `/api/provider/status` (capabilities + diagnostics + quota counters), the
  "Chế độ thử nghiệm" mock banner, capability-gated reference composer; TP.7
  handoff by projectId only (template open, pptx branch, post-generation open —
  the `oia:scene`/`oia:project` localStorage keys are neither written nor read;
  a static test guards the removal). Verified on a live `next start`: jobId on
  8/8 events, status API, idempotent cancel.
* **Slice 3 — data.** migrate-on-save (the no-base64 rule enforced on save, reads
  tolerant; `PersistenceError` refuses unextractable data URLs listing
  violations); thumbnails and artwork dedupe to one asset; atomic JSON
  persistence (temp + rename, EPERM/EBUSY/EACCES retry backoff, per-file
  single-writer chain); chat-sessions.json stops embedding data-URL canvases; the
  SSE route awaits session persistence before closing the stream; processors
  resolve `/api/files/<key>` through the FileStore. Verified end to end on a live
  server.
* **Slice 4 — platform.** Durable task records (JSONL job log with TTL replay;
  records carry jobId/attemptNumber/provider/errorClass/retryOf); the
  cross-process cancel contract — Redis pub/sub `oia:cancel:<id>`, worker-side
  subscriber aborting in-flight handlers, `POST /api/tasks/cancel`, TaskHandler
  ctx threading signals into providers; reference-capable tasks refuse refs on
  incapable providers (`capability_unsupported`); worker logs carry the jobId
  with prompt text redacted (sha256 + length). Test-covered, validation-unexercised
  by seller sessions as designed (no Stage-0 session runs the worker).
* **Slice 5 — safety + presets.** The TP.10 non-destruction rule:
  `mergeScenePreservingUserObjects` — AI refinement rebuilds the page but every
  user-added layer (origin "user"; legacy no-origin objects default to user,
  clip rects excluded) survives on top, position intact; user-creation paths
  (text presets, shapes, image upload, tables) stamp `origin: "user"`; the
  "place a layer → refine → assert survival" test is in canvas/test. Marketplace
  presets: Shopee 1024×1024, Lazada 800×800, TikTok Shop 1080×1080 (existing
  TikTok 9:16 untouched). README: provider matrix gains `LLM_PROVIDER=codex`,
  the refinement warning is replaced by the non-destruction guarantee.

### Execution decisions inside the design's latitude

* **Provider defaults stay mock/mock** (not codex-by-default): a fresh clone keeps
  running keyless offline; the recommended pair is documented in `.env.example`
  and the README, and the mixed-config guard makes a silent half-real boot
  impossible. This preserves TP.6.3's "default mock provider labeling" story.
* **Seller-facing strings ship Vietnamese-first via i18n keys only** (mode toggle,
  mock banner, stop control, the errorClass map, quota chip). The studio chrome
  stays English; the English-only UI test is unchanged and still passes because
  no Vietnamese literal lives in a .tsx file.
* **The cancel channel carries both ids** (`oia:cancel:<jobId>` and
  `oia:cancel:<taskId>`): the web's TaskStore keys records by jobId while the
  worker's BullMQ jobs are keyed by taskId — publishing both makes the contract
  unambiguous regardless of which process serves the job.
* **TP.10 confirm round-trip**: the schema side (`renderData.confirmRequest`)
  shipped in Slice 1; the editor's default refinement path is the preserving
  merge, so nothing user-owned is ever lost without the rule already holding.
  The explicit "replace everything on this page" confirmation activates when a
  page-replacing action exists in the UI (currently none does — refinement is
  the only flow).

### Defects found and fixed while implementing (pre-existing)

* `LocalFileStore.hydrate()` indexed md5 prefixes masked as `prefix + "****"`
  while `findByMd5` looked up full hashes — dedupe silently died on every
  restart. Now a prefix index matched by 8-char filename prefix (Slice 3).
* Redis soft-skip probes were bare TCP connects — a passworded foreign container
  on :6379 faked "up" and hung BullMQ tests with NOAUTH. Probes now send a real
  PING (Slice 1, both test files).
* `parsePlannerPlan` stripped code fences AFTER JSON.parse — a fenced plan is
  not valid JSON at the outer level, so fenced output never parsed. Fences are
  stripped first (Slice 1).

### Still gated (per the design)

* Windows resolution/verification (PATHEXT, `.cmd`, `taskkill`, physical-machine
  gate + S3) — owned by the step-3 desktop design; the gate checklist re-checks
  openai/codex#40233.
* Worker-cancel and durable job logs are exercised by tests only — no Stage-0
  seller session runs the worker (chat path only, no Redis).
* `schemaVersion` + full migrations remain Stage-2 work (TP.7 scope stopped at
  corruption/data-loss paths).
* Moderated seller sessions (the Stage-0 exit criteria) have not run yet; the
  loop is now ready for them: CUJs 1–5 and 7 are test-covered end to end. The
  moderation kit (T-1 checklist, session flow, verbatim Vietnamese task cards,
  observation sheets, scoring rules) is at
  [`docs/validation/seller-sessions-kit.md`](../validation/seller-sessions-kit.md).
