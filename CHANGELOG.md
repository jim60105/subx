# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/jim60105/subx/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jim60105/subx/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jim60105/subx/releases/tag/v0.1.0
