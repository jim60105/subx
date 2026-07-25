## 1. Codebase Configuration

- [x] 1.1 Add `"lcov"` reporter to `vite.config.ts` coverage configuration
- [x] 1.2 Add `src-tauri/.config/nextest.toml` configuring JUnit XML output path for nextest

## 2. Continuous Integration Workflow

- [x] 2.1 Update `.github/workflows/ci.yml` `frontend` job to generate JUnit XML and upload frontend coverage & test results to Codecov
- [x] 2.2 Update `.github/workflows/ci.yml` `backend` job to install `cargo-nextest`, execute `cargo llvm-cov nextest`, and upload backend coverage & test results to Codecov

## 3. Verification & Traceability

- [x] 3.1 Update `scripts/ci-config.test.ts` with tests for Codecov coverage and test result steps carrying `@covers` annotations
- [x] 3.2 Run `npm run verify` to confirm all verification gates pass
