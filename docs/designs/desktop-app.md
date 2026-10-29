# Oia Desktop — app design (macOS + Windows)

* **Author:** cuongducle (+ agent draft)
* **Date:** 2026-10-30
* **Status:** DRAFT — owner gates open (Q1–Q10 below); not yet reviewed/approved
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
| Q1 | App framework | **Electron + electron-vite** (research rec; engine is Node — Tauri would need a Node sidecar anyway) | OPEN |
| Q2 | Renderer strategy | **Port the existing React pages to Vite** (components/libs already framework-agnostic: `@oia/canvas`, `libs/*`); do NOT embed a Next server (research: not required; double runtime) | OPEN |
| Q3 | Web app fate | Transitional → **retire at desktop ship** (already decided 2026-10-28) — confirm no extension | OPEN (confirm) |
| Q4 | Codex runtime | **Detect → guide → auto-provision**: PATH binary if present, else download the official CLI per-OS with checksum at first run; never bundle without license check (spike S5) | OPEN |
| Q5 | In-app login | Wrap `codex login` (browser + local callback) in an in-app flow; no terminal (spike S6 verifies the flow + flags on both OS) | OPEN |
| Q6 | Queue/worker | **In-process only** on desktop (no Redis, no worker process); BullMQ stays web-only until web retires | OPEN |
| Q7 | IPC boundary | Typed IPC with runtime validation (zod), contextIsolation on, no nodeIntegration in the renderer; service layer extracted from the route handlers (TP-D2) | OPEN |
| Q8 | Persistence | TP-D5 = old "step 2" pulled forward: `schemaVersion`, migrations, per-project files, `userData` root, `.data` importer | OPEN |
| Q9 | Signing & updates | macOS: Apple Developer Program + notarization. Windows: signed installer (Azure Trusted Signing if eligible, else cert) + SmartScreen reality; electron-updater + GitHub releases. **Recurring cost — owner accepts before D6** | OPEN |
| Q10 | Scope | Banner lane only (M6): composer, chat loop, editor, templates, marketplace presets, export PNG/JPG/PDF/PPTX | OPEN |

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

### TP-D2 — Service boundary (the M5 extraction, done once)
The 19 fetch routes keep their web shape but thin down to adapters over a new
`packages/services` (or `apps/desktop/services`) layer: chat streaming (an async
generator the renderer consumes as IPC events), projects CRUD + migrate-on-save, file
store, chat sessions, provider status/quota, task submit/cancel. Both shells call the
same services; nothing is implemented twice. This ships **on the web first** and the web
keeps working (D1 slice) — extraction is verifiable before any Electron exists.

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
| D0 | This design + owner gates Q1–Q10 | owner review (EGM) |
| D1 | TP-D2 service extraction **on the web** — web still green | none (pure refactor; parallel-safe with seller sessions) |
| D2 | TP-D1 shell + renderer port (macOS, mock providers end-to-end in the shell) | **Stage-0 exit met** (seller sessions) |
| D3 | TP-D3 codex in-app runtime + login (macOS, real login) | D2 |
| D4 | TP-D5 persistence v2 + `.data` importer | D2 |
| D5 | TP-D4 Windows build + fixes | D3+D4 on macOS |
| D6 | TP-D6/TP-D7 signing, updates, diagnostics, landing flip | **S3 physical gate passed**; Q9 budget accepted |

Gates restated: packaging investment (D2+) starts only after the seller sessions meet
the Stage-0 exit criteria — the unproven-loop rule. D0–D1 may proceed now.

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
| Loop unproven with sellers | D2+ hard gate on Stage-0 exit |
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
