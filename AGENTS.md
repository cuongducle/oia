# AGENTS.md — rules for coding agents working on Oia

## Current state (read this first)

Oia is mid-migration to **desktop-only** (Electron, macOS + Windows). The web app is
a frozen reference and will be deleted. The single source of truth for scope,
decisions (D1–D11), step status, and known debt is
[`docs/designs/desktop-only-reorg.md`](docs/designs/desktop-only-reorg.md) —
check its checklist before starting work, and update it (with gates run) after.

The design ledger for older docs is [`docs/designs/SITEMAP.md`](docs/designs/SITEMAP.md).

## Useful commands

```bash
pnpm install
pnpm exec turbo run build --filter='./packages/*'   # packages BEFORE apps
pnpm --filter @oia/web dev                          # web reference shell (frozen)
pnpm --filter @oia/desktop dev                      # the product

pnpm build && pnpm test && pnpm typecheck           # gates (turbo)
pnpm --filter @oia/desktop smoke                    # happy-path e2e (mock pair, real Electron)
pnpm --filter @oia/desktop crash-smoke              # error-path e2e: kill services → self-heal
pnpm --filter @oia/desktop shot                     # visual verification → out/*.png
```

Smoke modes are mock by default. `OIA_DESKTOP_REAL_SMOKE=1` burns real Codex quota —
never in CI, only when the owner asks.

## Hard rules

1. **Decisions live in the plan doc, not in code comments.** Code may point at a
   D-number; it must not be the only record of a product decision.
2. **`@oia-web` imports in `apps/desktop` are ratcheted to 0**
   (`config/baselines/oia-web-imports.baseline.txt`, CI-enforced). The desktop owns
   its lib copies. Never reach back into the web app.
3. **Atomic writes for every persisted state** (temp + rename, EPERM/EBUSY retry —
   see `packages/tasks/src/atomic.ts`). A crash mid-write must never corrupt a store.
4. **Error-path gates, not happy-path only.** Every fix to a defect gets a
   regression test that reproduces the failure mode (crash, race, timeout, TTL).
   Green build/test/smoke proves nothing about paths it never exercises.
5. **Records must not lie** (B7): cancelled jobs record cancelled outcomes; a job
   interrupted by a restart is marked failed at boot; task handlers run exactly
   once when metered (G3) — retries are new tasks, never silent re-runs.
6. **Quota is money.** Nothing may repeat or orphan a paid generation: noWait
   semantics stay exact, cancellation kills the detached CLI trees, quit waits
   (bounded) for cancel before kill.
7. **Loopback agent API (D9) security gates fire before any route logic**: literal
   `127.0.0.1:<port>` Host, reject every `Origin` header, no CORS headers ever,
   key via `Authorization` header only, 50 MB body cap.
8. **English UI (D8, final).** Vietnamese stays content-level (Be Vietnam Pro
   renders seller copy). Do not add UI strings in other languages.

## First-class citizens

- **macOS AND Windows.** A passing macOS build is not evidence for Windows (D3).
  BEFORE changing process spawning, file paths, the codex bridge, or the
  Electron shell, read
  [`docs/reference/cross-platform-support.md`](docs/reference/cross-platform-support.md)
  — it is the distilled battle log (`.cmd` shims, `C:\` path shapes, GUI-launch
  PATH, EPERM renames, detached trees, `.cjs` preload, `oia://` CORS).
- **The seller's quota.** Every generation path must be cancellable, metered once,
  and visible (UI or agent-job events).
- **Wire contracts are stable names.** `errorClass` / error `name` cross IPC and
  HTTP; the renderer and skills map on them. Renaming one is a breaking change.

## Reuse before reimplementing

Before writing new logic at any scale — a store call, an IPC handler, an HTTP
route, a validation — check whether it already exists:

- `@oia/tasks` (stores, processors, upload, api keys) and `@oia/services`
  (chat orchestration, quota, context) own the logic; shells only wire it.
- **The web app's routes are the reference implementation of every API
  semantic.** When porting, mirror them exactly — drift here produced the
  `language`-field skill bug (the API rejected a field the skill sent, and
  nothing caught it until the live e2e).
- `@oia/schema` is the single home for shapes, versions, and constants.

## Code style pointers

- **Comments**: only when code does not describe itself; one line if possible;
  WHY, not how; cite the spec tag (`TP.7`, `D9`) as a pointer, never as the only
  record of a decision.
- **Type assertions**: avoid except `as const`. An unavoidable cast needs a
  line-specific `SAFETY:` comment saying why it cannot lie.
- **File naming**: name files after the domain concept they hold
  (`copy-zones.ts`, `utilityClient.ts`), never after their role (`helpers`,
  `utils`, `common`) — those become dumping grounds.
- Full conventions: [`docs/STYLEGUIDE.md`](docs/STYLEGUIDE.md).

## UI validation

- `pnpm --filter @oia/desktop shot` is the scripted eyes: it opens the real
  window, drives the bridge, and asserts painted pixels (not just DOM). Extend
  it when porting views — a view without a shot check is unverified.
- Rebuild (`electron-vite build`) before launching smoke/shot after changing
  startup/launch-policy code — a stale `out/` wrapper can run old behavior and
  produce confident nonsense.
- The gates run in CI on Linux (xvfb). They prove wiring, not platform
  behavior: platform claims need the real-machine gates (step 7).

## Tests

Before adding a test, check it against
  [`docs/reference/test-antipatterns.md`](docs/reference/test-antipatterns.md).
  The short version: gate the error path, exercise real stores/servers over temp
  dirs, never count tests as coverage.

## Architecture map (post step 4a)

```text
apps/desktop/src/main      windows, menus, dialogs, oia:// protocol, runtime controller
apps/desktop/src/utility   ServiceContext: runChat, task store, stores, files, loopback API
apps/desktop/src/preload   contextBridge (sandboxed, .cjs)
apps/desktop/src/renderer  React UI (views, lib) — English
apps/desktop/src/shared    IPC schemas/channels + main↔utility wire protocol

packages: schema → protocol/providers/agent/canvas → tasks → services → shells
```

Known debt (deferred, deliberate) is listed at the end of the reorg plan —
do not "discover" it as new; do not fix silently either: update the ledger.

## Style

Code conventions: [`docs/STYLEGUIDE.md`](docs/STYLEGUIDE.md).
Commit style: imperative subject + structured body explaining WHY (see `git log`).

## Git / GitHub

- Commit style and gates-run evidence: see STYLEGUIDE "Commits".
- A failed CI run: `gh run rerun <run-id> --failed` reruns only the failed jobs —
  preserve the green ones. A code fix always needs a new push and fresh checks,
  never a rerun of the old SHA.
- The `@oia-web` ratchet and the smoke gates live in `.github/workflows/ci.yml`;
  if a change legitimately needs to move a baseline DOWN is fine, UP never
  (baselines only decrease).
