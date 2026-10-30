# Oia style guide — conventions for code and changes

Companion to [`AGENTS.md`](../AGENTS.md) (operational rules) and
[`designs/design-direction.md`](designs/design-direction.md) (visual direction).
This file records the conventions the codebase already follows — keep new code
inside them or change them here first.

## Traceability tags

Comments cite the spec item they implement or fix:

| Prefix | Meaning | Examples |
|---|---|---|
| `TP-xx` | Task-package / task-processing contract | TP.4 correlation ids, TP.5 cancellation, TP.7 atomic persistence |
| `BR-xx` | Business rule from the Stage-0 spec | BR-KEY (API keys), BR-PG1/2 (page rules) |
| `G-xx` | Generation-loop guard | G2 abort on planner failure, G3 metered-once |
| `B-xx` | Blocker from `docs/history/concepts_brief.md` | B2 (web reverse-import), B4 (Windows CLI) |
| `D-xx` | Owner decision in the reorg plan | D8 English UI, D9 loopback, D11 utility process |

A tag in code is a POINTER to the spec, not a replacement for it.

## Naming

- Name files after the domain concept they hold (`copy-zones.ts`, `retry`-free
  naming after deletion, `utilityClient.ts`), never after their role
  (`helpers`, `utils`, `common`, `misc`) — those become dumping grounds.
- Wire contracts (IPC channel names, error `name`s, `errorClass` values) are
  public API: rename = migration, not a refactor.
- One hằng số một nguồn sự thật: `SCENE_VERSION` / `OIA_SCHEMA_VERSION` live in
  `@oia/schema` only. No raw literals elsewhere (test fixtures recorded from the
  wire are exempt — they are data).

## Persistence

- Every persisted JSON write goes through `atomicWriteJson` (temp + rename,
  EPERM/EBUSY retry, single-writer serialization). Plain `writeFile` to a state
  file is a bug.
- Read-tolerant, write-strict: legacy payloads open (schema fields optional);
  saves validate, migrate (base64 → asset refs), and stamp `schemaVersion`.
- A record that outlives its process must never claim a live state: boot marks
  orphaned `processing` jobs failed ("interrupted by app restart").

## Error contracts

- Cross-boundary errors carry `name` (stable class) and where relevant
  `errorClass` (provider taxonomy). The renderer maps names to user copy;
  skills map envelope codes. Both are breaking-change surfaces.
- Never let a raw stderr / stack cross a wire the user can see.

## Concurrency & quota

- Metered generations run exactly once (G3). A retry is a new task linked by
  `retryOf`.
- In-flight accounting uses exact signals (`onSettled`), never fixed TTLs. A TTL
  is allowed only as a hang fallback and must force-fail the job for observers.
- Every long-running path needs: a timeout, a cancellation route, and a
  quit/close handler that kills detached child process trees.

## Tests

- Gate the error path, not the happy path: crash, race, timeout, restart are the
  cases that rot. Each defect fix ships a regression test reproducing it
  (see `docs/bug-reproductions/`).
- No low-value tests: snapshotting what the code already says, or asserting a
  mock was called. Prefer running the real store/server/protocol against a temp
  dir (see `test/loopback.test.ts` for the pattern — a real ServiceContext, no
  Electron).
- Scripted e2e gates live in the repo (`smoke`, `crash-smoke`, `shot`) and run in
  CI. A gate that only ran once on a developer machine is not a gate.

## Language

- Code identifiers + comments: English.
- Plan/decision docs: Vietnamese is fine (owner reads Vietnamese).
- UI copy: English only (D8). Generated banner content: whatever the user typed.

## Commits

- Imperative subject ≤ ~70 chars, prefix with scope when it helps
  (`desktop/D9:`, `schema:`, `reorg step N`).
- Body answers WHY the change is safe: what gates ran, what could break.
- Never mix a docs-only change with code changes if you can help it.
