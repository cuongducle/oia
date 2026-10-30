# Test anti-patterns

Each pattern below has either produced a real miss in this repository or is one
step away from one. When a review says "this test is low-value", it points here.

## Tests that

- **Gate only the happy path.** Build/test/smoke green certified nothing while
  four severe defects shipped (see `docs/bug-reproductions/2026-10-30-utility-process-defects.md`).
  Every fix to a crash/race/timeout/restart bug ships a regression test that
  reproduces the failure mode itself.
- **Count instead of cover.** "Total tests did not decrease" is not a migration
  gate — a behavior matrix is (each behavior the old tests covered ↔ its new
  home). Numbers lie; behaviors don't.
- **Reimplement production logic instead of exercising it.** If the test
  re-derives the expected scene/version/envelope from the same constants, it
  asserts the constant twice, not the behavior.
- **Assert only what their own mocks supplied.** A mocked provider returning a
  hand-built error proves the mapping of THAT object — assert against the real
  `ProviderError` taxonomy or a recorded fixture instead.
- **Wait on real time or networks.** Use fake clocks / deterministic boundaries;
  a `sleep(6500)` test will flake CI exactly when CI is slowest.
- **Check persistence at a path the code never writes.** Stores take an explicit
  path/file parameter for a reason — point tests at a temp dir, assert the file
  on disk, not just the in-memory copy.
- **Pass negative cases without exercising the intended rejection path.**
  Assert the 401/404/413 envelope AND the code path that produced it (the
  loopback tests reject via Host/Origin/query-key gates specifically).
- **Treat a one-off manual run as a gate.** The live skill-script e2e that ran
  once on a dev machine proved the design, not the build. Repeatable gates live
  in the repo (`smoke`, `crash-smoke`, `shot`) and run in CI.
- **Assert an element exists and call the visual verified.** The shot gate
  checked `.scenePreview` EXISTS while fabric 7's center-origin default drew
  every thumbnail quarter-size and half-clipped — for two weeks, until the
  owner looked. Visual claims need geometry or pixels: the fit gate now asserts
  every canvas rect sits inside its card (fitOk), and the fix was verified by
  scanning the rendered bitmap's content bbox (fill 0.25 → 1.0).

## Fixtures that

- **Re-type wire literals instead of recording them.** Recorded fixtures keep
  the raw `"7.3.1"` scene version ON PURPOSE — they are legacy wire data; the
  constant lives in code, the fixture stays frozen.
- **Hide contract drift behind hand-built objects.** If the schema changes, a
  hand-built "valid" payload keeps passing. Build fixtures from the real
  producers (a real `ServiceContext`, a real store round-trip).
- **Duplicate for minor variants.** One factory + parameters beats five near
  copies that rot independently.

## Production code that

- **Adds exports, wrappers, or globals solely for tests.** If a test needs a
  private, the design usually wants a seam (a store parameter, an injected
  `Clock`) — add the seam, not a peek-hole.
- **Swallows errors to keep tests green.** `catch {}` around a call whose
  failure the test should observe is the test lying on the code's behalf.
