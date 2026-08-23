# Proposal: fix-snyk-code-findings

## Why

Snyk Code analysis reports two `note`-level Path Traversal (PT) findings in
`scripts/check-spec-coverage.mjs`: an unsanitized command-line argument flows
into `fs.readdirSync` (line 121, via the configured `testRoots`) and into
`fs.readFileSync` (line 356, via the `--config` argument). The spec-coverage
checker is a dev tool, but the checker's config (`scripts/spec-coverage.config.json`)
and its CLI arguments are trusted inputs today — any misconfigured `testRoots`
entry such as `../../etc` lets the tool list or read files outside the repository
root. Snyk's npm dependency test reports zero vulnerabilities across all 13
packages, so no dependency change is required; this change only resolves the two
code findings.

## What Changes

- Add a `resolveWithin(root, sub)` path-validation helper to
  `scripts/check-spec-coverage.mjs` that canonicalizes (via `fs.realpathSync`)
  and containment-checks a user-supplied path against the repository root (the
  directory containing the config file's parent), rejecting paths — including
  symlinks — that resolve outside it.
- Validate the `--config` file inside `loadConfig()` before `fs.readFileSync`:
  the resolved path must exist and be a regular file, and a missing `--config`
  value in `run()` is a controlled error (fixes the line-356 finding).
- Canonicalize and containment-check `dir` inside `walk()` before
  `fs.readdirSync`, with the root passed through from `scanAnnotations()`, so
  an escaping or symlinked test root fails the gate with an explicit error
  (fixes the line-121 finding).
- Validate the `specDir` config value with the `resolveWithin` helper in
  `collectScenarios()`.
- Canonicalize and containment-check each matched test file in `walk()` and
  each `spec.md` in `collectScenarios()`, so symlinked files pointing outside
  the repository root are rejected rather than read.
- Extend `scripts/check-spec-coverage.test.ts` with unit tests for the new
  validation (escaping roots and symlinked roots are rejected, valid paths are
  accepted).
- Re-run `snyk code test` to confirm both PT findings are closed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `verification-gates`: a new requirement — the traceability checker must
  verify the `--config` file is an existing regular file, and must canonicalize
  (symlink-safe) and containment-check every config-defined path input (each
  configured test root and the configured spec directory) against the repository
  root, so that a malformed or hostile path cannot list or read files outside
  the repository.

## Impact

- Code: `scripts/check-spec-coverage.mjs` (new `resolveWithin` helper plus
  sink-level validation in `loadConfig()` and `walk()`),
  `scripts/check-spec-coverage.test.ts` (new tests), and the `.d.mts` type
  declaration for the changed `collectScenarios` signature. No Tauri frontend,
  Rust backend, or CI workflow changes are needed.
- Behavior: unchanged for well-formed input; a config whose `testRoots` or
  `specDir` escape the repo root now fails the `spec:trace` gate with an
  explicit error instead of silently walking outside the repository.
- Verification: `snyk code test` must report zero remaining PT findings;
  `npm run verify` (which includes `npm run spec:trace`) must still pass.
- Since the project is unreleased (0 users in the wild), no backward
  compatibility or migration concerns apply.
