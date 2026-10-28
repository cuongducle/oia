# PixForge Desktop: cross-platform architecture research

**Status: research and proposed architecture, not an implemented desktop release.**

Research date: October 28, 2026. Target platforms: macOS and Windows. The planned public website provides product information, documentation, and downloads rather than a hosted editor.

This report reviews source code and documentation; it does not report execution tests of the referenced applications. PixForge-specific observations refer to the existing web implementation at commit `af498629d795a9d802b9b3b36fa16ba33cc06302`. Important upstream findings were checked against the pinned commits below rather than relying solely on search indexes.

## 1. Executive summary

Recommended direction for PixForge:

- Build one shared Electron application for macOS and Windows rather than two separate editors.
- Use React + Vite with electron-vite for the desktop UI. Keep Next.js for the website and retain the current web app during migration.
- Separate main, preload, renderer, and Node.js task execution. Main owns windows, security, dialogs, and updates rather than all application logic.
- Use typed IPC with runtime input validation. A local Next.js server is not required as the default desktop architecture.
- Use electron-builder for packaging and electron-updater for updates, with pinned versions and tested configuration. AFFiNE uses Electron Forge, which is a valid alternative; not every reference application uses builder.
- Separate project persistence, image assets, and secrets. Do not store user data relative to the current working directory.
- Package and test on each target operating system. A successful macOS build is not evidence that Windows works.
- Bundle the runtime needed for the core workflow. Opening the editor must not require users to install Node.js, pnpm, Redis, or Docker. External model generation still requires a configured provider and, where applicable, network access.

These are recommendations for PixForge, not claims that every referenced project implements every mechanism described here.

## 2. Reference projects

| Project | Reviewed source snapshot | Why it is relevant |
|---|---|---|
| Cherry Studio | main, `7211babe8b870bb3bc011d13ed4f868f7551edd4` | AI desktop application with multiple providers, CLI integration, and auxiliary processes |
| Chatbox | main, `0ac6385ae1ff5bf778777826da3c5edcd55b61b8` | React UI, provider configuration, platform abstraction, and updates |
| AFFiNE | canary, `8cef09e1dd62b47a3cbc9f352aa10b3a90c75d34` | Large editor/canvas application with separate editor and desktop layers and background processing |
| LosslessCut | master, `7ce24a5f5c1ab9cd31b72055562a6ded4013d732` | Media editor with external tools, packaging, and checks across operating systems |

AFFiNE was reviewed on its canary branch. Its implementation details should not all be treated as stable-release architecture.

### 2.1. Cherry Studio: separate infrastructure from application logic

Observed:

- electron-vite configures main, preload, and renderer separately.
- A `core` layer handles lifecycle, paths, logging, security, and auxiliary processes separately from AI and application data.
- The utility-process documentation covers native-library crash isolation, request correlation, cancellation, process failures, and cleanup.
- That documentation explicitly describes utility processes as a crash-isolation boundary, not a security sandbox for untrusted code.
- `commandResolver.ts` distinguishes user-installed executables from application-managed binaries and handles PATH/PATHEXT and Windows-specific cases.
- The release workflow uses platform-specific runners; the reviewed configuration uses a self-hosted Windows signing runner.

Adopt: responsibility boundaries, process lifecycle management, CLI resolution, and explicit binary/architecture checks.

Do not copy wholesale: the large service-registration system, multiple product editions, numerous integrations, or the entire release infrastructure. PixForge does not yet need that complexity.

Sources: [build configuration][C1], [utility-process design][C2], [CLI resolver][C3], [release workflow][C4].

### 2.2. Chatbox: platform abstraction and stateful updates

Observed:

- Build configuration separates main, preload, and renderer entry points and output directories.
- The UI has a `Platform` interface for storage, exports, external links, system information, and updates.
- Preload exposes APIs through contextBridge, and multiple event listeners return unsubscribe functions.
- AppUpdater runs in main and sends checking, available, progress, downloaded, and error events to the renderer.
- Installers use electron-builder, including Windows NSIS and macOS arm64/x64 configuration.
- The reviewed updater uses S3-compatible infrastructure. Adopting the pattern does not require adopting that hosting infrastructure.

Adopt: a platform layer instead of operating-system conditionals and direct Node calls scattered through UI components; treat updates as a user-facing flow with progress, errors, and retry behavior.

Do not copy unchanged: preload exposes `invoke: ipcRenderer.invoke`. PixForge should expose specific allowed operations rather than arbitrary channel invocation. The reviewed builder configuration also disables Windows update code-signature verification; this is not a security default to adopt.

Sources: [build configuration][B1], [Platform interface][B2], [preload][B3], [AppUpdater][B4], [installer configuration][B5].

### 2.3. AFFiNE: the editor core is not the desktop shell

Observed:

- Its monorepo separates `apps/electron`, `apps/electron-renderer`, frontend/core packages, and other platforms.
- Packaging uses Electron Forge with resource-processing hooks and a native-module unpacking plugin.
- Configuration includes release channels and provisions for stable/canary data separation. Session overrides have their own behavior, so this is not a claim that all channels are always fully isolated.
- The preload bridge constructs APIs from namespaces and method lists and provides a separate event channel.
- WorkerManager creates hidden windows for work needing a renderer environment and connects participants through MessageChannelMain.
- Main-process BYOK storage uses safeStorage to encrypt data in a file under userData and checks encryption availability before use.

Adopt: separate editor features from operating-system integration; work requiring DOM/Chromium cannot be moved arbitrarily into plain Node processes; test environments should not accidentally reuse production data.

Do not copy wholesale: CRDT, synchronization infrastructure, extensive worker/window management, or the entire large-project structure.

Sources: [Forge configuration][A1], [API bridge][A2], [worker management][A3], [BYOK storage][A4].

### 2.4. LosslessCut: external tools and packaged-application checks

Observed:

- `getFfPath()` distinguishes development from packaged execution, selects `.exe` on Windows, and resolves packaged binaries under `process.resourcesPath`.
- Tools run as an executable plus an argument array, with running-process tracking, cancellation, stderr handling, and progress.
- The workflow downloads binaries for the target operating system and architecture before packaging.
- Non-tag builds include steps that launch packaged executables on macOS/Windows. These are not equivalent to complete installer or UI tests.
- Release-asset checks help detect packages missing required binaries.

Adopt: treat external tools as components with their own lifecycle, compatibility checks, and packaging requirements. Development execution does not prove that a binary will be present in an installer.

Do not copy unchanged: a broad privilege bridge or every historical security choice. Use current Electron guidance as the security baseline.

Sources: [FFmpeg management][L1], [build workflow][L2], [package configuration][L3].

## 3. Keep Next.js inside desktop, or extract the UI?

At the reviewed PixForge baseline, Next.js contains 19 API route files. The editor calls those APIs directly for project persistence, uploads, templates, and SSE chat.

| Approach | Advantages | Trade-offs | Assessment |
|---|---|---|---|
| Electron starts a local Next.js server | Reuses existing routes with fewer initial transport changes | Adds server lifecycle, ports, loopback authentication, server packaging, and startup work | Possible transitional prototype |
| React + Vite in Electron, IPC to a Node runtime | Fits a standalone desktop application; internal operations need no HTTP port | Requires extracting components from Next.js and replacing direct fetch calls with a service layer | Recommended target |
| Only switch Next.js to static export and package it | Appears simple | Does not preserve current dynamic POST routes or SSE behavior | Not a complete migration |

Next.js static export supports route handlers that produce static GET content, not the existing dynamic POST endpoints. Adding an export setting alone is not sufficient. [N1]

The UI and Fabric scenes do not need to be rewritten from scratch. The migration should separate framework dependencies and data transport from the existing interface.

## 4. Proposed structure

```text
apps/
  desktop/
    src/
      main/          windows, menus, security, dialogs, updates
      preload/       narrow contextBridge API
      renderer/      desktop React entry point
      utility/       Node task-process entry point
    resources/       icons, fixed assets, optional binaries
    electron.vite.config.ts
    electron-builder.yml
  site/              landing page, documentation, download links
  web/               current application during migration

packages/
  studio/            editor components, screens, hooks, UI state
  desktop-contract/  IPC command/event types and schemas
  runtime/           projects, assets, task orchestration
  schema/            retain and extend current schemas
  canvas/            retain scenes, geometry, history, export planning
  agent/             retain planning and event generation
  providers/         retain adapters; add CLI execution abstraction
  tasks/             retain processors; separate web/queue coupling as needed
```

This is a target structure, not a requirement to create every package on day one. Extract a package when it has a clear responsibility.

Execution flow:

```text
React/Fabric renderer
        |
        | Specific APIs: projects.save, generation.start, jobs.cancel
        v
Preload contextBridge
        |
        v
Main: caller validation, input validation, dialogs, permissions
        |
        v
Node runtime in a utility process
        |
        +-- provider HTTP / Codex CLI / file operations
        +-- scene and asset persistence
        +-- progress/result events back to the UI
```

Implementation notes:

- Retain the `ChatEvent` shape where useful. SSE is an HTTP transport; IPC does not require passing strings prefixed with `data:`.
- Give each job an ID. Events must identify their job, support cancellation, and provide listener cleanup when screens close.
- Do not automatically repeat a paid generation after a crash when the outcome of the previous attempt is unknown.
- Avoid repeatedly sending large base64 images through IPC. Persist files and return controlled asset IDs/internal URLs; use an appropriate transfer mechanism when bytes are needed.
- Fabric canvas rendering needs a DOM environment. Initially retain renderer/StaticCanvas behavior. Move only suitable document-packaging or Node work into the utility process. Add a hidden export renderer only if tests justify it.
- Give one component ownership of storage writes. Multiple windows must not independently write the same JSON file.
- Main can own the secret vault and provide only the credentials required by a worker. The UI should receive status and masked metadata, not stored secrets.

## 5. Persistence, secrets, and assets

### 5.1. Projects

Use `app.getPath('userData')`, not `process.cwd()/.data`. The working directory can differ when launched from the Dock or Start Menu, and the installation directory may not be writable.

Keeping scene JSON initially can reduce migration risk, but requires:

- A schemaVersion and tested migrations.
- A single writer, atomic writes, and suitable recovery behavior.
- Separate image/asset storage with scene references by asset ID.
- Backups before upgrading the data format.
- Project import/export bundles containing a manifest, scenes, and assets.
- Assets that remain available after provider image URLs expire.
- SQLite for catalogs/jobs only if scale or transactional requirements justify it, not simply because larger applications use it.

### 5.2. Provider credentials

Use a main-owned vault backed by safeStorage or an appropriate operating-system mechanism. On macOS, safeStorage uses Keychain; on Windows it uses DPAPI. DPAPI is not absolute protection against malicious applications running as the same user. Do not market this as absolute security. [E2]

Do not put keys in localStorage, scenes, exported projects, error messages, or logs. Do not silently fall back to plaintext storage when encryption is unavailable.

The safeStorage documentation has version-dependent synchronous/asynchronous API changes. Select the API supported by the pinned Electron version rather than copying a new API name into an older release.

### 5.3. Local resources

- Bundle fonts, template artwork, required PDF/OCR workers, and editor library assets as applicable.
- Use a scoped custom protocol for application resources and asset IDs, not an arbitrary file-reading endpoint.
- Do not disable webSecurity to make image/canvas loading or file paths work.
- Previously saved projects must remain viewable offline, with exports available for formats that do not require external services.

## 6. Codex and external tools: concrete PixForge risks

At the reviewed baseline, `packages/providers/src/image/codex.ts`:

1. Spawns `codex` from PATH by default.
2. Parses image results with a regular expression that accepts paths starting with `/`.
3. Falls back to scanning recent images under the user's home directory.
4. Has a timeout, but not a complete cross-platform process-tree manager.

An isolated check of the path regex produces:

```text
/Users/example/image.png       -> matches
C:\Users\example\image.png     -> does not match
C:/Users/example/image.png     -> does not match
```

This does not prove that every Windows generation fails, because a fallback exists. It does establish that the primary parser does not support these Windows path forms. Selecting a recently modified file can also misattribute results when jobs overlap.

Introduce a `CliRuntime` abstraction that:

- Distinguishes bundled binaries, user-selected binaries, and commands resolved through PATH.
- Diagnoses version and login status.
- Handles `.exe`/`.cmd`, Dock/Start Menu launch environments, and paths containing spaces.
- Prefers direct executable invocation with an argument array instead of concatenating prompts into shell strings.
- Applies controlled quoting and input handling if a `.cmd` adapter is needed, rather than enabling a shell indiscriminately.
- Manages cancellation, timeouts, process cleanup, and per-job output directories.
- Does not automatically install, update, or change the user's Codex configuration.
- Keeps Codex optional: the editor and API-key providers must work without the CLI installed.

LosslessCut demonstrates bundled-binary management; Cherry Studio demonstrates discovery of user-installed commands. These are different responsibilities, not one simple path lookup.

## 7. Security: adopt boundaries, not every upstream setting

Follow Electron's security guidance [E1]:

- Set `nodeIntegration: false` and `contextIsolation: true`, and sandbox the renderer.
- Expose specific preload methods, not raw ipcRenderer or arbitrary invocation.
- Validate sender/frame identity and the schema of every privileged command.
- Restrict navigation, new windows, permissions, and URLs opened in external browsers.
- Use a CSP and do not execute JavaScript generated by AI content.
- Do not treat a utility process as a security sandbox for untrusted content.
- Keep Electron and dependencies updated.

Proposed API examples, not implemented code:

```typescript
window.pixforge.projects.save(project)
window.pixforge.generation.start(request)
window.pixforge.jobs.cancel(jobId)
window.pixforge.jobs.onEvent(jobId, listener) // returns unsubscribe
window.pixforge.files.chooseExportDestination(options)
```

## 8. macOS and Windows distribution

### 8.1. Builds

Proposed initial support:

- macOS arm64.
- Windows x64.
- macOS x64 only if Intel support is committed to and tested.
- No Windows ARM64/Linux claim merely because the packaging tool offers those targets.

Workflow:

```text
Pull request
  -> typecheck + unit/integration tests
  -> unsigned packages for each target operating system
  -> packaged-application startup and basic workflow checks

Release tag
  -> build on the appropriate OS/architecture runner
  -> sign + notarize macOS
  -> verify artifacts and signatures
  -> upload a draft release
  -> test installation and upgrades
  -> approve publication
```

Do not expose certificates or release permissions to untrusted pull requests. Separate caches by operating system/architecture. Native modules must match the Electron ABI and target platform.

### 8.2. Installers and updates

- macOS: DMG for installation plus the ZIP and metadata required by the electron-updater update path.
- Windows: NSIS `.exe` installer. Portable distribution is optional and does not substitute for testing the installer update path.
- GitHub Releases is a reasonable starting point; a CDN can be added when needed.
- Keep appId, publisher, and channel identities stable. Define data policies for stable/beta channels.
- macOS: Developer ID signing, hardened runtime, notarization, and Gatekeeper checks for direct distribution.
- Windows: signing identifies the publisher but does not guarantee that SmartScreen warnings immediately disappear.
- Install updates only after projects are saved and in-progress work is handled safely.
- Test upgrades from an actually installed earlier version, not only an update button in development.
- Pin compatible builder/updater versions. Update-manifest signing and update behavior can change; do not mix configuration examples from different major versions without checking compatibility.

Sources: [LosslessCut workflow][L2], [Cherry Studio workflow][C4], [electron-builder updates][E3], [code signing][E4].

## 9. Required PixForge verification

- Launch from the Dock/Start Menu on a machine without Node, pnpm, Redis, or Codex.
- Open a template, edit text, move objects, undo/redo, save, and restart.
- Use mixed-size multi-page projects; export PNG/JPG/PDF/PPTX/ZIP and open outputs in other applications.
- Retain images and fonts across offline use, restarts, and upgrades.
- Test usernames and paths containing spaces, Vietnamese diacritics, and other Unicode characters.
- Configure, mask, and delete keys; handle an unavailable secret vault.
- Cancel generation, lose network access, and quit during tasks without leaving unintended child processes.
- Handle platform differences in window closure versus application exit, Command/Ctrl shortcuts, and file dialogs.
- Verify clean installation, upgrades, failed updates, and project preservation.
- Distinguish an unpacked packaged executable from an installed application. Both require checks.

## 10. Web features requiring product decisions

Share links such as `/p/{id}`, the community library, and agent APIs do not automatically become Internet services when moving to desktop.

- Local projects can be shared through project-file export/import.
- Public links or a global community require a separate service with storage, authentication, and operating costs.
- If retained, an HTTP gateway for coding agents should be optional, disabled by default, loopback-only, and authenticated. Reject out-of-scope requests and do not allow arbitrary websites to invoke the local API.
- Keeping selected agent endpoints does not require routing the entire UI through HTTP.

Do not silently remove these features during migration. Decide their replacement behavior first.

## 11. Migration sequence

1. Establish service boundaries for projects, images, generation, and configuration instead of scattered direct fetch calls.
2. Extract existing components from Next.js while retaining scene schemas and geometry/persistence/export tests.
3. Build the Electron shell with a narrow preload bridge and local persistence. Complete open-save-export first.
4. Connect agent/providers through a worker, including cancellation, progress, and failures.
5. Implement the cross-platform Codex/CLI adapter without making it a first-launch dependency.
6. Add macOS/Windows packaging CI and packaged-application checks.
7. Prepare signing, notarization, updates, and migration tests.
8. Finalize the landing page and launch material only after usable installers exist.

Do not provide a precise schedule before a packaging prototype has run on Windows. The difficult work includes data, paths, CLI behavior, and updates, not just producing installer files.

## 12. Licensing and research limitations

- GitHub metadata at the reviewed snapshots identifies Cherry Studio as AGPL-3.0, Chatbox as GPL-3.0, and LosslessCut in the GPL-2.0 family.
- AFFiNE has directory-specific licensing: much of the repository is MIT, with separate terms for some areas.
- Studying architecture does not permit copying arbitrary code into PixForge while assuming the result remains MIT. Check the license of each file and preserve applicable obligations before reusing code.
- These repositories were not exhaustively read or audited. Findings apply to the files and mechanisms inspected.
- Reference packaged applications were not executed or benchmarked for size, memory, or startup time. No unverified performance figures are claimed.

## Pinned source references and documentation

[C1]: https://github.com/CherryHQ/cherry-studio/blob/7211babe8b870bb3bc011d13ed4f868f7551edd4/electron.vite.config.ts
[C2]: https://github.com/CherryHQ/cherry-studio/blob/7211babe8b870bb3bc011d13ed4f868f7551edd4/docs/references/utility-process/README.md
[C3]: https://github.com/CherryHQ/cherry-studio/blob/7211babe8b870bb3bc011d13ed4f868f7551edd4/src/main/utils/commandResolver.ts
[C4]: https://github.com/CherryHQ/cherry-studio/blob/7211babe8b870bb3bc011d13ed4f868f7551edd4/.github/workflows/release.yml
[B1]: https://github.com/chatboxai/chatbox/blob/0ac6385ae1ff5bf778777826da3c5edcd55b61b8/electron.vite.config.ts
[B2]: https://github.com/chatboxai/chatbox/blob/0ac6385ae1ff5bf778777826da3c5edcd55b61b8/src/renderer/platform/interfaces.ts
[B3]: https://github.com/chatboxai/chatbox/blob/0ac6385ae1ff5bf778777826da3c5edcd55b61b8/src/preload/index.ts
[B4]: https://github.com/chatboxai/chatbox/blob/0ac6385ae1ff5bf778777826da3c5edcd55b61b8/src/main/app-updater.ts
[B5]: https://github.com/chatboxai/chatbox/blob/0ac6385ae1ff5bf778777826da3c5edcd55b61b8/electron-builder.yml
[A1]: https://github.com/toeverything/AFFiNE/blob/8cef09e1dd62b47a3cbc9f352aa10b3a90c75d34/packages/frontend/apps/electron/forge.config.mjs
[A2]: https://github.com/toeverything/AFFiNE/blob/8cef09e1dd62b47a3cbc9f352aa10b3a90c75d34/packages/frontend/apps/electron/src/preload/electron-api.ts
[A3]: https://github.com/toeverything/AFFiNE/blob/8cef09e1dd62b47a3cbc9f352aa10b3a90c75d34/packages/frontend/apps/electron/src/main/worker/pool.ts
[A4]: https://github.com/toeverything/AFFiNE/blob/8cef09e1dd62b47a3cbc9f352aa10b3a90c75d34/packages/frontend/apps/electron/src/main/byok-storage/handlers.ts
[L1]: https://github.com/mifi/lossless-cut/blob/7ce24a5f5c1ab9cd31b72055562a6ded4013d732/src/main/ffmpeg.ts
[L2]: https://github.com/mifi/lossless-cut/blob/7ce24a5f5c1ab9cd31b72055562a6ded4013d732/.github/workflows/build.yml
[L3]: https://github.com/mifi/lossless-cut/blob/7ce24a5f5c1ab9cd31b72055562a6ded4013d732/package.json
[E1]: https://www.electronjs.org/docs/latest/tutorial/security
[E2]: https://www.electronjs.org/docs/latest/api/safe-storage
[E3]: https://www.electron.build/docs/features/auto-update
[E4]: https://www.electron.build/docs/features/code-signing
[N1]: https://nextjs.org/docs/app/guides/static-exports
