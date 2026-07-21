# Tasks: add-tauri-app-shell

> **Build environment note:** besides `webkit2gtk4.1-devel` / `libsoup3-devel`,
> linking the backend also needs `libstdc++-devel` — it supplies the
> `/usr/lib64/libstdc++.so` symlink the linker resolves `-lstdc++` against, which
> the runtime `libstdc++.so.6` alone does not provide. `cargo check` passes
> without it because it never links; `cargo test`, `cargo build` and `tauri dev`
> all fail with `unable to find library -lstdc++` until it is installed.

## 1. Project Scaffold

- [x] 1.1 Scaffold Tauri 2 app with React 18 + TypeScript + Vite (`package.json`, `vite.config.ts`, `src-tauri/` with `tauri.conf.json`); verify `npm run tauri dev` opens a window and that the configured CSP does not block Vite's dev server or HMR socket
- [x] 1.2 Add `subx-cli = "1.7"` to `src-tauri/Cargo.toml` and confirm the backend compiles with the dependency linked
- [x] 1.3 Create backend module skeleton: `commands/mod.rs`, `dto.rs`, `state.rs`, `error.rs` with `ErrorDto { code, message, hint_code }` and the `Result<T, ErrorDto>` command convention (include one trivial `ping`-style command wired end-to-end as the pattern reference)
- [x] 1.4 Set repository license metadata to GPL-3.0-or-later in `package.json` and `src-tauri/Cargo.toml`
- [x] 1.5 Set up frontend testing: Vitest + React Testing Library + `@tauri-apps/api/mocks`, with one smoke test running in CI-friendly `npm test`
- [x] 1.6 Work around WebKitGTK/NVIDIA Wayland "Error 71" crash by setting `__NV_DISABLE_EXPLICIT_SYNC=1` in `main()` on Linux before webview creation

## 2. Theme System

- [x] 2.1 Define CSS custom-property token sets for dark (`#0d1021` base, glassmorphism panels) and light themes with shared violet→cyan (`#7c3aed`→`#06b6d4`) gradient accents, applied via `:root[data-theme]`
- [x] 2.2 Implement theme controller: `prefers-color-scheme` detection with live media-query follow, manual override (light/dark/system) persisted in `localStorage`
- [x] 2.3 Unit-test theme controller behavior (default follow, override persistence, return-to-system)

## 3. Localization

- [x] 3.1 Set up i18next + react-i18next with locale files `src/locales/en/*.json` and `src/locales/zh-TW/*.json` split by feature namespace
- [x] 3.2 Implement first-launch locale detection (`zh-TW`/`zh-Hant` family → Traditional Chinese, otherwise English) and persisted runtime switching
- [x] 3.3 Implement error-code localization helper: maps `ErrorDto.code`/`hint_code` to localized strings with generic-fallback + raw-detail behavior
- [x] 3.4 Unit-test locale detection, runtime switch, and unknown-code fallback

## 4. Shell UI

- [x] 4.1 Implement home task-entry hub: Match card (navigates to an empty feature route) and Convert / Sync / Translate cards in disabled "coming soon" state
- [x] 4.2 Implement client-side routing between home and feature screens with a back affordance preserving home state
- [x] 4.3 Implement reusable `WizardShell` (step indicator with completed/active/upcoming states, content slot, feature-controlled back/next buttons)
- [x] 4.4 Component-test the hub (disabled cards don't navigate) and `WizardShell` (indicator states, disabled next button)

## 5. Verification

- [x] 5.1 Run the app in both themes and both languages; confirm every shell screen renders correctly with no hard-coded strings or colors
- [x] 5.2 Ensure `cargo test` (backend) and `npm test` (frontend) pass; `cargo clippy` and `tsc --noEmit` are clean
