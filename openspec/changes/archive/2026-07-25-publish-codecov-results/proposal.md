## Why

Currently, CI runs frontend and backend test suites and coverage gates, but coverage reports and test results are not uploaded or published to Codecov (codecov.io). Uploading frontend and backend coverage reports and JUnit test results to Codecov provides centralized visibility, coverage trend tracking, PR/commit coverage diffs, and test failure analytics across both TypeScript and Rust layers of the Tauri application.

## What Changes

- Modify `.github/workflows/ci.yml` `frontend` job to generate JUnit XML test reports and upload frontend coverage (`coverage/lcov.info` / `clover.xml`) and test results (`junit.xml`) to Codecov using `codecov/codecov-action@v5` with `flags: frontend`.
- Modify `.github/workflows/ci.yml` `backend` job to output LCOV coverage (`lcov.info`) and JUnit XML test results (`junit.xml`), and upload both to Codecov using `codecov/codecov-action@v5` with `flags: backend`.
- Use `token: ${{ secrets.CODECOV_TOKEN }}` for Codecov authentication and distinct flags (`frontend`, `backend`) so Codecov correctly isolates and merges reports from both stacks.

## Capabilities

### New Capabilities

*(None)*

### Modified Capabilities

- `verification-gates`: Update CI pipeline requirements so continuous integration publishes both frontend and backend coverage reports and test results to Codecov.

## Impact

- `.github/workflows/ci.yml`: Adds Codecov action steps to frontend and backend workflow jobs.
- Test script / command execution in CI: Frontend vitest command includes JUnit reporter; backend `cargo cov` command outputs LCOV data and test execution results.
