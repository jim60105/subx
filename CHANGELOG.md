# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/jim60105/subx/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jim60105/subx/releases/tag/v0.1.0
