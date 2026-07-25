## 1. CI Workflow and Documentation Update

- [x] 1.1 Update `.github/workflows/ci.yml` to specify `node-version: 'lts/*'` across all `actions/setup-node` job steps (`frontend`, `backend`, `traceability`).
- [x] 1.2 Update developer requirements in `AGENTS.md`, `README.md`, and `README.zh-TW.md` to require Node.js Current LTS (`lts/*`) instead of Node 20.
- [x] 1.3 Update `@types/node` in `package.json` to match Current LTS.

## 2. Traceability and Verification

- [x] 2.1 Add a unit test in `scripts/ci-config.test.ts` asserting that all `setup-node` steps in `ci.yml` set `node-version: 'lts/*'`, annotated with `// @covers verification-gates/continuous-integration-runs-every-gate#ci-steps-pin-node-js-to-current-lts`.
- [x] 2.2 Run full verification suite (`npm run verify`) to confirm all gates pass.
