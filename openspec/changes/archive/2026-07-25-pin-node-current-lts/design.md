## Context

The repository currently specifies `node-version: 20` in `.github/workflows/ci.yml` across three jobs (`frontend`, `backend`, and `traceability`), and references `Node 20` in `AGENTS.md`, `README.md`, and `README.zh-TW.md`. Node 20 reached End-of-Life (EOL) in April 2026. The project requirement mandates tracking Node.js "Current LTS" (`lts/*`) rather than pinning a static numeric version like `24`, so CI and developer instructions automatically stay aligned with active LTS releases.

## Goals / Non-Goals

**Goals:**
- Update GitHub Actions workflow (`.github/workflows/ci.yml`) to use `node-version: 'lts/*'` for all `actions/setup-node` steps.
- Update developer and project documentation (`AGENTS.md`, `README.md`, `README.zh-TW.md`) to reflect the Node.js Current LTS (`lts/*`) requirement.
- Add unit assertions in `scripts/ci-config.test.ts` to verify that `ci.yml` specifies `node-version: 'lts/*'`, annotated for spec traceability.
- Update `@types/node` in `package.json` to match Current LTS types.
- Verify that `npm run verify` runs cleanly under the current active LTS environment.

**Non-Goals:**
- Hardcoding static major version numbers (such as `24`) in CI setup configuration.

## Decisions

### D1: Use `node-version: 'lts/*'` in GitHub Actions `setup-node`

`actions/setup-node` natively supports `node-version: 'lts/*'`, which dynamically resolves the latest active Node.js LTS release (currently Node 24). Quotes around `'lts/*'` are enforced in YAML to avoid YAML syntax ambiguity.

*Alternatives Considered:*
- *Fixed `24`*: Would require manual edits when Node 26 becomes LTS. Rejected per explicit project requirement to track "Current LTS".
- *`.nvmrc` with `lts/*`*: Adds a new file to maintain; setting `'lts/*'` directly in `ci.yml` is clearer for GitHub Actions.

### D2: Update Developer Documentation & Type Definitions

Update text in `AGENTS.md` from "Requires Node 20" to "Requires Node Current LTS (lts/*)", and in `README.md` / `README.zh-TW.md` from "Node 20 or higher" to "Node Current LTS (or higher)". Update `@types/node` in `package.json` to match Current LTS.

### D3: Assert Workflow Node Version in `scripts/ci-config.test.ts`

Extend `scripts/ci-config.test.ts` with a test asserting that all `setup-node` steps in `.github/workflows/ci.yml` specify `node-version: 'lts/*'` (or `'lts/*'` string pattern), annotated with `// @covers verification-gates/continuous-integration-runs-every-gate#ci-steps-pin-node-js-to-current-lts`.

## Risks / Trade-offs

- **[Risk]** Dynamic LTS version resolution in CI could catch major Node runtime upgrades automatically.
  - **Mitigation**: Full verification gates (`npm run verify`) run on every push, ensuring any upstream breakage is flagged immediately by CI.
