## Why

The project currently references Node 20 across CI workflows (`.github/workflows/ci.yml`) and project documentation (`AGENTS.md`, `README.md`, `README.zh-TW.md`). Node 20 reached End-of-Life (EOL) in April 2026, and project requirements mandate following the Node.js "Current LTS" release line (`lts/*`) rather than pinning to a specific major version number like Node 24, ensuring CI builds and contributor environments automatically stay aligned with active Node.js LTS releases.

## What Changes

- Update GitHub Actions workflow (`.github/workflows/ci.yml`) to specify `node-version: 'lts/*'` for all `actions/setup-node@v7` steps (`frontend`, `backend`, `traceability` jobs).
- Update developer and project documentation (`AGENTS.md`, `README.md`, `README.zh-TW.md`) to require Node.js Current LTS (or `lts/*`) instead of hardcoded Node 20.
- Update verification gate specifications to explicitly mandate executing CI gates under the Current LTS Node.js runtime.

## Capabilities

### New Capabilities

*(None)*

### Modified Capabilities

- `verification-gates`: Specify that CI verification gates run on the Node.js Current LTS release line (`lts/*`).

## Impact

- **CI Pipeline**: `.github/workflows/ci.yml` updated to use `node-version: 'lts/*'` across all jobs.
- **Documentation**: `AGENTS.md`, `README.md`, `README.zh-TW.md` updated to reference Node.js Current LTS.
- **Compatibility & Migration**: No backward compatibility or migration concerns apply; the project is unreleased and in early development with zero external users.
