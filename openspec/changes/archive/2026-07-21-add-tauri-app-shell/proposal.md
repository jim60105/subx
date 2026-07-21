# Proposal: add-tauri-app-shell

## Why

SubX today is CLI-only, which limits its AI subtitle-matching value to terminal-comfortable users. This change bootstraps the `subx` desktop GUI project — a Tauri 2 + React + TypeScript application that consumes the `subx-cli` crate as a library — establishing the foundation (app scaffold, navigation shell, theming, localization) that every subsequent feature (match wizard, settings, future convert/sync/translate) builds on.

## What Changes

- Scaffold a Tauri 2 application with a React 18 + TypeScript + Vite frontend in the repository root (`src-tauri/` for Rust, `src/` for the frontend).
- Add `subx-cli` as a Cargo dependency of the Tauri backend, with a deliberately thin command layer structure (`commands/`, `dto.rs`, `state.rs`, `error.rs`) so a future `subx-core` extraction only changes `use` paths.
- Implement the home screen as a task-entry hub: a Match card (functional in a later change) plus Convert / Sync / Translate cards marked "coming soon".
- Implement a reusable `WizardShell` layout component (step indicator, back/next navigation, content slot) that the match wizard and future feature wizards share.
- Implement the dual-theme system ("neon gradient" identity: violet `#7c3aed` → cyan `#06b6d4` on dark `#0d1021`, plus a light variant) via CSS custom properties; defaults to the OS `prefers-color-scheme`, manually overridable.
- Implement i18n with i18next + react-i18next: English (default) and Traditional Chinese (`zh-TW`); system-locale detection on first launch; all UI strings localized.
- Persist GUI-only preferences (language, theme override) in browser `localStorage` — never in the shared CLI config file.

## Capabilities

### New Capabilities

- `app-shell`: Tauri application scaffold, window lifecycle, home task-entry hub, navigation between features, and the reusable `WizardShell` layout.
- `theme-system`: Dual light/dark theming with the neon-gradient visual identity, system-preference detection, and manual override persistence.
- `localization`: i18next-based UI localization with English default and Traditional Chinese, including locale detection and runtime switching.

### Modified Capabilities

(none — this is the first change of a brand-new project)

## Impact

- New project scaffold at repository root: `package.json`, `vite.config.ts`, `src/`, `src-tauri/` (Cargo workspace member), Tauri config.
- New dependencies: `tauri` 2.x, `subx-cli` (crates.io), React 18, `i18next`/`react-i18next`, Vitest + React Testing Library.
- No changes to the `subx-cli` project itself; the crate is consumed read-only as a library.
- Later changes depend on this one: `add-settings-page` (settings UI inside the shell) and `add-match-wizard` (match flow inside `WizardShell`).
