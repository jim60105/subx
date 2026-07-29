## 1. Single-source the version

- [x] 1.1 Replace `"version": "0.1.0"` in `src-tauri/tauri.conf.json` with `"version": "../package.json"` (D2).
- [x] 1.2 Add `scripts/version-consistency.test.ts` asserting `package.json`, `src-tauri/Cargo.toml` and the `subx` entry in `src-tauri/Cargo.lock` all declare the same version, failing with both values named. Annotate with `// @covers release-pipeline/the-released-version-is-declared-once#disagreeing-version-declarations-fail-the-test-suite`.
- [x] 1.3 In the same file, assert the bundle configuration's version field is the `package.json` indirection rather than a literal. Annotate with `// @covers release-pipeline/the-released-version-is-declared-once#the-bundle-version-comes-from-the-authoritative-declaration`.
- [x] 1.4 Confirm `npm run tauri build --help`-level sanity: run `npx tauri build --no-bundle` (or a `tauri dev` start) once locally so the version indirection is proven to resolve before CI depends on it.

## 2. Bundle identity metadata

- [x] 2.1 Add `publisher`, `homepage`, `category`, `copyright`, `shortDescription`, `longDescription` and `licenseFile` (pointing at the repository's GPL text) to the `bundle` block of `src-tauri/tauri.conf.json` (D9).
- [x] 2.2 Add the assertions to `scripts/version-consistency.test.ts` (or a sibling `scripts/bundle-metadata.test.ts`, whichever keeps each file coherent) with `// @covers release-pipeline/published-packages-identify-themselves#the-bundle-declares-complete-identity-metadata` and `// @covers release-pipeline/published-packages-identify-themselves#the-installers-can-present-the-license`; the license assertion must check the named file actually exists.

## 3. Changelog and release notes

- [x] 3.1 Add `CHANGELOG.md` in Keep a Changelog form, with an `## [Unreleased]` section and a section for the version currently declared in `package.json`.
- [x] 3.2 Add `.github/release-notes-footer.md` carrying the installation caveats: the glibc 2.39 floor and the distributions it implies, the macOS `xattr -dr com.apple.quarantine` step, the Windows SmartScreen "More info → Run anyway" path, and the `gh attestation verify <file> --repo jim60105/subx` command (D8).
- [x] 3.3 Add `scripts/release-notes.mjs`: takes a version, prints that version's `CHANGELOG.md` section followed by the footer file, exits non-zero naming the version when the section is absent. Add `scripts/release-notes.d.mts` beside it, matching the `check-spec-coverage.d.mts` pattern so `tsc --noEmit` can type the test's import.
- [x] 3.4 Add `scripts/release-notes.test.ts` driving the real script over fixture changelogs. Annotate `// @covers release-pipeline/release-notes-are-written-by-a-maintainer-not-generated-from-commits#the-notes-are-the-changelog-section-for-the-version` (including that a neighbouring version's entries do not leak in), `// @covers release-pipeline/release-notes-are-written-by-a-maintainer-not-generated-from-commits#a-version-with-no-changelog-section-aborts-the-release`, and `// @covers release-pipeline/distribution-is-unsigned-and-every-release-says-so#the-release-body-carries-the-installation-caveats`.
- [x] 3.5 Add `scripts/check-release-tag.mjs` (+ `.d.mts`): takes a tag name, reads the version from `package.json`, exits non-zero naming both values unless the tag is exactly `v` + that version. Kept out of the workflow's inline shell because the dispatch mode never runs `prepare`, so inline shell would first execute during a real release (D3).
- [x] 3.6 Add `scripts/check-release-tag.test.ts` driving the real script over matching, mismatched, and malformed tags. Annotate `// @covers release-pipeline/the-released-version-is-declared-once#a-tag-that-disagrees-with-the-declared-version-aborts-the-release`.
- [x] 3.7 Confirm both new `.mjs` files clear the 85 % frontend coverage floor — they are inside `coverage.include` (`scripts/**/*.mjs`). Close gaps with tests, not exclusions.

## 4. The release workflow

- [x] 4.1 Create `.github/workflows/release.yml` with `on: push: tags: ['v*']` and `workflow_dispatch`, top-level `permissions: {}`, and `concurrency` keyed on the ref without cancelling in-progress runs (D1, D7).
- [x] 4.2 Add the `prepare` job (`contents: write`), gated on **`github.event_name == 'push'`** — not on a `refs/tags/` ref prefix, which the "Run workflow" button can also satisfy and would turn a dry run into a real release write (D1). Steps: `node scripts/check-release-tag.mjs "${{ github.ref_name }}"`; render the notes with `node scripts/release-notes.mjs`; create or reuse the draft release via `gh api`, emitting its numeric id and the version as job outputs (D2, D3, D6).
- [x] 4.3 Add the `build` matrix job with `needs: prepare` and `if: always() && (needs.prepare.result == 'success' || needs.prepare.result == 'skipped')` — a skipped dependency blocks a dependent job exactly like a failed one, so this is what lets the dispatch path through while still stopping the matrix on a real `prepare` failure. Matrix: `macos-15` × `aarch64-apple-darwin` and `x86_64-apple-darwin`, `ubuntu-24.04`, `ubuntu-24.04-arm`, `windows-2025`; `fail-fast: false`; permissions `contents: write`, `id-token: write`, `attestations: write` (D4, D7).
- [x] 4.4 In the build job: `actions/checkout@v7`, `actions/setup-node@v7` with `node-version: 'lts/*'` and npm cache, `dtolnay/rust-toolchain@stable` with the macOS targets, the Linux apt prerequisites (the set `ci.yml` already installs, plus `file`, `xdg-utils`, `libxdo-dev` for bundling), `APPIMAGE_EXTRACT_AND_RUN=1` on the Linux jobs so the AppImage bundler does not need FUSE, and `npm ci`. Deliberately **no** `Swatinem/rust-cache` — record why in a comment (D5).
- [x] 4.5 Add the `tauri-apps/tauri-action@v1` step with `releaseId` from `prepare` on the tag path, `uploadWorkflowArtifacts: true` and no release inputs on the dispatch path, `uploadUpdaterJson: false`, `releaseDraft: true`, `retryAttempts: 3` (five jobs upload into one release concurrently), and `args` carrying the per-matrix `--target`.
- [x] 4.6 Add a step that filters the action's `artifactPaths` output to regular files, then `actions/attest-build-provenance@v3` over that list (D7). Give this and every other shared `run:` step an explicit `shell: bash` — `windows-2025` defaults to `pwsh`.
- [x] 4.7 Write the file with the same comment density as `ci.yml`: the header comment should explain the draft-then-publish contract and why the gates are not re-run here.

## 5. Workflow traceability tests

- [x] 5.1 Add `scripts/release-config.test.ts` reading `.github/workflows/release.yml`, in the shape of `scripts/ci-config.test.ts` (D10).
- [x] 5.2 Annotate the trigger assertions: `#a-version-tag-starts-the-release`, `#a-branch-push-does-not-start-a-release` (the `push` trigger is tag-filtered, with no `branches`), `#a-manual-dispatch-builds-every-target-and-publishes-nothing` — all under `release-pipeline/releases-are-cut-from-version-tags-and-from-nothing-else`. The dispatch assertion must check that `prepare` is gated on `github.event_name`, and that no `refs/tags/` ref test is used for that gate.
- [x] 5.3 Assert the workflow wiring the extracted preflight depends on: `prepare` invokes `scripts/check-release-tag.mjs`, and `build` needs `prepare` with the `success`-or-`skipped` condition. No `@covers` annotation here — the scenario itself is covered by task 3.6's behaviour test, and a second annotation on a regex would only restate it.
- [x] 5.4 Annotate the matrix assertions under `release-pipeline/every-supported-desktop-target-is-built-from-a-pinned-environment`: `#the-matrix-covers-every-supported-target`, `#build-environments-are-pinned-not-floating` (no `-latest` label anywhere in the file), `#one-target-s-failure-does-not-abandon-the-others` (`fail-fast: false`).
- [x] 5.5 Annotate the release-assembly assertions under `release-pipeline/a-release-is-assembled-privately-and-published-by-a-person`: `#the-draft-is-created-once-before-any-build`, `#build-jobs-upload-into-the-prepared-release` (build passes `releaseId`, sets no `tagName`/`releaseName`), `#the-workflow-never-publishes` (`draft=true` on creation, and no step flipping it), `#a-re-run-reuses-the-existing-release`.
- [x] 5.6 Annotate the provenance and permission assertions under `release-pipeline/every-published-file-carries-verifiable-build-provenance`: `#each-build-job-attests-the-files-it-produced`, `#only-regular-files-are-submitted-as-subjects`, `#permissions-are-granted-per-job-not-workflow-wide` (empty top-level `permissions`).
- [x] 5.7 Annotate the unsigned-distribution assertions under `release-pipeline/distribution-is-unsigned-and-every-release-says-so`: `#the-workflow-needs-no-signing-secrets` (the only `secrets.` reference is `GITHUB_TOKEN`, and none of the Tauri signing env vars appear), `#no-update-endpoint-is-published` (`uploadUpdaterJson: false`).


## 6. Waiver and documentation

- [x] 6.1 Add the waiver for `release-pipeline/every-supported-desktop-target-is-built-from-a-pinned-environment#the-published-bundle-installs-and-launches-on-each-platform` to `scripts/spec-coverage.config.json`, with a reason (no macOS or Windows runner is available to the test suite, and installing a package is not something a headless Linux test run can assert) and a `manualVerification` anchor.
- [x] 6.2 Add that manual procedure to `docs/verification.md` — per-platform install, launch, and a version check against the tag; a visual check of the Windows installer's license page (WiX has historically wanted RTF, and the repository's `LICENSE` is plain text); the maintainer's publish checklist (wait for `ci.yml` green on the tag SHA, confirm all five asset sets are present, then publish); and what to do about a bad release *after* publishing — edit to warn, or yank and ship a patch version, never silently replace assets under a tag someone may already hold.
- [x] 6.3 Add a `## Download` section to `README.md` and `README.zh-TW.md` linking the releases page, listing which artifact suits which platform, and stating the glibc floor and the unsigned-install caveats.

## 7. Sync, verify, dry run

- [x] 7.1 Sync `openspec/changes/add-release-workflow/specs/release-pipeline/spec.md` into `openspec/specs/release-pipeline/spec.md`, writing the `## Purpose` paragraph that the delta does not carry.
- [x] 7.2 Run `npm run spec:trace -- --report` and confirm all 24 new scenarios report as verified or waived, with no stale annotation.
- [x] 7.3 Run `npm run verify` and confirm every gate passes.
- [ ] 7.4 Push, then trigger the workflow via `workflow_dispatch` and confirm all five targets build and upload workflow artifacts. This is the first time the Windows and macOS paths have ever run — treat a failure here as expected work, not as a surprise (design Risks).
- [ ] 7.5 Perform the manual install smoke test from `docs/verification.md` against the dry-run artifacts, on whichever platforms are available.
- [ ] 7.6 Only then: write the `CHANGELOG.md` entry, bump `package.json` and `src-tauri/Cargo.toml` (and the lock file), commit, tag, push the tag, wait for `ci.yml` green on that SHA, review the draft, publish. If `prepare` misbehaves on this first real run — it is the one job the dry run cannot exercise — delete the draft and `git push --delete origin v<version>`, fix, and push the tag again; nothing is public until the publish.
