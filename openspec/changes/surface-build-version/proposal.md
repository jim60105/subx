# Proposal: surface-build-version

## Why

Developers repeatedly ran stale instances — a leftover `tauri dev` process serving an old webview survived restarts (the reason `scripts/dev.sh` exists) — and there was no way to tell at a glance which build a running window actually was: neither the UI nor the backend output shows any version or commit identity. One visible, unambiguous build string in the UI and one startup log line turn "am I looking at old code?" from a guess into a glance.

## What Changes

- **Build-time embedding**: `src-tauri/build.rs` captures the short git commit hash at build time (`git rev-parse --short HEAD`) and exports it via `cargo:rustc-env`, always emitting the variable — empty when git is unavailable — so every build, dev or CI, degrades gracefully to a hash-less version string. No tag-vs-hash branching: the display version is the package version (`package.json` 0.2.0, which `tauri.conf.json` already reads and which `release.yml` already validates against the release tag), and the hash suffix answers the "is this stale code?" question that tags alone cannot. See design D1 for the full rationale, including why the Tauri 1-era `tauri-build` `git` feature is not available on this repo's Tauri 2 stack.
- **Backend**: a `build_info` module computes the version string and the startup log line; `run()` prints the line (`SubX 0.2.0 (8e92039, debug)`) once at startup before the window is built. A guard test pins `Cargo.toml`'s version against `package.json`'s so a one-sided bump cannot make the badge lie. No logging framework is introduced — the repo has none, and stdout is exactly where `tauri dev` shows it.
- **Frontend**: a new typed IPC command `get_build_info` returns `{ version, gitHash, debug }`; `AppHeader` renders a compact, selectable version badge (`0.2.0 · 8e92039`) as a sibling right after the brand block on every screen — the header is the only element that is on every screen, so the identity can never be "off-screen" when a stale window is up, and sibling placement keeps the badge out of the brand button's pinned accessible name and away from its home-navigation click.
- **i18n**: one `common.version` accessible-name key in `en` and `zh-TW`; the version string itself is code, not prose.
- Regenerated `src/types/bindings.ts`, extended `ipc_tests` COMMANDS allowlist, `@covers`-tagged tests throughout.

## Capabilities

### New Capabilities

- `build-identity`: the app knows and displays which build it is — build-time version+hash embedding, a startup log line, and a persistent UI badge.

### Modified Capabilities

(none — the badge is rendered as a sibling of the brand block with its own accessible-name prefix, leaving the brand button's pinned accessible name and every existing app-shell requirement's behavior untouched.)

## Impact

- `src-tauri/build.rs` (git-hash capture + rerun-if-changed on HEAD/ref/packed-refs), a new `src-tauri/src/build_info.rs` (version/log-line logic, unit tests incl. the version-manifest guard), `src-tauri/src/lib.rs` (startup print, module declaration), `src-tauri/src/dto.rs` (`VersionInfoDto`), `src-tauri/src/commands/system.rs` (the `get_build_info` command, following the `ping` pattern), `src-tauri/src/ipc_tests.rs` (allowlist 21 → 22, command round-trip, `@covers` tags).
- Frontend: `src/components/AppHeader/AppHeader.tsx`/`.css`/`.test.tsx` (badge), `src/i18n/hardCodedStrings.test.tsx` (mock answers `get_build_info`, allowed-shape patterns for the verbatim version/hash label), `src/types/ipc.ts` re-export, `src/locales/{en,zh-TW}/common.json`.
- Spec traceability: `scripts/spec-coverage.config.json` gains a waiver for the two-instance stale-diagnosis scenario (live instances required; repo waiver precedent).
- No workflow changes: CI checkouts include `.git` by default, so the build script's hash capture works on CI without touching `ci.yml`/`release.yml` (design D1).
- No capability/permission changes: app-defined commands need no ACL entries, and `@tauri-apps/api`'s `getVersion()` is deliberately not used (design D5).

## Batch:

- depends-on: (none)
- Code conflicts: touches files no in-flight change owns; the AppHeader JSX/CSS touched here adds a row child between the brand block and the controls cluster, leaving both untouched.
