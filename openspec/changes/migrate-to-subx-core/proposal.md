# Proposal — migrate-to-subx-core

## Why

The GUI depends on `subx-cli = "1.9.1"` — the crate the two-crate split explicitly extracted `subx-core` for embedders like this one to depend on instead. Since 2.0.0 the `subx-cli` library half is only a re-export facade, and `subx-core@1.0.0` is now published on crates.io (docs.rs build live), so the facade's reason to exist for this consumer has expired. Depending on the CLI facade drags the whole binary half (clap, terminal presentation) into the GUI's resolved graph and security-audit surface for zero used functionality, and every facade removal in a future `subx-cli` major becomes a forced break for this GUI.

## What Changes

- `src-tauri/Cargo.toml`: replace `subx-cli = "1.9.1"` with `subx-core = "1.0"`; regenerate `src-tauri/Cargo.lock`.
- All Rust sources in `src-tauri/src/`: swap `subx_cli::` → `subx_core::` (pure crate-name substitution for `config`, `core`, `error`, `services`, `Result`), plus three imports whose owners moved into the core in proposal D2 and must switch to their core-owned paths:
  - `subx_cli::cli::{CollectedFiles, InputPathHandler}` → `subx_core::core::input::{...}`
  - `subx_cli::cli::sync_args::create_default_output_path` → `subx_core::core::sync::create_default_output_path`
- The `backendCodeParity` guard test: its two crate-boundary assertions currently pin the *name* `subx-cli` (frontend-clean scan regex + `Cargo.toml` must contain `subx-cli`). Re-express the invariant crate-agnostically — the frontend must name **no** engine crate (`subx[_-]cli` or `subx[_-]core`), and the backend manifest must depend on **an** engine crate — so the guard survives this migration and any future one.
- Naming of the engine crate in product metadata and repository docs: `src-tauri/tauri.conf.json` `bundle.longDescription` (byte-coupled to the literal `scripts/version-consistency.test.ts` asserts against it — the two must move in one step), `flatpak/subx.metainfo.xml` description paragraph (the same sentence, unguarded by any test), `package.json` description and the `src-tauri/Cargo.toml` package description (a different sentence — "Desktop GUI for subx-cli — …" — pinned by nothing; the `backendCodeParity` frontend scan walks only `src/`, so these are free wording changes), `AGENTS.md`, README pair — the engine behind the GUI is `subx-core`; the config-store path (`~/.config/subx/config.toml`) and shared-with-CLI semantics are unchanged (the store is owned by the core crate).
- Spec wording: the `app-shell` thin-command-layer requirement and its crate-swap scenario, and the `settings-management` requirement, currently name `subx-cli` as the depended crate — they change through delta specs. Additionally all six main specs (`app-shell`, `settings-management`, and the four workflow specs) name `subx-cli` in their `## Purpose` paragraphs, which deltas do not govern; those six Purpose lines are hand-updated at sync time (design D4).
- Regenerate `src/types/bindings.ts` (`npm run bindings:generate`) — Rust doc comments mentioning the crate flow into the generated file, and `bindings:check` will fail otherwise.

No user-facing behaviour changes: same commands, same IPC surface, same config file, same error codes. `subx-cli` 1.9.x/2.0's facade keeps working for any other consumer; this change does not touch that repository.

## Capabilities

### New Capabilities

_none — this change modifies requirements of existing capabilities only._

### Modified Capabilities

- `app-shell`: the "Thin Tauri command-layer structure" requirement and its "Crate access is confined to the command layer" scenario name `subx-cli` as the depended crate; they become `subx-core`, and the confinement scenario is re-expressed as crate-agnostic (swapping the engine crate — in either direction — must touch only `src-tauri`).
- `settings-management`: the "Settings screen edits the shared CLI configuration" requirement names the `subx-cli` crate's `ConfigService`; the crate becomes `subx-core`. The shared-store contract (`~/.config/subx/config.toml`, interoperability with the `subx-cli` binary's `config get`) is unchanged and stays named — the binary remains a peer writer of the same file.

Not delta specs: the `match-workflow`, `convert-workflow`, `sync-workflow`, `translate-workflow` specs name the crate only in their `## Purpose` paragraphs (their requirements reference "the crate" generically). Purpose wording is not a requirement delta; the Purpose lines of all six main specs (these four plus `app-shell` and `settings-management`, whose Purposes also name the crate) are updated by hand as a task (openspec tooling does not rewrite Purpose text through deltas).

## Impact

- **Risk: low.** The substitution is mechanical; the only semantic surface is the three D2-relocated imports, which exist precisely because the core already owns them (`subx_core::core::input`, `subx_core::core::sync` export the same items the facade re-exports).
- **Dependency: none outstanding.** `subx-core@1.0.0` is published (crates.io index verified, docs.rs 200). The GUI stays on the published crate — no git-URL pin needed.
- **Build graph**: `clap`, terminal/progress-bar dependencies and the binary-half tree leave the resolved lockfile; test-only pins (`zip = "8"`, `toml = "1"`) must be re-verified against what `subx-core` resolves (same majors expected; the task list checks).
- **Verification**: `cargo test --manifest-path src-tauri/Cargo.toml` → `npm run verify` (tsc, coverage, spec:trace, bindings:check, icons:check). The `@covers` traceability comments keep their IDs; only the `backendCodeParity` test bodies change.
- **Not in scope**: removing the facade from `subx-cli` (that repository's future major); any change to the config file format, precedence, or path; any frontend code change beyond the regenerated `bindings.ts` and the two guard-test assertions.
