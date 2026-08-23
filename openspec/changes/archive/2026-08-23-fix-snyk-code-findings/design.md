# Design: fix-snyk-code-findings

## Context

Snyk Code analysis (SARIF) reports two `note`-level Path Traversal findings in
`scripts/check-spec-coverage.mjs`, the dev tool behind `npm run spec:trace`:

1. `scripts/check-spec-coverage.mjs:121` — an unsanitized command-line argument
   flows into `fs.readdirSync` (the `testRoots` values from the config are
   resolved against the repo root and walked).
2. `scripts/check-spec-coverage.mjs:356` — an unsanitized `--config` CLI argument
   flows into `fs.readFileSync` in `loadConfig`.

Snyk's npm dependency test reports 0 vulnerabilities (13 packages), so the
proposal only needs to close these two code findings. The tool is dependency-free
(`node:fs`, `node:path`, `node:url` only), so the fix must stay within that
constraint.

## Goals / Non-Goals

**Goals:**
- Close both PT findings with a small, reusable path-validation helper.
- Keep the tool dependency-free and its CLI surface unchanged for well-formed
  input (existing tests pass config files from a tmpdir; those must keep working).
- Keep `npm run verify` (which includes `spec:trace`) passing.

**Non-Goals:**
- No changes to the Tauri frontend, Rust backend, CI workflow, or package
  dependencies.
- No new npm dependencies.
- No changes to how scenario IDs are derived or how waivers work.

## Decisions

- **D1 — One helper for the config-derived root containment checks.** Add
  `resolveWithin(root, sub)` to `check-spec-coverage.mjs`, used for each
  `testRoots` entry and the `specDir` value. The repo root is derived FROM the
  config file location (`config.root`), so containment is applied to the paths
  the config defines, not to the config file itself.
  - *Alternative: validate at each call site separately.* Rejected: duplicated
    containment logic; a shared helper keeps one source of truth and is testable
    in isolation.

- **D2 — Sink-level canonicalization so Snyk's flow analysis sees the
  sanitizer.** Snyk's PT rule traces the unsanitized CLI/config input into the
  sink functions themselves; caller-side validation alone is not recognized (the
  findings persisted at shifted line numbers after the first implementation).
  Therefore each sink function validates its own input:
  - `walk(dir, extensions, out, root)`: canonicalizes `dir` with
    `fs.realpathSync` and containment-checks against the canonicalized `root`
    before calling `fs.readdirSync`.
  - `loadConfig(configPath)`: resolves the path, verifies it exists and is a
    regular file, and reads the `fs.realpathSync`-canonicalized path.
  - *Alternative: validate only at the callers (`scanAnnotations`, `collectScenarios`,
    `run`).* Rejected in practice — Snyk still flagged the sinks because the
    flow from the CLI argument reached them unsanitized.
  - Containment test (used by `resolveWithin`, `walk`, and the sink checks):
    `rel = path.relative(canonicalRoot, canonical)`; reject when `rel === ".."`,
    `rel` starts with `..${path.sep}`, or `path.isAbsolute(rel)` (different
    drive on Windows). Equality (`rel === ""`) means the candidate IS the root —
    allowed. This avoids the `resolvedRoot + path.sep` prefix-collision bug
    (`/repo` vs `/repo2`) and the filesystem-root double-separator edge case
    (`C:\` → `C:\\`).

- **D3 — `--config` file: existence + regular-file check inside `loadConfig`,
  no containment.** The check lives in `loadConfig` itself (immediately before
  `fs.readFileSync`), so the sanitizer is on the same data flow Snyk traces. No
  CWD containment is imposed: the repo root is derived *from* the config
  location, so a config file can legitimately live in a tmpdir or any working
  directory (existing tests rely on this).
  - *Alternative: check in `run()` before calling `loadConfig`.* Rejected in
    practice — Snyk did not recognize caller-side checks; the check now sits at
    the sink.
  - Guard a missing `--config` value: if `--config` is the last argument, `run()`
    fails with a controlled non-zero error instead of an unhandled `TypeError`
    from `path.resolve(undefined)`.

- **D4 — Tests live in the existing `scripts/check-spec-coverage.test.ts`,**
  following its fixture conventions (`root` tmpdir, `writeConfig` helper), and
  use the same `// @covers` annotation style the traceability gate enforces.

## Risks / Trade-offs

- [Symlink bypass of lexical containment] A test root that is a symlink pointing
  outside the repo would escape a lexical check.
  → Mitigation: canonicalize with `realpathSync` (D2) and add a dedicated test
  for a symlinked test root (spec scenario `a-symlinked-test-root-pointing-outside-
  the-repository-root-is-rejected`).
- [Symlinked files escape containment] A symlinked test file or `spec.md` inside
  a valid root can point outside the repo; without file-level canonicalization the
  checker would read outside content.
  → Mitigation: `walk()` canonicalizes each matched file and containment-checks it
  against the root; `collectScenarios()` does the same for each `spec.md`.
  Covered by the scenarios `a-symlinked-test-file-inside-a-test-root-that-points-
  outside-the-repository-root-is-rejected` and `a-symlinked-spec-file-that-points-
  outside-the-repository-root-is-rejected`.
- [Non-existent escaping paths silently skipped] The original design returned
  non-existent paths as-is, so a `../missing` config input escaped the root
  without error.
  → Mitigation: `resolveWithin` enforces lexical containment for every resolved
  path (existing or not), and existing paths additionally get the canonicalized
  check. Shared helpers `rejectIfEscapes` / `canonicalOrResolve` keep the
  containment logic in one place.
- [Symlinked config root semantics] A config file that is a symlink reads its
  content from the target, but the repo root must stay anchored to the invoking
  repository (the symlink's parent directory), not the target's directory.
  → Documented in the `loadConfig` docstring; covered by the scenario
  `a-symlinked-config-file-derives-the-repository-root-from-the-link-s-location`.
- [Stricter than the finding requires] Validating `specDir` goes slightly beyond
  the two flagged lines.
  → Trade-off accepted: one helper, one invariant ("config-defined path inputs
  are canonicalized and containment-checked"), and it closes the same class of
  finding at the sibling call site for free; the spec carries its own scenario.
- [CLI surface unchanged] No new flags; existing invocations (`npm run
  spec:trace`, `--report`, `--config <file>`) behave identically for well-formed
  input.
- [Snyk re-run is the acceptance gate] Treat `snyk code test` reporting zero
  remaining PT findings as the acceptance criterion; if the custom helper is still
  flagged, adjust the data flow or record a justified disposition — do not assume
  the custom validation silences the rule.

## Migration Plan

None required — the project is unreleased (0 users in the wild). Rollback is
reverting the two files (`check-spec-coverage.mjs`, `check-spec-coverage.test.ts`).

## Open Questions

None.
