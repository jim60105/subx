## Context

The repository has two distinct codebases: a React + TypeScript frontend and a Rust (Tauri backend) codebase. Both have unit test suites and 85% coverage floor gates configured in local npm/cargo scripts and CI. However, coverage artifacts and test execution results are currently lost after CI jobs finish because they are not published to any code coverage platform.

Codecov (codecov.io) supports multi-flag uploading and JUnit XML test result tracking (Test Analytics). Using `codecov/codecov-action@v5`, we can upload both coverage files and test result XML files for both TypeScript (frontend) and Rust (backend) jobs.

## Goals / Non-Goals

**Goals:**
- Enable LCOV coverage report generation for both frontend (Vitest) and backend (`cargo llvm-cov`).
- Enable JUnit XML test result generation for both frontend and backend test runs.
- Add GitHub Actions steps to upload coverage reports to Codecov with component flags (`flags: frontend`, `flags: backend`).
- Add GitHub Actions steps to upload test results to Codecov (`report_type: test_results`) with component flags (`flags: frontend`, `flags: backend`).
- Ensure Codecov upload steps run even if test steps fail (using `if: ${{ !cancelled() }}`).
- Authenticate Codecov uploads using `${{ secrets.CODECOV_TOKEN }}`.

**Non-Goals:**
- Modifying local coverage thresholds (the 85% floor remains mandatory).
- Changing local verification commands (`npm run verify`).

## Decisions

### Decision 1: Frontend Coverage and Test Result Generation
- Update `vite.config.ts` to include `"lcov"` in `test.coverage.reporter` array (`["text", "json", "html", "lcov", "clover"]`).
- In CI `frontend` job, execute Vitest with JUnit reporter flags (`npm run test:coverage -- --reporter=default --reporter=junit --outputFile.junit=junit.xml`).
- Upload `./coverage/lcov.info` with `flags: frontend`, `report_type: coverage`, and `if: ${{ !cancelled() }}`.
- Upload `./junit.xml` with `flags: frontend`, `report_type: test_results`, and `if: ${{ !cancelled() }}`.

*Alternatives Considered:*
- Uploading `clover.xml` instead of `lcov.info`: Codecov accepts both, but `lcov.info` is standard across JS and Rust tools.

### Decision 2: Backend Coverage and Test Result Generation
- Add `src-tauri/.config/nextest.toml` setting `[profile.default.junit] path = "target/nextest/default/junit.xml"`.
- Install `cargo-nextest` in CI via `taiki-e/install-action@nextest` (alongside existing `taiki-e/install-action@cargo-llvm-cov`).
- Execute `cargo llvm-cov nextest --lib --lcov --output-path lcov.info --fail-under-lines 85 --fail-under-functions 85 --fail-under-regions 85 --ignore-filename-regex "(^|/)(main|lib)\.rs$|/rustlib/"`.
- Upload `./src-tauri/lcov.info` with `flags: backend`, `report_type: coverage`, and `if: ${{ !cancelled() }}`.
- Upload `./src-tauri/target/nextest/default/junit.xml` with `flags: backend`, `report_type: test_results`, and `if: ${{ !cancelled() }}`.

*Alternatives Considered:*
- Running `cargo test` without nextest: Standard `cargo test` does not natively produce JUnit XML format without third-party converters (`cargo2junit`). `cargo-llvm-cov nextest` provides fast parallel execution and built-in JUnit reporting.

### Decision 3: Codecov Action Configuration
- Use `codecov/codecov-action@v5` for both coverage (`report_type: coverage`, default) and test results (`report_type: test_results`). (Note: `codecov/codecov-action@v5` replaces the deprecated standalone `codecov/test-results-action`).
- Provide `token: ${{ secrets.CODECOV_TOKEN }}`.
- Use explicit `flags` (`frontend`, `backend`) to separate TypeScript and Rust metrics on Codecov dashboard.
- Mark upload steps with `if: ${{ !cancelled() }}` so failures in test gates do not prevent uploading test failure analytics to Codecov.

## Risks / Trade-offs

- [Risk] `CODECOV_TOKEN` missing or not configured in repository secrets → [Mitigation] Codecov action handles tokenless uploads for public GitHub repositories as fallback, but specifying `token: ${{ secrets.CODECOV_TOKEN }}` ensures reliable auth for all pushes.
- [Risk] Upload skipped on test failure → [Mitigation] Add `if: ${{ !cancelled() }}` to all Codecov upload steps so test failure reports are always sent to Codecov.
- [Risk] Extra action steps slow down CI build times → [Mitigation] `codecov-action@v5` execution takes ~5-10 seconds per upload, adding negligible overhead.
