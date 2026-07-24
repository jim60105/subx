# Proposal: add-typed-ipc-bindings

## Why

`src/types/ipc.ts` opens with the sentence "TypeScript mirrors of the backend DTOs in `src-tauri/src/dto.rs`" — and nothing whatsoever enforces that claim. Every DTO field, every `rename_all = "camelCase"` translation, every command name and argument shape is transcribed by hand and verified by nobody: the Rust tests assert backend logic without touching serialization, and the frontend tests feed `mockIPC` payloads the frontend author invented. Rename `api_key_masked` in `dto.rs` today and both suites stay green while the Settings screen silently reads `undefined`.

The next change, `add-match-wizard`, multiplies that surface: `SourceScanResult`, `MatchPlanDto` with nested video groupings, `MatchOperationDto`, `ExecutionReportDto`, plus `match-progress` event payloads — its tasks currently say "Define DTOs in `dto.rs` (+ TypeScript mirrors)". Generating the contract before that change means those mirrors are never written by hand at all; generating it afterwards means writing them, then deleting them.

**Depends on:** `add-verification-gates`. This change rewrites every command path, and the safety net it needs — the `tauri::test` command-wrapper tests and the coverage floor — is exactly what that change installs.

## What Changes

- **Generate the TypeScript IPC contract from Rust.** Adopt `specta` + `tauri-specta` + `specta-typescript`: derive `specta::Type` on every type crossing the boundary (`PingResponse`, `AiConfigDto`, `ConfigDto`, `SetConfigRequest`, `ConnectionTestResult`, `ErrorDto`), collect the commands into a `tauri_specta::Builder`, and emit `src/types/bindings.ts`.
- **Replace `generate_handler!` with the specta builder** in `handlers.rs` — the module `add-verification-gates` extracted from `lib.rs` to hold the crate's single registration — so the generated bindings and the registered handlers cannot disagree; the builder is the single source of both.
- **Bindings are committed, and drift fails the build.** Generation runs from a Rust test (`cargo test export_bindings`), not a `build.rs`, so the artifact is in version control, diffable in review, and reproducible without a build step. A new gate regenerates and runs `git diff --exit-code`.
- **Retire the hand-written mirrors.** `src/types/ipc.ts` shrinks from 60 lines of hand-transcribed interfaces to the one thing specta cannot generate: the `isErrorDto` runtime type guard (used by `useLocalizedError.ts` and `useSettingsForm.ts`), re-exporting the generated types so the eight existing import sites keep working.
- **Route commands through the generated bindings.** `settingsApi.ts` keeps its domain layer (`AI_FIELDS`, the `CONFIG_KEYS` mapping, `AI_PROVIDERS`) but calls the generated typed functions instead of `invoke<ConfigDto>("get_config")`. A lint test asserts no raw string-named `invoke` call survives outside the generated module — the loophole that would let the contract rot again.
- **Establish the typed-event pattern.** The builder is wired for events even though none exist yet, so `add-match-wizard`'s `match-progress` extends a working mechanism instead of reintroducing hand-written payload types.
- **Wire the new gate into the existing verification setup:** the drift check joins `npm run verify` and the CI workflow, `src/types/bindings.ts` joins the coverage exclusion list as a generated artifact, and the `verification-gates` CI requirement is updated to enumerate four gates rather than three.

## Capabilities

### New Capabilities

- `typed-ipc`: The IPC contract between the Rust command layer and the TypeScript frontend — types and command signatures generated from the Rust definitions rather than transcribed, committed as a reviewable artifact, protected against drift, and reached only through the generated bindings.

### Modified Capabilities

- `verification-gates`: the "Continuous integration runs every gate" requirement currently enumerates three gates (frontend coverage, backend coverage, traceability); it gains the bindings-drift gate as a fourth.

## Impact

- **New files:** `src/types/bindings.ts` (generated, committed), a `bindings.rs` export module in `src-tauri/src/`, plus tests for the drift gate and the raw-`invoke` lint.
- **Modified:** `src-tauri/Cargo.toml` (specta dependencies), `src-tauri/src/handlers.rs` (the builder replaces `generate_handler!`; `lib.rs::run()` keeps taking its invoke handler from there), `src-tauri/src/dto.rs` and `error.rs` (`Type` derives), `src-tauri/src/ipc_tests.rs` (its `the_allowlist_matches_the_registration` test currently pins `COMMANDS` against the `generate_handler!` source text and must be re-pointed at the builder's command list), `src/types/ipc.ts` (reduced to the runtime guard plus re-exports), `src/features/settings/settingsApi.ts` (typed calls), `vite.config.ts` (coverage exclusion), `package.json` (`verify` gains the drift check), `.github/workflows/ci.yml` (drift step in the backend job), `scripts/ci-config.test.ts` and `scripts/gate-config.test.ts` (both enumerate the gates and must count the fourth), and the four frontend test files that construct DTO literals.
- **New dependencies — and the material caveat:** `specta`, `tauri-specta` and `specta-typescript` are all pre-1.0 (`2.0.0-rc.25` and `0.0.12` as of this proposal). Adopting an RC crate as the backbone of the IPC layer is a real risk and is argued explicitly in the design; the stable alternative, `ts-rs` 12, generates struct types but not command or event signatures, which is most of the value here.
- **No product behaviour changes.** Same commands, same payloads, same UI. If the generated bindings differ from today's hand-written types in any way other than formatting, that difference is a bug this change has found.
- **Follow-on:** `add-match-wizard`'s task 1.2 ("Define DTOs in `dto.rs` (+ TypeScript mirrors)") must be rewritten to drop the hand-written mirrors, and its `match-progress` events defined through `tauri_specta::Event`.
