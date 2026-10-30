# Oia Desktop — app design (macOS + Windows)

* **Author:** cuongducle (+ agent draft)
* **Date:** 2026-10-30
* **Status:** APPROVED (owner, 2026-10-30 — Q1–Q10 accepted with the recommended defaults; Q11 UI-language decision recorded 2026-10-30). **D1 shipped** (TP-D2 note below). **D2 gate OVERRIDDEN by owner (2026-10-30, "đã bảo skip seller")** — seller sessions are skipped by explicit owner decision; the loop therefore ships UNVALIDATED by real sellers and that risk is carried on the register below. D2 increments 1–2 shipped the same day (shell + remediation, then the full renderer port).
* **Predecessors:**
  * [`../desktop-architecture.md`](../desktop-architecture.md) — cross-platform research (reference apps, packaging, storage, security)
  * [`banner-maker-loop-stage-0.md`](banner-maker-loop-stage-0.md) — the engine + the honest done/deferred ledger; **Windows work and the S3 gate are owned by THIS design** (moved here 2026-10-29)

--------------------------------------------------------------------------------

## Overview

The end product is one desktop app for macOS and Windows serving one persona: the
Vietnamese online seller making promo banners. The engine that Stage 0 built
(providers / agent / tasks / schema / protocol / canvas) is reused **unchanged** —
this design is the shell, the service boundary, Windows completion, install-and-upgrade
persistence, and the zero-terminal onboarding that the web app can never give.

**Staged path (from the Stage-0 design, kept):**

| Step | State |
| --- | --- |
| 1 — engine on the web shell (Stage 0) | **Implemented** (5 slices + remediation; CI green; real-Chrome QA) |
| — seller sessions (Stage-0 exit gate) | **Not run** — packaging investment is gated on it (see Gates) |
| 2 — persistence hardening | Folded INTO this design as TP-D5 (desktop makes it mandatory, not optional) |
| 3 — this design | the desktop shell; the web app retires when it ships (owner, 2026-10-28) |

## Core readiness (assessed 2026-10-30 — the honest gate table)

| Layer | Ready | Notes |
| --- | --- | --- |
| packages/providers (CliRuntime, codex bridge, planner, wire) | ✅ | invariants pinned by tests; real codex verified on macOS |
| packages/agent, schema, protocol, tasks | ✅ | blocks, taxonomy, cancel, atomic persistence, non-destruction |
| Loop validation with real sellers | ❌ | sessions not run — gate D2+ below |
| Windows | ❌ | code paths exist (cross-spawn, tree-kill→taskkill, 3-form path parsing) but **never executed on Windows**; S3 physical gate pending; re-check openai/codex#40233 |
| Install-and-upgrade persistence | ❌ | schemaVersion/migrations/per-project files = TP-D5 here (was "Stage 2") |
| Service boundary | ❌ | logic lives in 19 fetch routes; must extract before IPC (TP-D2) |
| Onboarding | ❌ | biggest recorded validation gap: install Node/CLI/login in a terminal — TP-D3 removes the terminal entirely |

## The Problem

1. **Sellers cannot install the web app.** Node + pnpm + Codex CLI + `codex login` in a
   terminal is the exact barrier the persona rejects; the research doc forbids requiring
   Node/Redis/Docker for a desktop build.
2. **The engine is trapped in a self-hosted web app** whose fate is transitional (owner,
   2026-10-28): when desktop ships, the public site becomes a landing/download page only.
3. **Windows is half the audience and unverified** (B4 deferred here): binary resolution
   (`.cmd`/PATHEXT), `taskkill` process-tree kill, and the `image_gen` hang with local
   references (openai/codex#40233) all need a physical Windows machine.
4. **Upgrades will happen** (auto-update) — without schemaVersion + migrations, an update
   can corrupt every project at once; the web app never faced install-and-upgrade.

## Goals

* **G-D1 — Zero-terminal onboarding:** install → launch → log in to ChatGPT inside the
  app → first banner. No Terminal, no Node, no PATH, no Redis/Docker.
* **G-D2 — One codebase, two platforms:** macOS + Windows from a single Electron app;
  per-OS verification, shared engine.
* **G-D3 — Engine reuse unchanged:** the desktop shell calls `packages/*` directly; no
  engine forks between web and desktop while both live.
* **G-D4 — Import existing work:** first-run import of a web-app `.data` directory
  (projects, sessions, templates, files) — required input per the Stage-0 design.
* **G-D5 — Survive upgrades:** `schemaVersion` + migrations + per-project files under
  `userData`; electron-updater with signed packages.
* **G-D6 — Windows verified for real:** S3 physical-machine gate + CUJ 6 (first Windows
  run) + #40233 re-check at gate time.
* **G-D7 — Honest degradation carried over:** mock labeling, Vietnamese error map,
  quota counters, diagnostics export — same behaviors as the web shell.

## Non-Goals

* Linux; mobile; multi-user/accounts/billing; a hosted service.
* Porting the full studio (15 skills, community library, share links, agent API) —
  **banner lane only** (M6): Home composer, chat loop, editor, templates, export.
* Shipping Redis/BullMQ inside the desktop app (single-user, in-process queue path).
* Any new engine capability — this design consumes Stage 0, it does not extend it.

## Resolved Decisions (owner gates — each carries a recommendation)

| # | Decision | Recommendation | Status |
| --- | --- | --- | --- |
| Q1 | App framework | **Electron + electron-vite** (research rec; engine is Node — Tauri would need a Node sidecar anyway) | ACCEPTED 2026-10-30 |
| Q2 | Renderer strategy | **Port the existing React pages to Vite** (components/libs already framework-agnostic: `@oia/canvas`, `libs/*`); do NOT embed a Next server (research: not required; double runtime) | ACCEPTED 2026-10-30 |
| Q3 | Web app fate | Transitional → **retire at desktop ship** (already decided 2026-10-28) — confirm no extension | ACCEPTED 2026-10-30 (confirmed: retire at ship) |
| Q4 | Codex runtime | **Detect → guide → auto-provision**: PATH binary if present, else download the official CLI per-OS with checksum at first run; never bundle without license check (spike S5) | ACCEPTED 2026-10-30 |
| Q5 | In-app login | Wrap `codex login` (browser + local callback) in an in-app flow; no terminal (spike S6 verifies the flow + flags on both OS) | ACCEPTED 2026-10-30 |
| Q6 | Queue/worker | **In-process only** on desktop (no Redis, no worker process); BullMQ stays web-only until web retires | ACCEPTED 2026-10-30 |
| Q7 | IPC boundary | Typed IPC with runtime validation (zod), contextIsolation on, no nodeIntegration in the renderer; service layer extracted from the route handlers (TP-D2) | ACCEPTED 2026-10-30 |
| Q8 | Persistence | TP-D5 = old "step 2" pulled forward: `schemaVersion`, migrations, per-project files, `userData` root, `.data` importer | ACCEPTED 2026-10-30 |
| Q9 | Signing & updates | macOS: Apple Developer Program + notarization. Windows: signed installer (Azure Trusted Signing if eligible, else cert) + SmartScreen reality; electron-updater + GitHub releases. **Recurring cost — owner accepts before D6** | ACCEPTED 2026-10-30 |
| Q10 | Scope | Banner lane only (M6): composer, chat loop, editor, templates, marketplace presets, export PNG/JPG/PDF/PPTX | ACCEPTED 2026-10-30 |
| Q11 | UI language | **English UI — no Vietnamese strings in interface code** (owner, 2026-10-30, during the D2 renderer port: "bỏ hết tiếng việt trong giao diện code"). Vietnamese is supported at the CONTENT/FONT level only: Be Vietnam Pro ships bundled (latin+vietnamese subsets) so banner text the seller types renders perfectly; the mock/smoke prompts deliberately exercise Vietnamese content. The desktop keeps error CLASSIFICATION from `@oia-web/libs/provider-errors` but maps keys to its own English copy (`renderer/lib/errors.ts`) — the web app's Vietnamese-first i18n is untouched. | DECIDED by owner 2026-10-30 |

## Critical User Journeys

* **CUJ-D1 — First run (Windows):** download installer → install (no admin if possible) →
  launch → the app provisions/detects the Codex CLI → in-app ChatGPT login → types
  "banner trà sữa giảm 20% ngày 8/11" → editable blocks → export Shopee PNG. Zero terminal.
* **CUJ-D2 — Upgrade:** v1.1 auto-update installs over v1.0 → all projects open
  (migrations ran on first launch; a failed migration quarantines, never deletes).
* **CUJ-D3 — Windows reference run (the S3 gate):** one `-i` generation with a local
  product photo on a physical Windows machine, logged-in, shipped CLI version — pass
  criterion from the Stage-0 design.
* **CUJ-D4 — Degraded:** Codex missing/logged-out → app still opens, editor works,
  paste-image + templates available, mock labeled "Chế độ thử nghiệm".
* **CUJ-D5 — Web import:** point the importer at a `.data` folder → projects/sessions/
  templates/files land in the desktop store; originals untouched.

## Technical Plan

### TP-D1 — Shell architecture
Electron + electron-vite; main / preload / renderer separated (research §2): main owns
windows, dialogs, updates, runtime provisioning; typed IPC surface in preload (explicit
channels — no generic `invoke` passthrough); renderer is the ported React app (Q2) with
`@oia/canvas`, `@oia/protocol`, i18n, provider-errors reused as-is. External content is
never loaded into a privileged context.

### TP-D2 — Service boundary (the M5 extraction, done once) — SHIPPED as D1
`packages/services` exists and owns: `createServiceContext` (stores + metered providers
+ task processors + optional Redis cancel publisher — the ONE context both shells
construct), `runChat` (the full chat orchestration: pre-flight, G3 guard, 480 s budget,
assetization, stage-aware retry, terminal cancelled, session persistence — transport-free,
sink-based), the cancel registry, and the quota meter. The web app is now a THIN adapter
layer (SSE frames, heartbeat, disconnect grace over `runChat`; JSON routes over the same
context) — task processors are registered once inside the context, so the desktop shell
inherits them without duplication. Refined during D1: the stores themselves
(projects/sessions/templates/files) already are transport-free services — wrapping them
again would be indirection without logic, so the service layer owns ORCHESTRATION only
(chat, context, status, cancel) and the stores remain the CRUD surface both shells call.

### TP-D3 — Codex runtime management (zero-terminal)
Reuse `CliRuntime`/bridge unchanged on top of a `RuntimeProvisioner`: detect (PATH →
bundled → guided download with checksum), health + version surface in the existing
diagnostics panel, in-app login wrapper (Q5), per-user scratch under `userData`/tmp.
Prompt-injection posture carried over verbatim (stdin, `--ignore-user-config`, pinned
model, role-scoped sandbox).

### TP-D4 — Windows completion
cross-spawn/tree-kill already in; add Windows e2e fixtures (path forms, `.cmd` spawn,
taskkill tree), a Windows CI build job, and the **physical-machine gate**: S3 + CUJ 6 +
#40233 re-check — a passing macOS build is not evidence (research rule; Stage-0 B4).

### TP-D5 — Persistence v2 (old step 2, now mandatory)
`schemaVersion` on every store; per-project files (no more whole-file `projects.json`
rewrites — atomicWriteJson per file); migrations keyed by version (failed migration ⇒
quarantine + diagnostics export, never delete); storage rooted at Electron `userData`;
`.data` importer (CUJ-D5). The chat SSE assetization and migrate-on-save from Stage 0
carry over unchanged.

### TP-D6 — Packaging, signing, updates
electron-builder (NSIS + dmg/zip), electron-updater against signed GitHub releases;
release channels (beta/stable); the public website flips to landing/download at ship.
Budget items (Apple Developer Program, Windows signing, update hosting) accepted at Q9.

### TP-D7 — Diagnostics (M4, launch-blocking)
One click: "Export diagnostics bundle" — job log (TTL JSONL), CLI transcripts (redacted),
provider diagnostics, quota counters, app/version/OS. This is the only incident artifact
a non-technical user can produce.

## Implementation Plan (slices, each with green tests and a gate)

| Slice | What | Gate |
| --- | --- | --- |
| D0 | This design + owner gates Q1–Q10 | ✅ approved 2026-10-30 |
| D1 | TP-D2 service extraction **on the web** — web still green | ✅ shipped 2026-10-30 (18/18 test packages green incl. new @oia/services contract tests; live-server smoke) |
| D2 | TP-D1 shell + renderer port (macOS, mock providers end-to-end in the shell) | gate OVERRIDDEN by owner 2026-10-30; **increment 1 shipped + remediated same day**. The first pass claimed "canvas preview" without ever opening the window — a self-review caught it, and the fix pass found a four-layer breakage chain, each fixed and verified: (1) `file://` cannot load `/api/files` assets → `oia://files/<key>` custom protocol over the LocalFileStore; (2) sandboxed preloads may require nothing but electron → channels split out as pure data, schemas stay main-only, preload built as `.cjs` (`type:module` made `.js` load as ESM and silently die); (3) scene images carry `crossOrigin=anonymous` → scheme needed `corsEnabled: true` + ACAO or every image fails CORS; (4) fabric's upper-canvas is a sibling, not a child. Verification now has EYES: `OIA_DESKTOP_SHOT=1` drives the real window through the bridge and asserts painted pixels on the fabric canvas (`{"ok":true,"painted":407160}`), plus a PNG artifact. Window close cancels in-flight jobs; sandbox on; will-navigate/window-open denied; CSP tightened (oia:, no localhost); zod/ProviderConfig errors localize to Vietnamese (superseded by Q11 in increment 2 — English copy); ChatRequest schema exported from @oia/services as the ONE boundary schema (web adapter 400s on junk now); bridge typed once (shared/bridge.ts); desktop test suite added; CI gained an xvfb desktop-smoke job; electron pinned 39.8.10. **Increment 2 (renderer port) shipped same day** — see the D2 remainder ledger below: full editor (canvas/layers/text/shapes/tables/draw, undo/redo, autosave, multi-page), AI dock with the TP.10 merge, size presets, native-dialog export (PNG/JPG/PDF/PPTX/ZIP), template gallery, Workspace lists + session resume, Be Vietnam Pro bundled offline, English UI per Q11. `pnpm shot` now verifies all three views with painted-pixel assertions |
| D3 | TP-D3 codex in-app runtime + login (macOS, real login) | D2 |
| D4 | TP-D5 persistence v2 + `.data` importer | D2 |
| D5 | TP-D4 Windows build + fixes | D3+D4 on macOS |
| D6 | TP-D6/TP-D7 signing, updates, diagnostics, landing flip | **S3 physical gate passed**; Q9 budget accepted |

Gates restated: packaging investment (D2+) starts only after the seller sessions meet
the Stage-0 exit criteria — the unproven-loop rule. D0–D1 may proceed now.

## Remaining work (task ledger, updated 2026-10-30)

The consolidated list of everything between here and a shippable v1 desktop app.
Owner gates are marked 👤; everything else is implementable work.

### D2 remainder — renderer port (macOS, mock-first) — **SHIPPED 2026-10-30**

**Studio-refresh parity pass (2026-10-30, later the same day):** a visual audit against
`docs/private/ui-audit/orig-*.png` (SurgePix) and the web studio refresh
(`docs/design-direction.md`) found the port had been written against the PRE-refresh
web design. Pass shipped (verified by the extended `shot` run + vision review):
protocol no longer leaks the literal `<Result>` marker; the mock designer emits a
BR-2 settle event so the timeline cannot hang on “running”; Home gained the serif
display hero (Instrument Serif bundled offline), the full composer (attach/ratio/
resolution/advanced pages+outline), format quick-starts, result actions (Preview /
Open in editor named from exportMeta / Use as reference / native-save PNG) and the
Featured/All gallery with real ScenePreview thumbnails; Workspace cards gained
hover Rename/Delete dialogs; the editor AI dock gained a capability-gated paperclip
attach. `pnpm shot` now captures every view zoom-fitted to full page height.
Known remaining (by design): no sidebar/credits/brand-kit/toolbox surfaces (Q10
banner lane), share links are web-only.
All seven items shipped in one pass; UI copy is English per Q11 (new decision during this
increment). Every view is verified by the extended `shot` run (eyes, not claims): Home
chat → canvas painted; editor mounts (7 rail tools, AI dock, page strip) with painted
artboard and autosave settling dirty→saved (proves the projects:save round-trip);
Workspace lists projects (ScenePreview thumbs) + recent conversations. What changed vs
the web editor beyond the transport (fetch → typed IPC):
- [x] Editor port: fullscreen editing shell (canvas, layers, text/shapes/tables, undo/redo, autosave) over IPC + `@oia/canvas` — autosave creates-or-saves by projectId (TP.7); scenes persist in canonical `/api/files/` form, the renderer maps to `oia://` for display and back on save
- [x] Editor AI dock: refine flow with the non-destruction merge (TP.10 already in `@oia/canvas`) — streams over the bridge subscription, TP.5 cancel, TP.11 capability-gated refs sent in canonical form
- [x] Marketplace size presets panel (Shopee/Lazada/TikTok Shop — data already in `@oia/canvas`) — "Apply size to all pages" included
- [x] Export: PNG/JPG (canvas), PDF/PPTX/ZIP (jspdf/pptxgenjs/jszip bundled in the renderer) → bytes over IPC → **native save dialog** (`export:save`), never a browser download anchor
- [x] Template gallery + open-template → project-by-id handoff (services exist) — studio seeds + local community store; publish-template writes the local TemplateStore
- [x] Projects/workspace list + recent — Workspace view over `projects:list`/`sessions:list`, blank-create + image-import (upload → assetize → project), session resume into Home
- [x] Studio design-system parity (tokens, fonts bundled — Be Vietnam Pro ships offline) — 5 weights × latin+vietnamese subsets as Vite-emitted assets (relative URLs; `/fonts/` absolute paths break under file://), studio webp artwork in renderer public (mapped `/studio/` → relative for the same reason)

New IPC surface (typed, zod-validated in main): `projects:list/save/remove`, `templates:list/create`, `sessions:list/get`, `files:upload` (25 MB image cap, same NSFW gate as web), `export:save` (native dialog + write). Native app menu (app/edit/view/window) added — macOS Cmd+C/V and quit behave like a real desktop app. Fabric realigned to ^6.9.1 (the D2 scaffold had pinned 7.4.0 against @oia/canvas's 6.x — two fabric copies, type-level breakage).

### D3 — Codex in-app runtime
- [ ] Spike S5: Codex CLI redistribution licensing + auto-provision (download + checksum) viability
- [ ] Spike S6: in-app login flow (`codex login` browser+callback) on macOS and Windows
- [ ] RuntimeProvisioner: PATH → bundled → guided download; diagnostics panel reuse
- [ ] Real-login end-to-end in the shell (macOS; quota-billed verification runs)

### D4 — persistence v2 (install-and-upgrade)
- [ ] `schemaVersion` on every store + migration framework (failed migration ⇒ quarantine, never delete)
- [ ] Per-project files (stop whole-file `projects.json` rewrites)
- [ ] `.data` importer (web → desktop first run; projects/sessions/templates/files)
- [ ] userData storage layout freeze

### D5 — Windows
- [ ] Windows build in CI (build-only job first)
- [ ] Windows e2e fixtures (`.cmd` spawn, taskkill tree-kill, `C:\` path forms)
- [ ] 👤 S3 physical gate: one `-i` reference generation on a real Windows machine + re-check openai/codex#40233 (owner runs; checklist in the Stage-0 kit applies)
- [ ] CUJ 6 verification: first Windows run end to end

### D6 — packaging, signing, updates
- [ ] electron-builder: dmg/zip (macOS) + NSIS (Windows)
- [ ] electron-updater against signed releases + beta/stable channels
- [ ] 👤 Apple Developer Program enrollment + notarization (recurring cost)
- [ ] 👤 Windows signing path (Azure Trusted Signing or cert) — SmartScreen reality accepted
- [ ] TP-D7 diagnostics bundle export (one click: job log, transcripts, provider status)
- [ ] Landing-page flip: website → product + downloads

### Carried risks / deliberately deferred (recorded, not hidden)
- Seller sessions skipped by owner override — the loop ships **unvalidated by real sellers**; the moderation kit stays ready if this is revisited
- A7 `protectBox` (needs a product-bbox source), TP.10 confirmRequest UI (no page-replace action yet), format_drift stays log-level
- Worker/BullMQ topology remains a web-deployment path only (desktop is in-process by design)
- Web app retirement at ship (Q3) — the 19 routes thin out as services absorb them

## Alternatives Considered

1. **Tauri vs Electron** — Electron chosen (research §1): the engine is Node; Tauri
   would require a Node sidecar process anyway, adding IPC complexity without removing a
   runtime. Revisit only if bundle size becomes a real complaint.
2. **Embed the Next.js server in Electron** — rejected (research §1): double runtime,
   port conflicts, memory; the renderer port (Q2) reuses the actual React components.
3. **Web app + PWA instead of desktop** — rejected: onboarding (the #1 recorded gap) is
   unsolvable in a browser (no CLI access, no local login flow); local data custody.
4. **Keep `projects.json` single-file** — rejected for desktop: auto-update makes
   corruption all-or-nothing; per-project files cap the blast radius (TP-D5).
5. **BullMQ inside desktop** — rejected: single user, single process; the in-process
   queue path already exists and is what Stage-0 sessions run.

## Risks (register)

| Risk | Mitigation |
| --- | --- |
| Codex channel closes/changes (accepted Q2, Stage 0) | degradation lane + diagnostics carried into the shell unchanged |
| Windows `image_gen` hang with local refs (#40233) | S3 physical gate re-checks at gate time; fallback documented |
| Codex CLI redistribution licensing unknown | spike S5 BEFORE D3; guided download is the fallback |
| Renderer port scope creep (studio design system) | banner lane only (Q10); port Home/Editor, not the whole studio |
| Loop unproven with sellers | gate OVERRIDDEN by owner (2026-10-30) — sessions skipped; risk ACCEPTED and carried: no seller has completed the loop, so packaging proceeds without the exit evidence the Stage-0 design required |
| Signing/SmartScreen cold-start friction (Windows) | Q9 budget + beta channel through the landing page |
| Migration failure destroys user data | quarantine-not-delete rule + pre-migration snapshot in the bundle |

## Spikes

* **S3 (moved from Stage 0):** one `-i` reference generation on a physical Windows
  machine with the shipped CLI; re-check #40233; record output-path forms seen.
* **S5:** Codex CLI distribution channels per OS + redistribution license; auto-provision
  download + checksum viability (Q4).
* **S6:** in-app login flow — `codex login` browser+callback behavior on macOS/Windows,
  timeout/refresh, logout handling (Q5).
* **S7:** renderer port proof-of-concept — Home page in electron-vite loading
  `@oia/canvas` + i18n + a mocked chat stream over IPC (sizes the D2 slice honestly).

## Sources

* `docs/desktop-architecture.md` (research: Cherry Studio / Chatbox / AFFiNE / LosslessCut snapshots)
* `docs/designs/banner-maker-loop-stage-0.md` (engine + honest ledger + gates moved here)
* openai/codex#40233 — Windows `image_gen` hang with local reference images
* Electron security guidance (contextIsolation, no remote content) per research §2
