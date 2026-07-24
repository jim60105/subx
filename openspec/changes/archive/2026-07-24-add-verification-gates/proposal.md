# Proposal: add-verification-gates

## Why

The project has 87 tests that all pass, but nothing keeps them honest: coverage is never measured (`@vitest/coverage-v8` is not even installed), nothing runs on push (`.github/` does not exist), and there is no mechanical link between the 27 scenarios written in `openspec/specs/` and the tests that supposedly verify them. Today's numbers are good by accident — a measurement taken for this proposal puts the frontend at 95.7 % statements and the backend at 88.8 % lines, with `state.rs` at 0 % — and accidents do not survive `add-match-wizard`, the largest change still ahead. This change turns "we test things" into an enforced contract before the flagship feature lands on top of it.

## What Changes

- **Coverage measurement and thresholds.** Add `@vitest/coverage-v8` and configure Vitest coverage in `vite.config.ts` with a first-party `include` and a small, explicitly-listed `exclude`; add a `cargo cov` alias driving `cargo-llvm-cov`. Both fail the run below **85 %** on every metric they can report (Vitest: statements/branches/functions/lines; llvm-cov: lines/regions/functions — stable `llvm-cov` reports no branch data).
- **A spec-to-test traceability checker.** Add `scripts/check-spec-coverage.mjs` (dependency-free Node ESM). It parses every `### Requirement:` / `#### Scenario:` in `openspec/specs/**/spec.md` into a stable ID, scans the test sources of both languages for `// @covers <id>` annotations, and fails on an uncovered scenario, an annotation pointing at a scenario that no longer exists, or a stale waiver. `--report` prints the full traceability matrix.
- **Annotate the existing suite.** Tag the current TypeScript and Rust tests with `@covers` for the scenarios they already verify, so the matrix starts truthful rather than aspirational.
- **Close the real gaps** the audit exposed — these are scenarios currently asserted by no test at all:
  - `state.rs` (`AppState`) is never constructed in a test — 0 % covered.
  - The three `#[tauri::command]` wrappers in `commands/config.rs` are 0 % covered — every test calls the extracted logic beneath them, because the wrappers take `State<AppState>`. This is the whole of the backend's weak 80.85 % function metric, and `add-match-wizard` will add a file full of the same shape. Fixed by testing them through `tauri::test`'s mock runtime, which also covers the `invoke_handler` registration and the DTO serde round-trip.
  - *"all text meets readable contrast"* — add a WCAG contrast test computing ratios from `tokens.css` for both themes, including alpha compositing of the translucent surfaces. **The measurement taken while writing this proposal shows the requirement is currently violated in two places**, so the change also fixes them: light-theme `--text-muted` reaches only 4.42:1 on `--bg-base` (→ `#5f6585`, 5.28:1), and white `--text-on-accent` over the brand gradient's cyan end reaches only 2.43:1 (→ a new `--accent-gradient-strong`, violet → `#0e7490`, 5.36:1, used only where the gradient carries text; the decorative gradient keeps its neon identity).
  - *"components never hard-code colors"* — add a lint test rejecting colour literals in any `src/**/*.css` other than `tokens.css`.
  - *"no user-facing string SHALL be hard-coded"* — add a test rendering every screen under i18next's `cimode`, where each translated string resolves to its own key; any remaining prose in the DOM is hard-coded.
  - *"crate access is confined to the command layer"* — add a lint test asserting no `subx_cli` / `subx-cli` reference outside `src-tauri/`.
  - *"the backend never emits translated text"* — add a cross-language test asserting every error code the Rust source can emit has both an `en` and a `zh-TW` translation.
  - Move the Linux/Wayland WebKitGTK workaround out of the untestable `main()` into a testable `src-tauri/src/platform.rs`.
- **An explicit waiver list.** `scripts/spec-coverage.config.json` holds the checker's paths plus waivers: a scenario may be exempted only with a written reason and a manual verification procedure. Exactly one scenario is expected to be waived — *"Launch on NVIDIA + Wayland"*, which needs a real GPU and compositor.
- **CI.** Add `.github/workflows/ci.yml` running three jobs on every push: frontend (typecheck + Vitest with coverage), backend (`cargo test` + `cargo cov`), and traceability. Any failing gate fails the pipeline. This project does not use a pull-request flow, so CI is a backstop rather than a merge barrier — which is why the same gates are also bundled into a local `npm run verify`.
- **Documentation and process.** Add `docs/verification.md` (how to run the gates, how to write a `@covers` annotation, when a waiver is acceptable) and add a `tasks` rule to `openspec/config.yaml` so every future change proposal carries the annotation obligation forward.

## Capabilities

### New Capabilities

- `verification-gates`: The project's automated verification contract — enforced minimum test coverage for both the TypeScript and Rust sources, mechanical traceability from every specification scenario to the tests that verify it (or to a justified waiver), and the CI pipeline that runs both gates on every change.

### Modified Capabilities

(none — no product behaviour changes. The frontend, the command layer and the specs' requirements are untouched; only their verification is added, plus the extraction of the existing Wayland workaround into a testable module.)

## Impact

- **New files:** `scripts/check-spec-coverage.mjs`, `scripts/check-spec-coverage.test.ts`, `scripts/check-spec-coverage.d.mts`, `scripts/spec-coverage.config.json`, `scripts/gate-config.test.ts`, `scripts/ci-config.test.ts`, `src-tauri/src/platform.rs`, `src-tauri/src/handlers.rs` (the extracted single command registration, kept out of the coverage-excluded `lib.rs`), `src-tauri/src/ipc_tests.rs` (the `tauri::test` command-wrapper suite), `src-tauri/.cargo/config.toml`, `.github/workflows/ci.yml`, `docs/verification.md`, plus new test files for the contrast, colour-literal, `cimode`, crate-boundary and error-code-parity checks.
- **Modified:** `vite.config.ts` (coverage block, plus `test.include` extended to `scripts/**/*.test.ts` so the checker's own tests actually run), `src-tauri/Cargo.toml` (`tauri` with the `test` feature added to `[dev-dependencies]`), `package.json` (`@vitest/coverage-v8` and `@types/node` dev dependencies — the latter types the checker's `node:*` imports; `test:coverage`, `test:rust`, `test:rust:coverage`, `spec:trace`, `verify` scripts), `.gitignore` (`coverage/`, `lcov.info`), `src-tauri/src/main.rs` (delegates to `platform.rs`), `openspec/config.yaml` (tasks rule), `src/styles/tokens.css` plus the stylesheets that put text on the gradient (`TaskCard.css`, `WizardShell.css`, `SettingsScreen.css`, and `global.css`'s `.gradient-text` wordmark) for the contrast fix, and every existing test file (annotations only — no assertions change).
- **Visible change:** the only user-visible difference is the contrast fix — a slightly darker muted text in the light theme and a deeper cyan end on gradient surfaces that carry white text. Decorative gradients are untouched.
- **New tooling dependencies:** `@vitest/coverage-v8` (npm, dev) and `cargo-llvm-cov` (CI-installed; already present on the maintainer's machine). No runtime dependency is added, and no product code path changes.
- **CI cost:** the backend job must build `subx-cli` and the Tauri system dependencies (`libwebkit2gtk-4.1-dev` et al.); caching keeps repeat runs cheap.
- **Follow-on:** `add-match-wizard` inherits both gates — its `match-workflow` scenarios must be annotated as part of that change, and its new modules count against the same 85 % floor.
