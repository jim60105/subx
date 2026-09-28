# Design: surface-build-version

## Context

See proposal.md for motivation. Current state that shapes the approach:

- `tauri.conf.json` sets `"version": "../package.json"` (currently 0.2.0), and `release.yml`'s `prepare` job already fails a tag push whose tag does not match `package.json` (`scripts/check-release-tag.mjs`). The package version therefore *is* the release tag's version — a CI-only "tag vs hash" distinction would encode information the pipeline already guarantees.
- The Tauri "general best practice" the assignment asks about exists, but not in the shape the user remembered: `tauri-build` v1.x had an opt-in `git` feature that emitted `TAURI_GIT_HASH` for `option_env!`. **That feature no longer exists in Tauri 2** — `tauri-build` 2.6.3 (this repo's locked version; tauri 2.11.5) exposes only `config-json`, `codegen`, `isolation`, `config-json5`, `config-toml`, and the CLI's documented environment-variable list has no git variable. Verified against the published feature list and changelog of tauri-build 2.x. So the hash must be captured by the app's own `build.rs` — which is exactly what the Tauri community docs recommend (`git rev-parse HEAD` in a build script, `cargo:rustc-env`).
- `src-tauri/build.rs` today is a bare `tauri_build::build()`; `src-tauri/src/commands/system.rs` already has the `ping` reference command returning `PingResponse { message, app_version }` with `app_version` = `env!("CARGO_PKG_VERSION")`, but no UI calls it (it survives only as the IPC-pattern reference in `App.test.tsx`).
- The backend has **no logging framework**: no `log`/`tracing`/`env_logger` anywhere in `src-tauri/`. `tauri dev` shows the process stdout, which is where a developer looks for "which backend did my dev launcher just rebuild".
- The frontend's IPC boundary rule (`ipcBoundary.test.ts`): everything reaches the backend through generated `src/types/bindings.ts`; every command must appear in the `COMMANDS` allowlist in `src-tauri/src/ipc_tests.rs`. App-defined commands need no capability-file entries (`capabilities/default.json` only lists plugin/core permissions).
- `AppHeader` renders on every screen and owns a brand block (name + tagline); the home screen, wizards and settings each scroll independently — the header is the only always-visible surface.

## Goals / Non-Goals

**Goals:**
- One canonical build string — `version` + short git hash + build profile — computed once in the backend and rendered verbatim in the UI badge and the startup log line, so the two can never disagree.
- Works identically on dev builds, CI builds, and local release builds, with graceful degradation (no git metadata ⇒ version-only string) rather than build failure.
- Zero workflow changes.

**Non-Goals:**
- No logging framework, log files, rotation, or levels (out of scope; a startup `println!` is the whole requirement).
- No window-title mutation, no Settings "About" section, no update checker.
- No frontend-side git metadata (Vite `define` injection): the header badge is a *reported* backend build, and the backend is the component whose staleness devs actually got burned by.
- No CI-only tag-reading step (see D1).

## Decisions

### D1 — Version identity: package version always, short git hash as suffix; no tag-vs-hash branching

The user's original idea (git tag on CI, git hash otherwise) is rejected in favor of the boring convention `version + short hash`:

- **Tag == package version is already enforced.** `tauri.conf.json` derives its version from `package.json`, and `check-release-tag.mjs` gates every release tag push on that equality. A "show the tag on CI" path would display, verbatim, the version the hash-less fallback already shows — pure duplication of code paths for zero information.
- **The hash is the stale-code answer.** Tags don't distinguish `v0.2.0-9-g8e92039` builds; a short hash does, in ~7 characters.
- **Both halves come free at build time** (D2), so there is no CI-only step to fund. If a future release genuinely needs the tag at runtime, `release.yml` can set an env var read via `option_env!` — deliberately not built now (no speculative branch).
- Tauri's own convention agrees: the packaged version is the display identity; Tauri 2 ships no tag/hash distinction, so the repo's build script supplies the hash.

### D2 — Capture the hash in `build.rs` via `cargo:rustc-env`, always defined

`build.rs` runs `git rev-parse --short HEAD` with the manifest dir as cwd and emits `cargo:rustc-env=SUBX_GIT_HASH=<hash>`; when git is missing, the repo has no HEAD (source tarball), or the command fails, it emits `cargo:rustc-env=SUBX_GIT_HASH=` (empty). Emitting the variable *unconditionally* — instead of `option_env!`-style absence — keeps one code path and one plain `env!` read, so dev builds degrade by value, not by cfg. It also emits `cargo:rerun-if-changed` for `.git/HEAD`, the file `.git/<ref>` HEAD names when HEAD is symbolic, and `.git/packed-refs` — `git gc` (auto-run by commit) prunes loose refs, and cargo's missing-watch behavior is a silently stale hash, so the packed-refs watch is load-bearing. The hash refreshes as the working tree moves; the re-run cost is negligible next to a Tauri build. The profile needs no capture: `debug_assertions` is already compile-time truth. `build.rs` uses `std::process::Command` only — no new dependencies, `tauri_build::build()` still runs last.

- *Alternative considered*: a `vergen`/`built` crate dependency — rejected: one `Command` call versus a new transitive tree, on a repo that pins its load-bearing deps deliberately.
- *Alternative considered*: `option_env!` + feature-gated emission — rejected: two compile paths, and the "hash missing" branch then only ever gets tested in dev.

### D3 — One backend-owned `build_info` module: string + DTO + log line

`src-tauri/src/build_info.rs` (crate-internal, not a command module) exposes pure functions over injected pieces:

- `git_hash() -> Option<&'static str>` (empty env ⇒ `None`)
- `version_string() -> String` — `"0.2.0"` or `"0.2.0 (8e92039, debug)"`; profile shown only in debug builds so release strings stay clean.
- `startup_log_line() -> String` — `"SubX 0.2.0 (8e92039, debug) starting"`.
- `VersionInfoDto { version, git_hash: Option<String>, debug: bool }` in `dto.rs` — raw parts, not the pre-formatted string, so the frontend owns its own compact rendering (`0.2.0 · 8e92039`) and the log line stays backend-owned; both derive from the same two statics so they cannot drift.

`run()` calls `println!("{}", build_info::startup_log_line())` as its first statement — before config-service construction, so even a config failure is preceded by the identity line, and stdout is where `tauri dev`/terminal shows it. `run()` is headless-untestable like `main()`, so the startup scenarios are verified by a content test on `startup_log_line()` for the launch scenario, plus one waiver for the two-instance diagnosis scenario (repo precedent: `scripts/spec-coverage.config.json` waivers carry a reason and a manual-verification pointer).

`env!("CARGO_PKG_VERSION")` is the badge's version source while release.yml gates the *tag* against `package.json`; nothing today links `src-tauri/Cargo.toml`'s version to `package.json`'s. A guard unit test reads `../package.json` and asserts the two versions are equal, so a bump that forgets one manifest fails CI instead of letting the badge silently lie. The DTO carries `debug` although the badge shows no profile: the profile is part of build identity (it is in the log line), the field is asserted by the command round-trip, and dropping it would make the DTO describe less than the string it replaces.

- *Alternative considered*: `log::info!` + `env_logger` — rejected: a logging framework for one line; if the repo ever adopts `log`, this call moves with it.

### D4 — New `get_build_info` command (extends nothing)

`commands/system.rs` gains `get_build_info() -> Result<VersionInfoDto, ErrorDto>` beside `ping`, declared in `bindings.rs`'s specta builder (the single IPC-surface declaration), which regenerates `commands.getBuildInfo` into `src/types/bindings.ts`, requires the `"get_build_info"` entry in the `ipc_tests.rs` `COMMANDS` allowlist (21 → 22), and is re-exported as a type from `src/types/ipc.ts`. `ping`/`PingResponse` stays untouched as the documented pattern reference. A pure `build_info` unit test covers hash-presence and string formatting; a `ipc_tests`-style mock-runtime round-trip covers the wrapper.

### D5 — Frontend shows the *backend's* string via IPC, not `getVersion()`

`@tauri-apps/api/core`'s `getVersion()` is already in deps and would need no new command, but it returns only the config/package version — no hash, which is the entire stale-code signal — and it describes the *frontend bundle's* view; a stale-webview scenario is precisely when frontend-side metadata is suspect. The badge therefore renders the IPC-reported parts: `commands.getBuildInfo()` in `AppHeader` (one effect; state stays `null` until resolved *and* stays `null` after a rejected fetch — the badge reports, never invents — so first paint never flashes a wrong value), formatted `{version} · {gitHash}` (or bare version with no hash).

Placement: a direct child of the `.app-header` flex row, a *sibling* after the brand block — deliberately outside it. Inside the brand the badge would ride inside the home `<button>` on every non-home screen, appending "Running build 0.2.0 · abc1234" to that button's pinned accessible name (`app-shell` contract: brand text plus the "Back to home" extension only), and any selection attempt would navigate home mid-wizard. As a sibling it is plain text outside the button and outside the drag region's maximize-target children, and `.app-header__version { user-select: text; }` overrides the header-wide `user-select: none` so the string is selectable and copyable for bug reports. It uses `var(--text-muted)`/`var(--text-xs)` tokens only, sits between the brand and the untouched 36px controls cluster, and carries a localized accessible name `t("version")` (`"Running build"` / `"執行中的版本"`) as a visually-hidden `<span>` prefix, with the version string itself outside translation keys. No capability change (app-defined commands ride `core:default` as every existing command already does).

## Risks / Trade-offs

- **Hash goes stale within a running instance** if source changes without a rebuild — that is inherent and *correct*: the badge reports the binary that is running, which is the point.
- **Dirty working tree**: the short hash of HEAD doesn't show uncommitted changes. Accepting this (hash + timestamp-of-log disambiguates dev churn; `git describe`-style dirty suffixes would complicate the build script for no decision the badge makes). Noted so implementers don't "improve" it silently.
- **`git` absent on a CI runner**: build still succeeds with a version-only string; CI jobs already run `git` (bindings drift gate), so the hash will be present there.
- **`.git/HEAD` rerun-if-changed** adds one build-script re-run per commit — negligible; tarball builds without `.git` simply never re-trigger.
