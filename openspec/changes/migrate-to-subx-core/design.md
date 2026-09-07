# Design — migrate-to-subx-core

## Context

`src-tauri/Cargo.toml` declares `subx-cli = "1.9.1"`. The crate has since been split: the engine lives in `subx-core` (published 1.0.0), and `subx-cli`'s library half is a pure re-export facade plus the binary/terminal half. Every item the GUI imports resolves today only because the facade re-exports it; the two items the GUI imports from `subx_cli::cli` (`CollectedFiles`/`InputPathHandler`, `create_default_output_path`) are themselves re-exports of `subx_core::core::input` / `subx_core::core::sync` — ownership moved into the core in the superproject's `expose-core-orchestration-apis` (D2) change precisely so an embedder could consume them without the CLI.

The GUI pins `=2.0.0-rc.25`-style exact versions for the specta chain and pins `zip`/`toml` test deps to the crate's majors; the dependency-graph swap therefore has a verification tail, not just a rewrite. Three guard surfaces pin the crate by *name*: `backendCodeParity.test.ts` (frontend-clean regex `/subx[_-]cli/`, backend-manifest assertion `toMatch(/subx-cli/)`), `version-consistency.test.ts` (literal pinning `tauri.conf.json`'s `bundle.longDescription`), and the specs' Purpose/requirement wording.

## Goals / Non-Goals

**Goals:**
- The GUI depends on `subx-core = "1.0"`, directly on crates.io, and nowhere on `subx-cli` in its resolved graph.
- Zero user-visible change: same IPC commands, same DTO shapes, same config file, same error codes (`core.<category>`), same i18n parity.
- The crate-confinement invariant survives being true of *either* crate name — the guard must not have to change again if a future crate rename or replacement occurs.

**Non-Goals:**
- Removing or deprecating the `subx-cli` facade (that is `subx-cli`'s own future-major decision).
- Adopting any new `subx-core` API (no behaviour upgrade rides along).
- Touching the config store, precedence rules, or the GUI's version pinning philosophy.

## Decisions

### D1 — Depend on the published crate, not a git URL

`subx-core = "1.0"` from crates.io. Alternative considered: `git = "https://github.com/jim60105/subx-core", branch = "master"` — rejected because 1.0.0 is verifiably on the index and docs.rs, the GUI's release workflow (and flatpak CI) resolves from the sparse index without network access to a git branch, and the split's ordering contract guarantees the tagged artifact corresponds to the tagged commit. The caret range is deliberate here (unlike the specta exact pins): `subx-core` is post-1.0 and its release line is the one the superproject's publish asserts.

### D2 — The substitution is `sed`-shaped, but verified per-path

Mechanically: `subx_cli::` → `subx_core::` across `src-tauri/src/` and the manifest swap. The three `subx_cli::cli` imports cannot textually map to `subx_core::cli` (the core has no `cli` module); they retarget to `subx_core::core::input::{CollectedFiles, InputPathHandler}` and `subx_core::core::sync::create_default_output_path`. Every other used path is verified to exist in `subx_core` at the identical relative path (`config::ProductionConfigService/ConfigService/TestConfigService/TestConfigBuilder/mask_sensitive_value/field_validator::normalize_ai_provider`, `core::{ComponentFactory, lock::acquire_subx_lock, matcher, formats, sync, translation, file_manager}`, `error::SubXError`, `services::ai::*`, crate-root `Result`). The apply agent MUST NOT invent compatibility shims in `src-tauri` — imports either resolve or the assumption in this design is wrong and the design gets corrected.

### D3 — Re-express the name-pinned guards crate-agnostically

`backendCodeParity.test.ts` becomes:
- frontend scan regex: `/subx[_-](cli|core)/` — the frontend must name **no** engine crate;
- backend assertion: `src-tauri/Cargo.toml` matches `/subx-(cli|core)/` — the backend depends on **an** engine crate.

This keeps the requirement's actual subject (the *boundary*, per the spec's "only src-tauri changes" scenario) instead of freezing one spelling. Alternative: keep the old regexes and just flip literals — rejected: it re-pins the name the spec scenario says is replaceable, so the guard would fail the next swap, which is exactly what the scenario simulates.

**Product descriptions drop crate names entirely** (user decision during implementation): SubX implicitly uses its engine crate — both crates belong to one project family and the name `SubX` expresses it, so neither `subx-core` nor `subx-cli` belongs in product wording ("we are even less related to the CLI now" — the facade removal was the last dependency claim on it). Mechanically: the only byte-coupling the suite enforces is `tauri.conf.json`'s `bundle.longDescription` ("…powered by AI and subx-cli." → "…powered by AI.") ↔ the literal in `version-consistency.test.ts` (the test asserts that field equals the literal verbatim) — those two MUST change in the same step or `npm run verify` fails. `flatpak/subx.metainfo.xml` carries the same sentence in its description paragraph but is unguarded (`release-config.test.ts` reads the file without asserting the description), so it moves in the same commit for consistency, not correctness. `package.json`'s and `src-tauri/Cargo.toml`'s `description` fields are a *different* sentence ("Desktop GUI for subx-cli — …") pinned by nothing — the `backendCodeParity` frontend scan walks only `src/` — reworded to the crate-free product sentence matching the pinned `bundle.shortDescription`. The same logic reaches the unguarded prose: `AGENTS.md`'s and the README pair's "desktop GUI for subx-cli" self-description becomes a description of SubX itself; sentences that are true statements about the **CLI binary** (config-store interop at `~/.config/subx/config.toml`, companion-tool pointers, Related Projects) keep naming `subx-cli`.

### D4 — Specs move their crate naming; Purpose edits are not delta-governed

`app-shell` and `settings-management` get MODIFIED requirement deltas (crate-name change in requirement/scenario text; the confinement scenario additionally generalized per D3). All six main specs (those two plus the four workflow specs) also name the crate in their `## Purpose` paragraphs; openspec deltas govern requirements only, so all six Purpose lines are hand-updated at sync time, in the same step as the delta sync, so no spec ends up with a `subx-cli` Purpose above a `subx-core` requirement (same procedure the superproject's archive notes prescribe). No new capability: the capability is unchanged — same engine, different crate name on the import line.

### D5 — Regenerate bindings; do not hand-edit

`bindings.ts` embeds Rust doc comments; `dto.rs`/`error.rs` doc lines that name the crate flow into it. `npm run bindings:generate` then `bindings:check` is the gate; the parity test already exempts `bindings.ts` from the frontend scan, so no test change is needed for the generated file.

## Risks / Trade-offs

- [A used path silently differs in `subx-core`] → D2's per-path verification above was done against the published 1.0.0 tree (`subx-core/src` at the `v1.0.0` tag); any residual miss is a compile error, not a runtime surprise — `cargo check` in task 1 catches it immediately.
- [Test-dep pins (`zip = "8"`, `toml = "1"`, `wiremock`) diverge from what `subx-core` resolves after the swap] → task 2 runs `cargo tree -i` checks; adjust pins to the core's majors (expected identical: the core keeps the same dependency majors the facade had).
- [`specta`/`tauri-specta` rc pins incompatible with a dependency-graph change] → they never saw `subx-cli` in their own feature graph (the GUI wraps DTOs itself; no crate type implements `specta::Type`), so the swap cannot reach them; `bindings:check` proves it.
- [Metainfo/description wording change breaks `version-consistency.test.ts` if edits split across commits] → D3 makes the coupled pair + test literal a single atomic edit; `npm run verify` is the check.
- [The GUI's `AGENTS.md`/README pair keep saying "GUI for subx-cli"] → reworded to describe SubX itself per D3's product-wording decision; no test pins them, but leaving them would position the app as a shell over a crate it no longer depends on.

## Migration Plan

Single branch, one pass: manifest → imports → guards/docs → regenerate + verify. Rollback is `git revert` of one small branch — nothing in the app's persisted state (config file, bindings contract, IPC keys) changes shape, so an old binary and the new one remain mutually compatible with the same `config.toml`.

## Open Questions

_none._
