## Context

Everything the repository automates today is *defensive*: `npm run verify` and `.github/workflows/ci.yml` prove the code is correct. Nothing is *productive* — no step turns a correct commit into an artifact a user can install. There has never been a git tag, a GitHub release, or a `.deb`/`.dmg`/`.msi` produced by this project, on any machine.

Three facts shape the design:

1. **The non-Linux build paths are unproven.** All development and all CI happen on Linux. `subx-cli` (the load-bearing dependency) is cross-platform by construction — `reqwest`/rustls rather than OpenSSL, `winapi` behind `cfg(windows)` — but "compiles on Windows" is a hypothesis until a runner proves it. The design must let the matrix be exercised *before* a version number is spent on it.
2. **There is no pull-request flow.** `ci.yml` triggers on `on: push` with no filters, which in GitHub Actions means every branch *and every tag*. So pushing `v0.2.0` already re-runs every gate against exactly the commit being released; the release workflow does not need to duplicate them. What it needs is for a human to look at that result before anything becomes public.
3. **The version number is currently written in three places** — `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` — all reading `0.1.0` by luck rather than by construction. `Cargo.toml`'s value is user-visible: `commands/system.rs` returns `env!("CARGO_PKG_VERSION")` as `app_version`. A release that ships a bundle labelled one version and an app reporting another is a defect that only a first release can introduce, so it is worth closing before the first release.

There are no signing identities: no Apple Developer account, no Windows Authenticode certificate. That is a constraint, not a decision to be made here.

## Goals / Non-Goals

**Goals:**

- A tag push produces installable bundles for macOS (arm64, x86_64), Linux (x86_64, arm64) and Windows (x86_64), attached to a GitHub release.
- Exactly one declaration of the released version, mechanically enforced everywhere else it appears.
- A release that is assembled privately and made public by a deliberate human act.
- Release notes that a maintainer wrote, not a commit-log dump.
- Verifiable provenance for every published file.
- A dry-run mode that builds the whole matrix and publishes nothing.
- No secret beyond the automatic `GITHUB_TOKEN`.

**Non-Goals:**

- **Code signing and notarization.** Requires paid identities that do not exist. The design must not pretend otherwise; it must instead make the consequence visible to users.
- **In-app updates.** `tauri-plugin-updater` is not installed, and enabling it means owning a signing keypair and a `latest.json` contract. The workflow explicitly disables tauri-action's updater JSON so a future decision stays a decision.
- **Third-party distribution channels** — Flathub, winget, Homebrew, AUR, the Microsoft Store.
- **Mobile targets.**
- **Reproducible builds** in the bit-for-bit sense. `--locked` and a pinned toolchain version are deliberately not adopted; provenance attestation, not byte-identity, is what this design offers as the integrity story.
- **Releasing from a branch push.** Only a tag, or an explicit manual dispatch.
- **Re-running the verification gates inside the release workflow.** See Context (2) and D3.

## Decisions

### D1: A version tag triggers the release; a manual dispatch builds without releasing

`on: push: tags: ['v*']` plus `workflow_dispatch`. On a tag, the workflow assembles a release. On a dispatch it builds every target, uploads the bundles as *workflow* artifacts (`uploadWorkflowArtifacts: true`), and creates nothing public.

The two modes are told apart by **`github.event_name == 'push'`, never by the ref**. GitHub's "Run workflow" button accepts any ref that carries the workflow file, including an existing release tag — which a maintainer would plausibly pick when re-running after one platform failed. A ref-shaped guard (`startsWith(github.ref, 'refs/tags/v')`) would then let a run the maintainer believes is a dry run create and populate a real release. Since the `push` trigger is already filtered to `v*`, every push event reaching this workflow *is* a version tag, so the event name alone is both sufficient and unambiguous.

The tag is the durable identity of a release; a branch is not. And the dispatch mode is not a nicety here — it is how the Windows and macOS matrix entries get their first exercise without burning `v0.2.0` on a `cargo` error.

*Alternatives considered:* Tauri's own documentation triggers on pushes to a `release` branch. That decouples "released" from any immutable ref and would leave this repository's history with no marker of what shipped. Rejected. Triggering on `release: published` was also considered — it inverts the flow (human creates the release, CI fills it) but leaves the release visible and empty for the ~20 minutes the matrix takes, which is worse than a draft.

### D2: `package.json` is the single source of truth for the released version

`src-tauri/tauri.conf.json` sets `"version": "../package.json"` — a documented Tauri v2 form ("a semver version number **or a path to a `package.json` file** containing the `version` field"), resolved relative to the Tauri directory. `tauri-action` resolves it identically: its `getInfo()` branches on `config.version?.endsWith('.json')` and reads the file, so the asset names it predicts and the bundle the CLI writes agree.

`Cargo.toml` still needs its own `version` (it is a crate manifest, and it is what `app_version` reports over IPC), so it cannot be eliminated — but it can be *held*. A new Vitest file asserts `package.json`, `src-tauri/Cargo.toml`, and the `subx` entry in `src-tauri/Cargo.lock` all carry the same string. It runs inside the existing frontend test gate, so `npm run verify` and CI both catch drift at the moment it is committed, not at release time.

The release workflow then re-checks one thing the test cannot know: that the tag matches. `${{ github.ref_name }}` must equal `v<package.json version>`, checked in the `prepare` job before anything is built.

*Alternatives considered:* Deleting `version` from `tauri.conf.json` entirely makes it fall back to `Cargo.toml`, which is equally single-sourced but puts the authoritative number in the file a human is least likely to bump. Making the workflow *rewrite* the version files from the tag was rejected outright: a release must be reproducible from the tagged tree, and a workflow that edits the tree before building breaks that.

### D3: One `prepare` job creates a draft release; matrix jobs upload into it by ID; a human publishes

Job graph: `prepare` → `build` (matrix of 5) → *human*.

`prepare` validates the tag against the version, renders the notes, and creates a **draft** release via `gh api`, emitting its numeric ID. Each `build` job passes that ID to `tauri-action` as `releaseId`.

Two problems this solves. First, if the five matrix jobs each carried `tagName`/`releaseName`, they would race to create the same release; creating it once, upstream, removes the race by construction. Second, and more important: a draft is invisible to everyone but maintainers, and `ci.yml` is running the full gate suite against the same SHA concurrently. The maintainer publishes the draft only after that run is green. This is the same philosophy `docs/verification.md` already states — CI reports after the fact, so a human is the gate — applied to the one artifact where "after the fact" would mean "after users downloaded it".

`prepare` reuses an existing release when one already exists for the tag, so re-running the workflow after a single platform failed does not create a second draft.

`build` needs `prepare`, but `prepare` does not run on a dispatch, and a *skipped* dependency blocks a dependent job exactly as a failed one does under Actions' implicit `success()`. So `build` carries `if: always() && (needs.prepare.result == 'success' || needs.prepare.result == 'skipped')` — which lets the dry run through while still stopping the matrix when `prepare` genuinely fails.

**`prepare`'s logic must not be shell that nothing ever runs.** The tag-versus-version comparison lives in `scripts/check-release-tag.mjs` with its own fixture-driven tests, not in an inline `[ "$A" = "$B" ]` that a regex in `release-config.test.ts` merely confirms is present. That matters because the dry-run mode of D1 — the thing that de-risks everything else — skips `prepare` entirely, so without extraction the whole preparation path would first execute during a real release. What remains unexercised until then is the `gh api` create-or-reuse call. That residual risk is small and cheap, because the release it creates is a draft: if the first tag push goes wrong, `git push --delete origin v<version>` plus deleting the draft restores the world exactly, and the tag can be pushed again. Nothing is public, so nothing is spent.

*Alternatives considered:* Blocking the release on `ci.yml` via `workflow_run` was considered and rejected: `workflow_run` only fires for the default branch, does not compose with tag triggers, and would trade a clear human checkpoint for a fragile machine one. A throwaway rehearsal tag was also considered and rejected — it would have to disagree with `package.json`'s version to be throwaway, which is precisely what `prepare` is built to reject.

### D4: Pinned runner images, and `ubuntu-24.04` over `ubuntu-22.04`

Matrix: `macos-15` × {`aarch64-apple-darwin`, `x86_64-apple-darwin`}, `ubuntu-24.04`, `ubuntu-24.04-arm`, `windows-2025`. `fail-fast: false`, so one platform's failure still yields the other four for diagnosis.

Explicit labels, never `-latest`: the build machine's glibc and SDK versions *are* the compatibility floor of the artifact, so a floating label would silently move a user-visible contract. `ci.yml` may keep `ubuntu-latest` — it produces nothing anyone installs.

The Linux choice is a genuine trade-off. Tauri's guidance is to build on the oldest distribution you intend to support, which argues for `ubuntu-22.04` (glibc 2.35). Against that: GitHub begins deprecating `ubuntu-22.04` on 2026-09-17 — roughly seven weeks from now — after which the image stops receiving updates and queue times degrade, with brownout outages in March–April 2027 and full removal on 2027-04-17. Nothing breaks in September; what happens in September is that this pipeline's foundation enters end-of-life and acquires a hard expiry inside its first year. Adopting that, to widen compatibility for a project with zero users, is the wrong trade. `ubuntu-24.04` sets the floor at glibc 2.39 — Ubuntu 24.04+, Debian 13+, Fedora 40+ — which is stated in the release notes and the README rather than discovered by a user.

The AppImage bundler needs FUSE, which no GitHub Ubuntu image has preinstalled, so the Linux jobs set `APPIMAGE_EXTRACT_AND_RUN=1` rather than installing `libfuse2t64`. The env var is immune to the package renames that keep happening across Ubuntu releases, and it works identically on the arm64 image.

macOS x86_64 is cross-compiled from the arm64 runner (`--target x86_64-apple-darwin`) rather than built on `macos-15-intel`; that is Tauri's documented approach and it halves the number of runner images this workflow depends on.

Windows changes the default shell: `run:` steps there are `pwsh`, not `bash`. Every shell step shared across the matrix therefore declares `shell: bash` explicitly (Git Bash ships on the Windows image), so one script does not have to be written twice.

*Alternatives considered:* Building Linux inside a Debian 12 container on a supported runner would decouple the glibc floor from the runner label permanently. It is the correct answer if older-distro support ever becomes a real requirement, and it is written down here as the escape hatch — but it costs a container image with Node and Rust, plus `APPIMAGE_EXTRACT_AND_RUN` workarounds for linuxdeploy under a container, for a compatibility range nobody has asked for.

### D5: No Rust build cache in the release workflow

`ci.yml` uses `Swatinem/rust-cache` and runs on every push; that cache is what keeps the routine feedback loop fast, and it is the one that matters. A repository shares a 10 GB Actions cache budget with least-recently-used eviction. Five release-profile caches across five platforms would be large, would be written a handful of times a year, and would evict the cache that gets read daily.

Releases are rare and nobody is waiting on them, so they pay for a cold build. Stated here so that a future "why is the release build so slow?" finds an answer rather than a bug.

### D6: Release notes come from `CHANGELOG.md`, and a missing section aborts before any build

New `CHANGELOG.md` in Keep a Changelog form. New `scripts/release-notes.mjs <version>` prints the section for that version, followed by the contents of `.github/release-notes-footer.md`, and exits non-zero if the version has no section. `prepare` runs it and uses the output as the release body.

Three things fall out of the ordering. A release with no changelog entry fails in the first job, in seconds, rather than after twenty minutes of matrix build. The notes are prose a maintainer wrote — GitHub's `generateReleaseNotes` derives its output from merged pull requests, and this repository has none, so it would produce an empty list under a "Full Changelog" link. And the notes are reviewable *before* the release exists: in a repository with no pull requests, a checked-in `CHANGELOG.md` is the only place release prose can be read in a diff rather than typed into a web form at publish time.

The alternative — let the maintainer write the body directly into the draft in the GitHub UI, since D3 already puts them in front of it — was considered. It is genuinely less machinery. It was rejected because it moves the one part of a release that is pure prose out of version control, and because "the changelog is missing" would then be discovered after the build rather than before it.

The script is a `scripts/*.mjs` with a `.d.mts` beside it and a `.test.ts` against it, matching `check-spec-coverage.mjs` exactly; it is inside the frontend coverage scope, so it carries the same 85 % floor as everything else.

### D7: Every published file gets a build-provenance attestation

Each `build` job runs `actions/attest-build-provenance@v3` over the bundles it produced, so `gh attestation verify <file> --repo jim60105/subx` tells a user the file came from this workflow, on this commit, and not from someone's laptop. That is a stronger claim than a `SHA256SUMS` file next to the downloads — which anyone who can edit the release can rewrite — so checksums are not published.

The subject list is derived from `tauri-action`'s `artifactPaths` output, filtered to regular files: the macOS list includes `SubX.app`, a *directory*, which the attestation action cannot digest. Filtering by `-f` also keeps this target-path-agnostic, which matters because `--target` moves the bundle directory (`target/aarch64-apple-darwin/release/bundle/...`).

Attestations key on content digest, so `tauri-action` renaming an asset on upload does not break verification.

Five jobs upload concurrently into one release, which is exactly the contention `tauri-action`'s `retryAttempts` exists for; it is set to 3 rather than left at its default of 0, so a transient GitHub API conflict costs a retry rather than a manual re-run of a twenty-minute build.

Permissions are per-job and minimal: the workflow declares `permissions: {}` at top level, `contents: write` on `prepare`, and `contents: write` + `id-token: write` + `attestations: write` on `build`.

### D8: Distribution is unsigned, and every release says so

There are no signing identities, so macOS users meet Gatekeeper ("SubX is damaged and can't be opened" for a quarantined unsigned app) and Windows users meet SmartScreen. Shipping that unexplained is how an open-source project collects "is this malware?" issues.

`.github/release-notes-footer.md` is appended to every release body and carries: the glibc floor for Linux, the `xattr -dr com.apple.quarantine /Applications/SubX.app` incantation for macOS, the "More info → Run anyway" path for SmartScreen, and the `gh attestation verify` command from D7 as the thing users can check *instead* of a signature. Keeping it in a file rather than inside the workflow YAML means correcting the wording is a documentation edit.

The workflow references no secret other than `GITHUB_TOKEN`; a test asserts that, so signing cannot be half-added later without the spec changing.

### D9: Bundle identity metadata is filled in

`tauri.conf.json`'s `bundle` block currently declares only `active`, `targets` and `icon`. The `.deb`, `.rpm`, NSIS and WiX packages built from it would carry bundler defaults for everything else. Since this change is what first makes those packages exist, it also sets `publisher`, `homepage`, `category`, `copyright`, `shortDescription`, `longDescription`, and `licenseFile` (pointing at the GPL text, which the Windows installers display).

This is metadata, not behaviour, so it is verified the way the rest of the configuration in this repository is: by a test that reads the file.

### D10: The new scenarios are verified the way `verification-gates` verifies CI — with one honest waiver

Three kinds of scenario, three treatments:

- **Behaviour** — `release-notes.mjs`, `check-release-tag.mjs`, and the version-consistency invariant are real code and real files. Ordinary tests, driving the real thing. Every piece of release *logic* belongs in this tier; that is why D3 extracts the tag comparison out of the workflow instead of leaving it as shell.
- **Configuration** — the trigger, the matrix, the pinned runners, the permissions, the draft flag, the absence of signing secrets. Asserted statically against `.github/workflows/release.yml`, exactly as `scripts/ci-config.test.ts` asserts `ci.yml`. This inherits that file's admitted weakness — it proves the pipeline is *armed*, not that it *works*. The compensating controls are the dry-run dispatch of D1 for the whole `build` matrix, and, for the `prepare` job the dry run skips, the fact that its only untested step produces a discardable draft (D3).
- **Cross-platform installation** — that the `.dmg` mounts, the `.deb` installs, and the `.msi` runs cannot be asserted from a Linux test run. One waiver in `scripts/spec-coverage.config.json`, pointing at a manual per-platform smoke-test procedure added to `docs/verification.md`. One waiver, not five: the scenario is written once, covering the set.

## Risks / Trade-offs

- **[Risk] The Windows and macOS builds have never run and may simply fail** — `subx-cli` pulls in `symphonia`, `rubato`, `unrar`, `zip`, and a `winapi` path nobody here has compiled. → *Mitigation:* D1's `workflow_dispatch` mode exists precisely for this; the implementation tasks require a green dry run on all five targets **before** the first tag is pushed. If a platform proves unbuildable, dropping its matrix entry is a one-line change and the spec's target list is what has to be amended — deliberately, not silently.
- **[Risk] glibc 2.39 floor excludes users on Ubuntu 22.04, Debian 12, RHEL 9** — → *Mitigation:* stated in the release notes footer and the README rather than left to be discovered; D4 records the container-based escape hatch if it becomes a real complaint. Source builds remain available and are already documented.
- **[Risk] Unsigned macOS bundles read as "damaged" to a user who has never seen quarantine before** — → *Mitigation:* D8's footer. There is no technical fix without a paid identity.
- **[Risk] `tauri-action@v1.0.0` is roughly a month old and dropped several v0 inputs** — → *Mitigation:* the workflow uses only inputs read from the current `action.yml` (`releaseId`, `releaseDraft`, `args`, `uploadUpdaterJson`, `uploadWorkflowArtifacts`), and is pinned to the `v1` major so a v2 cannot arrive unannounced.
- **[Risk] A failed matrix job leaves a draft release with a partial asset set** — → *Mitigation:* it is a draft, which is the point; `prepare` reuses the existing release on re-run, and `tauri-action` replaces same-named assets. A maintainer who publishes a half-filled draft is the residual risk, addressed by the manual checklist in `docs/verification.md`.
- **[Risk] A cold Rust build on five platforms is slow (~20–30 min wall clock)** — → *Accepted*, per D5. Nothing blocks on it.
- **[Trade-off] The configuration scenarios are asserted by reading YAML, so a workflow that is syntactically armed but semantically broken passes them.** This is the same trade `verification-gates` already made and documented; the dry run is the compensating control.
- **[Risk] `ubuntu-24.04-arm` AppImage bundling is less travelled than x86_64** — → *Mitigation:* `fail-fast: false` means an arm64 failure still yields four usable platforms, and the dry run surfaces it before a tag exists.
- **[Risk] Shell steps written for bash silently become PowerShell on `windows-2025`** — the artifact-filtering step of D7 is shared across the matrix and is the one most likely to be bitten. → *Mitigation:* `shell: bash` on every shared `run:` step, asserted by `release-config.test.ts` rather than left to reviewer attention.
- **[Risk] The AppImage bundler fails for want of FUSE, which no GitHub Ubuntu image preinstalls** — → *Mitigation:* `APPIMAGE_EXTRACT_AND_RUN=1` on the Linux jobs, per D4.
- **[Risk] WiX has historically wanted RTF for the installer license page, and the repository's `LICENSE` is plain text** — → *Mitigation:* the Windows dry run includes a visual check of the installer's license page; if it renders badly, the fix is an RTF copy of the license referenced from `bundle.windows.wix.licenseFile`, not a change to this design. Nothing automated catches this, so it is an explicit item in the manual procedure.
- **[Risk] `prepare`'s `gh api` create-or-reuse path is not exercised by the dry run** — → *Mitigation:* the part with real logic is extracted and unit-tested (D3); what remains produces only a draft, and a bad first tag is undone by deleting the tag and the draft.

## Migration Plan

Nothing to migrate — there are no existing releases, tags, or users. The ordering that matters is the first release:

1. Land the workflow, the changelog, the version indirection and the tests. `npm run verify` green.
2. Push to `master`; `ci.yml` proves the gates still pass.
3. Run the workflow manually (`workflow_dispatch`) and confirm all five targets build and upload workflow artifacts. Fix or drop targets as needed.
4. Perform the manual install smoke test from `docs/verification.md` on the dry-run artifacts.
5. Write the `CHANGELOG.md` entry for the version, bump `package.json` and `Cargo.toml`, commit, tag `v<version>`, push the tag.
6. Wait for `ci.yml` green on the tag SHA, review the draft, publish.

Rollback before publishing: delete the draft, and `git push --delete origin v<version>` if the tag itself was wrong. No user-visible state exists until step 6's publish, so the same tag can be pushed again once fixed — which is what makes step 5 safe to attempt even though `prepare`'s `gh api` path has not run before.

Rollback *after* publishing is a different act and is documented as such in `docs/verification.md`: a published release has been indexed and possibly downloaded, so the remedy is to edit the release to warn, or to yank it and ship a patch version — never to silently replace assets under a tag someone may already hold.

## Open Questions

- **Which version does the first release carry?** `0.1.0` is what the tree declares, but the README still describes the sync and translate wizards as "planned" while both are implemented. Deferred to the release itself; it does not affect this design.
- **Is Linux arm64 worth its matrix slot?** Included because it is free for public repositories and costs one line, but if it proves flaky it is the first entry to drop.
- **In-app updates** remain out of scope. If they are ever wanted, D7's provenance and D3's draft flow both survive; what changes is a signing keypair, `createUpdaterArtifacts`, and re-enabling `uploadUpdaterJson`.
