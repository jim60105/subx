# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Match: clicking anywhere on a pairing in the review step selects or deselects it; the checkbox and the reasoning disclosure keep their own behaviour, and dragging to select text does not change the selection.
- Sync: the steps are now Files, Detect, Offset and Save. Step 2 asks whether to detect the offset, shows the elapsed seconds while it listens, and offers retry or skip after a failure; step 3 is the only place the offset is edited. After visiting step 3, going back offers to keep the current offset. Changing either file resets the offset, and files dropped on the window are accepted on the first step only.

### Fixed
- Match: the quick-select language controls and each row's language tag follow the language in the resulting file name (also after a cached analysis) instead of putting every pairing under Other, and a language without a translated name, such as Thai, is labelled with its name in the interface language.

## [1.0.0] - 2026-11-16

First stable release. The app gets a new editorial look (paper-and-ink colours, a bundled serif typeface, numbered tasks on the home screen and a breadcrumb in the title bar), and every task wizard now shows exactly what will happen to your files before anything runs.

### Added
- Match: the review step is a filterable ledger of proposed matches, and the execute step lists each operation with its own status so you can resolve problems one by one.
- Match: the analysis step shows its stage in plain words, and animation respects the system "reduce motion" setting.
- Convert and translate: planned work is shown as the file it will create or replace, with the same drop zone and grouped file list as the other tasks.
- Translate: found subtitles appear once in a single sources list grouped by folder, folder source or archive, with file counts, cue subtotals and a remove action per group (and per file for files you added directly).
- Translate: the run step shows one row per file and a progress bar split into the real AI batches, with a status line for the current file and batch, elapsed and estimated time, a notice when a batch is resent, and the final outcome of each file (done, failed or cancelled).
- Sync: the offset is shown as a large signed figure with nudge buttons and a cue preview, the apply step shows which file is kept and which is created, and both ends of the sensitivity slider are labelled.
- Settings: each section says where its values are stored (shared `config.toml` or this app only), a configured API key is shown masked with a Replace action, and a successful connection test shows its latency. Language and theme are single-choice buttons.

### Changed
- All task screens use the same three button ranks, and the primary action stays in a fixed position.

### Fixed
- Match: hidden text in the review list no longer spills outside its scroll area.
- Sync: an offset that rounds to zero seconds is shown without a sign.
- Settings: saving the first API key closes the input and shows the masked key.
- Convert and translate: the source list no longer collapses.
- Translate: the run status line names how each finished file ended instead of showing "Done" for all of them.

## [0.4.0] - 2026-11-15

### Added
- The Flatpak build now requests host filesystem access (`--filesystem=host`) and file-manager network mounts (`--filesystem=xdg-run/gvfs`). Subtitles picked from the home directory, removable media or a GVFS mount keep their real host paths, so renaming no longer writes through a document-portal copy the portal can later revoke. If the permission is revoked, grant whole folders rather than individual files.
- Operations whose destination resolves inside a document-portal document are refused or flagged: match refuses them before anything runs (the rest of the plan still applies), convert and translate previews show the affected row as excluded with a localized reason, and sync refuses such an output before reading or writing anything.

### Changed
- Security refresh across the bundled stack: both dependency audits report no known vulnerabilities, the engine moves to `subx-core` 1.0.1 with patched TLS and compression libraries, and archives whose entry names cannot be decoded are skipped with a warning instead of being extracted under a raw-byte path.
- Building the backend now requires Rust 1.88.

### Fixed
- Windows installers ship `DirectML.dll` beside `subx.exe` again; MSI and NSIS installs no longer fail at startup because the onnxruntime DLL is missing.

## [0.3.0] - 2026-09-29

### Added
- Persistent build-identity badge in the app header showing the running build's version and short git hash, so a stale bundle is instantly recognizable; the backend logs the same identity at startup and exposes it over typed IPC.
- Language quick-select chips on the match wizard review step: one toggle per language detected in the plan, plus an Other group for undetected subtitles; detected languages are resolved backend-side and attached to match plans.
- Canonical dev launcher (`npm run dev:app`) that sweeps orphaned app/vite processes and stale port holders before launching, ending stale-webview sessions from bare restarts.

### Fixed
- Header tagline truncates cleanly at the minimum window width instead of clipping the version badge; the badge carries no fallback string, so its absence stays a reliable stale-bundle signal.
- Build identity capture watches unborn symbolic refs and degrades gracefully when no git hash is available.
- Version formatter isolated into its own module so Fast Refresh continues to work on the header.

## [0.2.0] - 2026-09-08

### Added
- Linux Flatpak bundle published with each release, installable from the Flathub-style user remote.
- SubX brand icon set replacing the stock Tauri artwork across all platforms; README headers now feature the project icon and real app screenshots.

### Changed
- Backend now depends on the `subx-core` engine crate (published registry version) instead of the `subx-cli` re-export facade, dropping the CLI's terminal-only dependencies from the resolved graph; no user-visible behaviour change.
- `backendCodeParity` guard generalized to name both engine-crate spellings outside `src-tauri` and now asserts the replaced `subx-cli` facade is absent from the resolved `Cargo.lock` graph.
- Product descriptions (bundle long description, Flatpak metainfo, package/manifest descriptions, README tagline) name no crate: SubX is described by what it does, not by the engine crate behind it.
- Release workflow can build a release from a specified branch instead of only the default branch.
- GitHub Actions pins bumped to their current major versions; the frontend now builds before the backend coverage gate in CI.

### Fixed
- Settings screen keeps the AI provider form editable when the strict configuration read fails, so an invalid on-disk value no longer leaves the screen unusable.
- Spec-coverage tooling rejects path inputs that escape the repository root.
- Release workflow checks out the tag itself on tag-push triggers (the dispatch-branch option previously passed a literal `false` ref to checkout, failing every build job); the draft-release reuse lookup now finds existing drafts, which the tag endpoint does not surface.


## [0.1.0] - 2026-07-30

### Added
- Initial release of SubX desktop GUI application for `subx-cli`.
- Subtitle matching wizard with drag-and-drop video and subtitle file pairing.
- Subtitle format conversion wizard supporting SRT, ASS, VTT, and SUB formats.
- Subtitle synchronization wizard for aligning subtitle timing with video audio tracks.
- AI-powered subtitle translation wizard supporting multiple language pairs and LLM providers.
- Settings panel for configuring LLM providers (OpenAI, OpenRouter, Azure OpenAI, local models) with API key masking and connection testing.
- Custom frameless titlebar with window management controls, drag region, and theme toggle.
- Full internationalization (i18n) support for English (`en`) and Traditional Chinese (`zh-TW`).
- Cross-platform release workflow targeting macOS (arm64, x86_64), Linux (x86_64, arm64), and Windows (x86_64) with SLSA build provenance attestations.

### Changed
- Redesigned GUI visual identity using official Rust brand palette design tokens.
- Pinned primary action controls to fixed positions with dedicated home navigation.
- Single-sourced application version in `package.json` with strict synchronization tests across Rust crate manifest and lockfile.

[Unreleased]: https://github.com/jim60105/subx/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jim60105/subx/compare/v0.4.0...v1.0.0
[0.4.0]: https://github.com/jim60105/subx/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/jim60105/subx/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jim60105/subx/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jim60105/subx/releases/tag/v0.1.0
