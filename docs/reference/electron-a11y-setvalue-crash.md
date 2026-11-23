# Known issue: AXSetAttributeValue on a tab crashes the app (SIGSEGV in fontations)

First observed 2026-11-23 while driving the packaged app with an
accessibility client (Orca computer-use `set-value`). Reproduced 3/3 times
on `Oia-0.7.0-arm64` (Electron 39.8.10, macOS 15, Apple Silicon).

## Symptom

Calling `AXSetAttributeValue` (AXValue setter) on the Editor side-panel tab
(`role=tab`, `aria-selected`, exposed as `tab (settable) Design, Value: 0`)
kills the process instantly:

```
Exception Type:  EXC_BAD_ACCESS (SIGSEGV)
Exception Codes: KERN_INVALID_ADDRESS at 0x0000000000000000
Crashed thread (crash logs Oia-2026-11-23-083119.ips, -083540.ips):
  fontations_ffi$cxxbridge1$font_ref_is_valid        (x3 frames)
  -[NSAccessibilityAttributeAccessorInfo setAttributeValueForObject:withValue:]
  ___NSAccessibilityEntryPointSetValueForAttribute_block_invoke
  NSAccessibilityEntryPointSetValueForAttribute
  ... _AXXMIGSetAttributeValue / mshMIGPerform (Mach IPC from the client)
```

The crash is inside the Chromium font stack (Rust `fontations`), reached from
the macOS accessibility entry point when an external client writes AXValue.
It does NOT happen on plain `button role=tab aria-selected` elements in a
minimal Electron 39.8.10 sample: the Oia renderer (React + bundled Be
Vietnam Pro variable font in the tree) is required, so the bad font handle is
likely tied to this app's font set. Set-value on text inputs in the same
window works fine; only the tab element crashed so far.

## Impact

- Real users are unaffected unless they run an accessibility tool that writes
  values into the web view (screen readers generally do not AXValue-write
  tabs; automation tools do).
- Any automation/dogfooding harness must avoid `set-value` on non-input
  elements. Click by coordinates or element instead (this repo's Unikorn
  launch runs already follow that rule).

## Why there is no automated gate yet

The failure needs (a) a macOS host with Accessibility granted to the client,
(b) the packaged app with the Editor open, (c) an external AX client. That
combination cannot run in the Linux CI lanes and is not reliable on shared
macOS runners (TCC). When an upstream fix lands, re-test manually with:

1. `pnpm --filter @oia/desktop dist:mac:dir`
2. Launch `dist/mac-arm64/Oia.app`, open any project (Editor).
3. From an AX client (Orca computer-use): read the tree, find
   `tab (settable) Design`, `set-value` it to `1`.
4. App must stay alive. Before the fix it dies within ~2s.

## Follow-ups

- Draft upstream issue prepared (see repo history / `docs/private`) for
  electron/electron with the full stack and repro steps.
- Re-check on the next Electron upgrade (39.x patch or 40) using the manual
  procedure above; bump when fixed upstream.
