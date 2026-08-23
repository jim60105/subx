## 1. Path validation helper

- [x] 1.1 Add a `resolveWithin(root, sub)` helper to `scripts/check-spec-coverage.mjs`: resolve `sub` against `root`; for existing paths, canonicalize root and candidate with `fs.realpathSync`, then reject when `path.relative(canonicalRoot, canonical)` is `".."`, starts with `..${path.sep}`, or is absolute (different drive)

## 2. Validation at the flagged sinks

- [x] 2.1 In `run()`, guard a `--config` argument with no value (controlled non-zero error instead of an unhandled `TypeError` from `path.resolve(undefined)`)
- [x] 2.2 In `loadConfig()`, before `fs.readFileSync`, verify the resolved path exists and `fs.statSync` reports a regular file, and read the `fs.realpathSync`-canonicalized path (no CWD containment — the repo root is derived from the config location)
- [x] 2.3 In `walk()`, canonicalize `dir` with `fs.realpathSync` and containment-check it against the passed `root` before `fs.readdirSync`; `scanAnnotations()` passes the root through
- [x] 2.4 Validate the `specDir` config value with `resolveWithin(config.root, specDir)` in `collectScenarios()` for consistent containment of all config-defined path inputs

## 3. Tests with traceability annotations

- [x] 3.1 Add a test with `// @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-non-file-or-missing-config-path-is-rejected`: `--config` pointing at a directory or a missing path exits 1 without reading
- [x] 3.2 Add a test with `// @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-valid-config-path-is-accepted`: an existing regular-file config loads and the run continues
- [x] 3.3 Add a test with `// @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-test-root-that-escapes-the-repository-root-is-rejected`: a config with an escaping `testRoots` entry makes the checker exit 1 naming the offending root
- [x] 3.4 Add a test with `// @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-test-root-inside-the-repository-root-is-accepted`: a normal in-root test root is walked as before
- [x] 3.5 Add a test with `// @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-symlinked-test-root-pointing-outside-the-repository-root-is-rejected`: a symlinked test root that points outside the repo root is rejected after canonicalization
- [x] 3.6 Add a test with `// @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-spec-directory-that-escapes-the-repository-root-is-rejected`: an escaping `specDir` fails the check naming the path
- [x] 3.7 Keep new test code inside the 85% frontend coverage floor (no new exclusions)

## 5. Review follow-ups (rubber-duck findings)

- [x] 5.1 Enforce lexical containment in `resolveWithin` for every resolved path, existing or not (non-existent `../x` inputs are rejected, not skipped)
- [x] 5.2 Canonicalize and containment-check each matched file in `walk()` (symlinked test files pointing outside the root are rejected)
- [x] 5.3 Canonicalize and containment-check each `spec.md` in `collectScenarios()`
- [x] 5.4 Consolidate the duplicated containment logic into shared `rejectIfEscapes` and `canonicalOrResolve` helpers
- [x] 5.5 Add the new spec scenarios (symlinked test file, symlinked spec file, symlinked config root semantics) and their annotated tests
- [x] 5.6 Re-run `snyk code test` (0 results) and `npm run verify` (all gates pass)

## 4. Spec sync and verification

- [x] 4.1 During implementation, sync the delta spec requirement into `openspec/specs/verification-gates/spec.md` so `npm run spec:trace` sees the new scenarios and their annotations
- [x] 4.2 Re-run `snyk code test` and confirm both Path Traversal findings are closed (0 remaining PT issues); if the custom validation is still flagged, adjust the data flow or record a justified disposition
- [x] 4.3 Run `npm run verify` (tsc, frontend coverage, Rust coverage, spec:trace, bindings:check, icons:check) and confirm all gates pass
- [x] 4.4 Archive the change: `openspec archive --skip-specs`
