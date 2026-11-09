---
okf_version: "0.2"
---

# Oia knowledge bundle

Oia documentation follows the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format)
(OKF) v0.2: every markdown file carries YAML frontmatter with at least a `type`,
and this index enables progressive disclosure one directory at a time.

- Scope and live decisions: [desktop-only-reorg plan](designs/desktop-only-reorg.md) is the single
  source of truth; the [design sitemap](designs/SITEMAP.md) is the one-line ledger per design doc.
- `private/` is gitignored local ops material and is not part of this bundle.
- Non-markdown files (screenshots, probe evidence, provenance JSON, the marketing
  build script) are bundle assets referenced from the concepts below.

# Standards

* [Oia style guide](STYLEGUIDE.md) - code, naming, comment, and commit conventions for the monorepo.

# Designs

Per-doc status, dates, and component impact live in the [design sitemap](designs/SITEMAP.md).

* [Desktop-only reorg plan](designs/desktop-only-reorg.md) - decisions D1-D14 and the step checklist; the source of truth for current scope.
* [Desktop app (macOS + Windows)](designs/desktop-app.md) - Electron shell design, service extraction, zero-terminal provisioning.
* [Banner-maker loop stage 0](designs/banner-maker-loop-stage-0.md) - engine fixes: metered-once jobs, cancellation, persistence.
* [Designer agent loop (DA)](designs/designer-agent-loop.md) - research-informed planning plus bounded auto-refine.
* [Deconstruct import (B1)](designs/deconstruct-import.md) - vision read plus inpaint to rebuild editable layers.
* [Live overlay presets (C3)](designs/live-overlay-presets.md) - overlay artboard, Shopee and TikTok presets, safe-zone guides.
* [Outline gate (C1)](designs/outline-gate.md) - approve the outline before burning multi-page quota.
* [Variant preview-apply (A1)](designs/variant-preview-apply.md) - preview tray before applying AI edits.
* [Selection-bound edits (A3-lite)](designs/selection-bound-edits.md) - what rides to the model when a layer is selected.
* [Markup edit (ME, IM26-3)](designs/markup-edit.md) - select-to-edit annotations wired to the edits endpoint.
* [Images 2.6 upgrade (IM26)](designs/images-2.6-upgrade.md) - provider reaction, BYO default, open items.
* [Social card style presets (SC)](designs/social-card-style-presets.md) - STYLE layer, font pairs, international sizes.
* [Template system (TPL)](designs/template-system.md) - template growth loop and the templates hub.
* [Feature upgrade brainstorm](designs/feature-upgrade-brainstorm.md) - graduated and candidate capabilities.
* [UI v1.1 redesign](designs/ui-v11-redesign.md) - app-frame redesign draft awaiting owner approval.
* [Creative studio refresh](designs/design-direction.md) - visual direction: surfaces, ink, violet accent.

# Reference

* [Cross-platform support battle log](reference/cross-platform-support.md) - the distilled macOS and Windows war stories; read before touching process spawning or the shell.
* [Desktop architecture map](reference/desktop-architecture.md) - main, utility, preload, renderer, shared, and the package chain.
* [macOS design 2026 (Tahoe)](reference/macos-design-2026.md) - cornerMask bug, adoption tiers, step-7 checklist.
* [Design product UI 2026](reference/design-product-ui-2026.md) - design-DNA laws and the P0-P2 gap table.
* [Test antipatterns](reference/test-antipatterns.md) - what a bad test looks like here.

# Research

* [Image prompt craft rules](research/image-prompt-craft.md) - evidence-based DA-11 craft rules.
* [A/B prompt evidence](research/ab-prompts.md) - full prompts per A/B round.
* [IM26 markup probes](research/im26-probes/README.md) - annotated probe pairs for the markup field.

# Verification and validation

* [Editor parity web vs desktop](verification/editor-parity.md) - step-5 parity record.
* [Web test coverage matrix](verification/web-test-coverage-matrix.md) - step-5 replacement matrix before web deletion.
* [Editor export checks](verification/editor-export-checks.md) - studio-refresh verification.
* [Marketing assets rework](verification/marketing-assets.md) - 2026-11-09 campaign rework record.
* [Seller sessions kit](validation/seller-sessions-kit.md) - moderation kit for seller validation sessions.

# Bug reproductions

* [Utility-process defects (2026-10-30)](bug-reproductions/2026-10-30-utility-process-defects.md) - four patterns that will try to come back.

# History

* [Open image agent concept brief](history/concepts_brief.md) - archived; kept for the B1-B7 blocker taxonomy.
