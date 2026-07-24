# Tasks: add-verification-gates

## 1. Traceability checker

- [x] 1.1 Create `scripts/check-spec-coverage.mjs` (Node ESM, `node:fs`/`node:path` only — no glob dependency): recursive directory walk, exported parsing functions, CLI entry guarded by `process.argv[1] === fileURLToPath(import.meta.url)`
- [x] 1.2 Implement spec parsing: walk `openspec/specs/*/spec.md`, take the capability from the directory name, track the current `### Requirement:` heading, and emit one `<capability>/<requirement-slug>#<scenario-slug>` ID per `#### Scenario:` — slug = lowercase, every run of non-alphanumerics collapsed to `-`, ends trimmed — and **fail on a duplicate derived ID** rather than deduplicating, so two headings that slugify alike can never be satisfied by one annotation
- [x] 1.3 Implement annotation scanning over the configured test roots (`src`, `scripts`, `src-tauri/src`, `src-tauri/tests`) for `// @covers <id>` lines, recording file, line and the following declaration line (`it(` / `test(` / `fn `) for the report; a configured root that does not exist yet (`src-tauri/tests`) is skipped, not an error
- [x] 1.4 Create `scripts/spec-coverage.config.json` with `specDir`, `testRoots`, `testExtensions` and an initially empty `waivers` array
- [x] 1.5 Implement validation and exit codes: fail on an unverified scenario, on a dangling `@covers` ID, on a dangling waiver ID, on a waiver missing `reason` or `manualVerification`, and on a waiver whose scenario is also annotated (stale)
- [x] 1.6 Implement `--report`: print every capability → requirement → scenario with its verifying tests or waiver reason, plus a verified / waived / unverified summary count
- [x] 1.7 Extend `test.include` in `vite.config.ts` to `["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.test.ts"]` — it is currently `src/**` only, so without this the checker's own tests would never be discovered and the checker would count as entirely uncovered
- [x] 1.8 Add `scripts/check-spec-coverage.test.ts` — unit tests over fixture spec trees in `os.tmpdir()` covering ID derivation, slug-collision detection, the four failure modes, mixed `.rs` + `.tsx` annotations, valid-waiver acceptance, a missing test root, and report output; plus one test that spawns `node scripts/check-spec-coverage.mjs` as a child process so the CLI entry guard and the real exit codes are exercised
- [x] 1.9 Add the `spec:trace` script to `package.json` (`node scripts/check-spec-coverage.mjs`) and confirm `npm run spec:trace -- --report` lists all 27 existing scenarios as unverified

## 2. Restructure what tests cannot currently reach

- [x] 2.1 Create `src-tauri/src/platform.rs`: a pure function returning the environment overrides for the current target (Linux → `__NV_DISABLE_EXPLICIT_SYNC=1`, other targets → empty) plus a thin applier; register the module and call the applier from `main.rs`, keeping the existing comment explaining the WebKitGTK/NVIDIA Wayland crash
- [x] 2.2 Add `platform.rs` unit tests: the Linux target yields the workaround variable, and the applier sets it in the process environment
- [x] 2.3 Add `state.rs` unit tests: construct `AppState` with an `Arc<TestConfigService>` and assert `config_service()` returns that same service instance (pinning the "one service per process" invariant)
- [x] 2.4 Add `tauri = { version = "2", features = ["test"] }` to `src-tauri/Cargo.toml`'s `[dev-dependencies]` and build a shared test helper around `tauri::test::mock_builder()` / `mock_context(noop_assets())` that `manage()`s an `AppState` over a `TestConfigService` and registers the real `invoke_handler`
- [x] 2.5 Cover the three `#[tauri::command]` wrappers — `get_config`, `set_config_value`, `test_ai_connection` — by invoking them through `tauri::test::get_ipc_response`, asserting the success payload and the `ErrorDto` shape cross the IPC boundary correctly; this is the whole of the 80.85 % backend function metric and establishes the pattern `add-match-wizard`'s `commands/match.rs` will reuse

## 3. Tests for the scenarios nothing currently verifies

- [x] 3.1 Add `src/styles/tokens.contrast.test.ts`: parse `tokens.css`, resolve both theme blocks, alpha-composite translucent surfaces over `--bg-base`, and assert WCAG AA (≥ 4.5:1) for every text token against every background it is used on; gradient-backed text is checked against the worst endpoint
- [x] 3.2 Fix the two violations 3.1 surfaces — in `tokens.css` set light `--text-muted` to `#5f6585` (4.42 → 5.28) and add `--accent-gradient-strong: linear-gradient(135deg, var(--accent-from), #0e7490)` (white 5.36:1); leave `--accent-gradient` and `--accent-gradient-soft` untouched
- [x] 3.3 Switch the gradient surfaces that carry text to `--accent-gradient-strong`: the three that put `--text-on-accent` on the gradient (`TaskCard.css:40`, `WizardShell.css:34` and `:106`, `SettingsScreen.css:145`), and `global.css`'s `.gradient-text` — the app-name wordmark rendered *as* the gradient via `background-clip: text`, whose cyan end is equally illegible on the light base. The contrast test checks the clipped wordmark against the page background at large-text AA (≥ 3:1); `--accent-gradient` itself stays untouched for decorative surfaces. Then confirm 3.1 passes
- [x] 3.4 Add a colour-literal lint test: no hex, `rgb(`, `hsl(` or named-colour literal in any `src/**/*.css` other than `tokens.css`, **and** none inside an inline `style={{ … }}` prop in any `src/**/*.tsx` — an inline style is the easiest way to bypass a CSS-only scan; allow `transparent`, `currentColor` and `inherit`
- [x] 3.5 Add a hard-coded-string test: render every screen that exists today (`HomeScreen`, `MatchScreen` placeholder, `SettingsScreen`) with i18next in `cimode`, where each translation resolves to its own key, and assert every DOM text node containing letters is a translation key — with a narrow, commented allowlist for legitimately untranslated content; note in `docs/verification.md` that `add-match-wizard` must extend this test to its new step components
- [x] 3.6 Add a crate-boundary test: no `subx_cli` / `subx-cli` reference exists outside `src-tauri/`
- [x] 3.7 Add an error-code parity test: every `core.*` / `config.*` code the Rust sources can emit has an entry in both `src/locales/en/errors.json` and `src/locales/zh-TW/errors.json`
- [x] 3.8 Add the two missing `settings-management` backend tests: writing `ai.api_key` then reading it back returns only the masked form, and changing language or theme leaves the CLI config file byte-identical (frontend side: no `set_config_value` invoke on a preference change)

## 4. Annotate the existing suite

- [x] 4.0 Before annotating anything: read each of the 27 scenarios' WHEN/THEN against the body of the test it is about to be attached to, and where the test falls short of the scenario, strengthen the assertion rather than annotate optimistically — annotating by file-name association is the one thing that would make the matrix false from day one. Pay particular attention to *"External changes are picked up"* (does reload-on-read satisfy "after its re-fetch"?), *"Complete zh-TW coverage"* (key parity is not the same as rendered coverage — this is why 3.5 exists) and *"Both themes render every shell screen"* (token contrast is not the same as every screen rendering)
- [x] 4.1 Annotate the `app-shell` scenarios: `App.test.tsx` (hub on launch, enter/leave a feature), `HomeScreen.test.tsx` (disabled "coming soon" cards), `WizardShell.test.tsx` (step indicator, feature-controlled navigation), `error.rs` + `useLocalizedError.test.tsx` (structured error), and the new crate-boundary test from 3.6
- [x] 4.2 Annotate the `theme-system` scenarios: `themeController.test.tsx` (dark-mode first launch, live system change, override survives restart, return to follow-system) and the contrast + colour-literal tests from 3.1/3.4
- [x] 4.3 Annotate the `localization` scenarios: `localeParity.test.ts` + the `cimode` test from 3.5 (complete zh-TW coverage), `languages.test.ts` (zh-TW and non-Chinese system locales), `languageSwitch.test.tsx` (immediate switch), `useLocalizedError.test.tsx` + the parity test from 3.7 (known and unknown error codes)
- [x] 4.4 Annotate the `settings-management` scenarios: `config.rs` (`the_config_file_is_the_shared_store` for CLI sync and external changes, `rejected_values_carry_the_field_code…`, `read_masks_the_api_key`, both `connection_test_*` tests), `SettingsScreen.test.tsx` (field-level error display, masked field, connection-test panel) and the new tests from 3.8
- [x] 4.5 Add the single waiver to `scripts/spec-coverage.config.json` for `app-shell/application-launches-successfully-under-wayland#launch-on-nvidia-wayland`, with its reason and a `manualVerification` pointer to `docs/verification.md`
- [x] 4.6 Run `npm run spec:trace` and confirm: 26 verified, 1 waived, 0 unverified, 0 dangling

## 5. Bring this change's own spec under the gate

- [x] 5.1 Sync this change's `verification-gates` delta into `openspec/specs/verification-gates/spec.md` (via the OpenSpec sync-specs workflow) so the traceability gate applies to itself during implementation rather than only after archiving
- [x] 5.2 Annotate the 14 `verification-gates` scenarios: the checker scenarios (unverified, renamed/dangling, both languages, valid waiver, unjustified waiver, stale waiver, report) against `scripts/check-spec-coverage.test.ts`; the coverage-threshold and CI scenarios against the configuration-assertion tests from 6.4 and 7.3
- [x] 5.3 Re-run `npm run spec:trace` and confirm 40 verified, 1 waived, 0 unverified

## 6. Coverage measurement and thresholds

- [x] 6.1 Add `@vitest/coverage-v8` as a dev dependency (matching the installed Vitest 2.x line) and add `coverage/` and `lcov.info` to `.gitignore`
- [x] 6.2 Configure Vitest coverage in `vite.config.ts`: provider `v8`, `all: true`, `include: ["src/**/*.{ts,tsx}", "scripts/**/*.mjs"]`, thresholds of 85 on statements / branches / functions / lines, and the exclusion list — `src/main.tsx` (entry point), `src/navigation/screens.ts` (type-only), `src/test/**`, `**/*.test.{ts,tsx}`, `src/vite-env.d.ts` — each with a comment stating its reason
- [x] 6.3 Add `src-tauri/.cargo/config.toml` with the `cov` alias: `llvm-cov --lib --fail-under-lines 85 --fail-under-functions 85 --fail-under-regions 85 --ignore-filename-regex "(^|/)(main|lib)\.rs$|/rustlib/"`
- [x] 6.4 Add configuration-assertion tests: `vite.config.ts` declares every coverage threshold at ≥ 85 with `all` enabled, and `src-tauri/.cargo/config.toml`'s `cov` alias carries all three `--fail-under-*` flags at 85
- [x] 6.5 Add the `test:coverage`, `test:rust`, `test:rust:coverage` and `verify` scripts to `package.json` (`verify` runs typecheck, both coverage gates and `spec:trace`)
- [x] 6.6 Run both gates and confirm the projected numbers hold. Working from the measured per-function data: excluding `lib.rs`/`main.rs` and adding the `state.rs` tests takes backend functions from 82.5 % to ~87.5 % (35 of 40), lines to ~92 % and regions to ~95 %; the command-wrapper tests from 2.5 should take functions to ~95 %. If functions still lands under 90 %, treat it as a real gap and add tests — do **not** widen the exclusion list, which is how the gate becomes decorative. Record the final numbers in the change summary

## 7. Continuous integration

- [x] 7.1 Add `.github/workflows/ci.yml` with a `frontend` job triggered on `push` (this project does not use a pull-request flow, so `push` is the only trigger): `setup-node` with npm cache → `npm ci` → `npx tsc --noEmit` → `npm run test:coverage`
- [x] 7.2 Add the `backend` job: apt-install the Tauri/WebKitGTK system dependencies → `dtolnay/rust-toolchain@stable` with `llvm-tools-preview` → `Swatinem/rust-cache` → `taiki-e/install-action@cargo-llvm-cov` → `cargo cov`; and the dependency-free `traceability` job: `setup-node` → `node scripts/check-spec-coverage.mjs`
- [x] 7.3 Add a CI-configuration test asserting all three gate commands appear in the workflow, that it triggers on `push`, and that no gate step carries `continue-on-error` or a suppressed exit status (`|| true`)
- [x] 7.4 Verify the workflow is green on its first run — annotations and gap-closing tests (sections 2–6) must land before this. Verified locally: `npm run verify` exits 0 and runs the exact three gates CI runs (frontend coverage, backend coverage, traceability). The push itself is the maintainer's action; the workflow triggers on `push` only.

## 8. Documentation and process

- [x] 8.1 Write `docs/verification.md`: how to run each gate locally, how to write a `@covers` annotation, how to find a scenario ID with `npm run spec:trace -- --report`, what makes a waiver acceptable, and the manual Wayland smoke-test procedure the one waiver points at
- [x] 8.2 Add a `tasks` rule to `openspec/config.yaml` requiring every new scenario in a future change to be annotated or waived, so the convention propagates to the next proposal
- [x] 8.3 Add a short "Development" section to `README.md` pointing at `npm run verify` and `docs/verification.md`
