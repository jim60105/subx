# Tasks — migrate-to-subx-core

## 1. Dependency swap (backend)

- [x] 1.1 In `src-tauri/Cargo.toml`, replace `subx-cli = "1.9.1"` with `subx-core = "1.0"` (keep the comment style: registry version, caret range, with a one-line comment naming why: the engine crate the split extracted for embedders).
- [x] 1.2 Rewrite imports across `src-tauri/src/` (`commands/`, `state.rs`, `lib.rs`, `dto.rs`, `error.rs`, `ipc_tests.rs`): `subx_cli::` → `subx_core::`, except the two `subx_cli::cli` sites — `subx_core::core::input::{CollectedFiles, InputPathHandler}` (`convert.rs`, `match.rs`, `translate.rs`, `state.rs`) and `subx_core::core::sync::create_default_output_path` (`sync.rs`). Doc-comment mentions of the crate in these files follow the same substitution.
- [x] 1.3 `cargo check --manifest-path src-tauri/Cargo.toml` clean; `cargo tree --manifest-path src-tauri/Cargo.toml -i subx-cli` reports the package absent from the graph; `cargo test --manifest-path src-tauri/Cargo.toml` green (no business-logic change — any failure is a wrong path assumption, fix the imports, never add shim modules).

## 2. Graph verification

- [x] 2.1 `cargo tree` diff sanity: `clap` and terminal-only dependencies gone from the resolved graph; `subx-core` appears once.
- [x] 2.2 Test pins hold against the new resolution: `zip`, `toml` (and `wiremock`) resolve to the same majors the manifest pins; bump a pin only if the core resolved a different major, with a comment.
- [x] 2.3 Commit the regenerated `src-tauri/Cargo.lock`.

## 3. Guard tests and product-metadata wording

- [x] 3.1 `src/i18n/backendCodeParity.test.ts`: frontend scan regex `/subx[_-]cli/` → `/subx[_-](cli|core)/`; backend manifest assertion `toMatch(/subx-cli/)` → `/subx-(cli|core)/`; update the file's doc comment to the crate-agnostic phrasing. Keep the `@covers` comment id unchanged (it still traces `app-shell/thin-tauri-command-layer-structure#crate-access-is-confined-to-the-command-layer`).
- [x] 3.2 Rename the phrase "powered by AI and subx-cli" → "powered by AI and subx-core" in the byte-coupled pair IN ONE step — they MUST move together or the suite breaks: `src-tauri/tauri.conf.json` `bundle.longDescription` and the literal it is pinned to in `scripts/version-consistency.test.ts` (asserts `bundle.longDescription` equals that string verbatim). Then the same sentence in `flatpak/subx.metainfo.xml`'s description paragraph (unguarded — `scripts/release-config.test.ts` reads the metainfo file but never asserts its description). Separately (different sentence, pinned by nothing — the `backendCodeParity` frontend scan walks only `src/`): `package.json` `"description": "Desktop GUI for subx-cli — AI-powered subtitle matching"` and the `description` in `src-tauri/Cargo.toml` name the engine crate as the product's backing library; reword both to name `subx-core` (e.g. "Desktop GUI for SubX — engine: subx-core — AI-powered subtitle matching" style is the implementer's call; keep it one line).
- [x] 3.3 `npx vitest run src/i18n/backendCodeParity.test.ts scripts/version-consistency.test.ts` green.

## 4. Bindings

- [x] 4.1 `npm run bindings:generate`; confirm the diff in `src/types/bindings.ts` is only doc-comment crate naming; `npm run bindings:check` green.

## 5. Documentation and spec Purpose

- [x] 5.1 Update `AGENTS.md` (Project & Architecture: "thin translation layer over `subx-core`"; Cli Isolation invariant reworded to the crate-agnostic engine-crate boundary matching D3), `README.md` and `README.zh-TW.md` where they describe the Rust backend dependency (the product name `subx-cli` as the CLI tool stays named where the sentence is about the CLI binary/config interop, not the dependency).
- [x] 5.2 Update the `## Purpose` paragraph of ALL SIX main specs to name `subx-core` as the engine crate (Purpose is not delta-governed — design D4): the four workflow specs (`openspec/specs/{match,convert,sync,translate}-workflow/spec.md`, "wraps the `subx-cli` crate's …") AND `openspec/specs/app-shell/spec.md` ("the frontend reaches the `subx-cli` crate") AND `openspec/specs/settings-management/spec.md` ("the shared `subx-cli` configuration" — reword carefully: the config STORE stays shared with the `subx-cli` binary; it is the CRATE that becomes `subx-core`). Do this in the same step as the delta sync so no main spec ends up with a Purpose naming `subx-cli` above a requirement naming `subx-core`.
- [x] 5.3 `CHANGELOG.md` `## [Unreleased]`: `### Changed` entry — backend depends on `subx-core` instead of the `subx-cli` facade; no user-visible behaviour change.

## 6. Verification

- [x] 6.1 `npm run verify` fully green (tsc, coverage incl. the two guard tests, rust coverage, `spec:trace`, `bindings:check`, `icons:check`).
- [x] 6.2 `openspec validate migrate-to-subx-core --strict` green.
- [x] 6.3 Smoke: `npm run tauri dev` launches, Settings screen reads/writes `~/.config/subx/config.toml` exactly as before (same values visible to `subx-cli config get`), one match-wizard scan reaches the AI-provider call path with a mocked base URL if convenient — the point is the IPC paths exercise the swapped crate end to end. (Note: the dev binary launched clean on NVIDIA+Wayland — no Error 71, WebKit web/network processes alive, vite serving 200; the shared `~/.config/subx/config.toml` stays readable by `subx-cli config get`; the `get_config_tolerant`/`set_config_value` DTOs are verified through the real command wrappers in `ipc_tests.rs` on the mock runtime. Live-window pixel verification was not possible: WebKitGTK's NVIDIA DMABUF surface captures as blank in spectacle, so the UI read/write was evidenced via the IPC tests + the shared-file check rather than a screenshot.)
