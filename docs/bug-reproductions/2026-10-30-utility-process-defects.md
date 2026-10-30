# 2026-10-30 — Utility-process defects (4 severe, found by self-review, fixed same day)

Introduced by reorg steps 4a/4b (commits `6960da6`, `aa0740d`); found by an
adversarial self-review; fixed in `442fdf4`. Recorded here because each one is a
*pattern* that will try to come back.

## 1. One crash bricked the service layer until app restart

- **Symptom:** kill the utility process → every service IPC call rejects
  `UtilityProcessCrashed: services process unavailable` forever.
- **Root:** `exitInfo` was set on exit but never reset on the next fork, AND
  `ensureUtility()` cached by mode alone — so after a crash it early-returned and
  never re-sent `init` to the fresh process.
- **Fix:** a `generation` counter bumps on every fork; the cache key is
  `(mode, generation)`. Exit handlers are guarded by generation, not object
  identity — the first guard version (`this.child !== child`) actually blocked
  the legitimate exit event because `kill()` nulls the child; the new gate
  caught this itself on its first run.
- **Gate:** `pnpm --filter @oia/desktop crash-smoke` (CI): kill mid-session →
  the next call self-heals (`before=N recovered=N`).
- **Pattern:** any "cached remote" must key its cache on the remote's identity
  (generation/connection), not just on its configuration.

## 2. Fixed-TTL concurrency guard → 6.5-minute 429 lockout

- **Symptom:** one background (`noWait:false`) agent submit → every later submit
  429 "a generation is already running" for 6.5 minutes, even though the task
  finished in milliseconds.
- **Root:** the in-flight counter decremented on a hard-coded TTL because
  TaskStore exposed no completion hook. A guess masquerading as accounting.
- **Fix:** `SubmitOptions.onSettled` in `@oia/tasks` — `runToCompletion` never
  rejects, so it always fires exactly once with the terminal status. The TTL
  remains only as a 15-min hang fallback and force-fails the job for observers.
- **Gate:** regression test — background task settles → an immediate next submit
  must NOT be 429 (`test/loopback.test.ts`).
- **Pattern:** never substitute a timeout for a signal when the signal exists.
  Add the hook instead.

## 3. Quit race could orphan a quota-burning codex child

- **Symptom (potential):** quit the app mid-generation → the detached codex
  process tree survives the app and keeps burning ChatGPT quota with no UI.
- **Root:** `before-quit` fired `cancelAll` (fire-and-forget) and killed the
  utility on the next line — the cancel message could be SIGTERM'd in flight.
  Codex children are spawned detached (process-group) on POSIX, i.e. immune to
  parent death by design.
- **Fix:** `before-quit` prevents default, awaits `cancelAll` bounded at 3 s
  (abort → CliRuntime kills the trees), then kills; the utility traps SIGTERM
  and cancels everything before exiting.
- **Pattern:** any detached-child owner needs a shutdown handler that first
  signals the children, THEN dies — and the wait must be bounded so quit can
  never hang.

## 4. No RPC timeout anywhere

- **Symptom (potential):** a wedged `init` (provider probe hang) hung the
  `buildLock` promise chain → every service IPC handler pending forever. The
  app stays "open" and unusable.
- **Root:** request/response with no deadline; pending map with no expiry.
- **Fix:** per-command timeouts (chatRun 12 min — above the codex budget,
  init/rebuild 2 min, default 30 s) fail fast as `UtilityTimeout`; the pending
  entry is removed so a late response is dropped, not resolved into nothing.
- **Pattern:** every cross-process call needs a deadline. Choose per-command,
  not one global number — a chat and a store read do not share a budget.

## Meta-lesson (the reason this file exists)

All four were invisible to the gates that had just run "green": build, tests,
and the happy-path smoke exercised none of these paths. **Happy-path gates
certify nothing about error paths.** Every defect fix now ships a regression
gate for its own failure mode — that rule is AGENTS.md #4.
