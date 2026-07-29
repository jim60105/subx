## Why

SubX has no way to reach a user. The repository builds, tests and gates itself on every push, but nothing turns a commit into something a person can install: there is no release workflow, no tag convention, no changelog, and no installable artifact has ever been produced for any platform. Until that exists the project cannot be released at all, and the cross-platform claim — macOS, Linux, Windows — remains unverified, because the Windows and macOS bundle paths have never been exercised even once.

Doing this now, before the first release rather than after, means the release contract is designed rather than improvised: one authoritative version number, one changelog, provenance on every published file, and a human holding the publish button.

## What Changes

- Add `.github/workflows/release.yml`: a tag-triggered workflow that builds SubX for five desktop targets (macOS arm64, macOS x86_64, Linux x86_64, Linux arm64, Windows x86_64) and uploads the bundles to a **draft** GitHub release that a maintainer reviews and publishes.
- Add a `workflow_dispatch` mode to the same workflow that builds every target and publishes nothing, so the matrix can be exercised without minting a version.
- Make `package.json` the single authoritative declaration of the released version: `src-tauri/tauri.conf.json` gains `"version": "../package.json"` instead of its own literal, and a new checked-in test holds `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock` to the same value.
- Add `CHANGELOG.md` (Keep a Changelog) and `scripts/release-notes.mjs`, which renders the release body from the changelog section for the version being released and refuses to release a version that has no section.
- Add `scripts/check-release-tag.mjs`, which fails the release when the pushed tag does not name the declared version — kept as a tested script rather than inline workflow shell, because the workflow's dry-run mode never executes the preparation job.
- Attach SLSA build provenance (`actions/attest-build-provenance`) to every bundle file the workflow publishes.
- Fill in the bundle identity metadata `tauri.conf.json` currently omits — publisher, homepage, category, copyright, license file, short and long description — so the `.deb`, `.rpm`, `.msi` and NSIS packages are properly identified rather than carrying bundler defaults.
- State the unsigned-distribution facts in the release notes: no Apple or Windows code-signing identity exists, so the workflow requires no signing secrets and every release tells users what Gatekeeper and SmartScreen will say.
- Add a `## Download` section to `README.md` and `README.zh-TW.md`, and a manual release smoke-test procedure to `docs/verification.md`.

## Capabilities

### New Capabilities

- `release-pipeline`: How a tagged commit becomes installable artifacts — the version's single source of truth, the target matrix and its pinned build environment, draft-then-publish release assembly, changelog-derived release notes, build provenance, bundle identity metadata, and the unsigned-distribution contract.

### Modified Capabilities

*(None — `verification-gates` describes the CI pipeline's gates and is unaffected; the new version-consistency test runs inside the existing frontend test gate without changing its contract.)*

## Impact

- **New**: `.github/workflows/release.yml`, `CHANGELOG.md`, `scripts/release-notes.mjs` and `scripts/check-release-tag.mjs` (each with a `.d.mts` and a test), `scripts/release-config.test.ts`, `scripts/version-consistency.test.ts`, `.github/release-notes-footer.md`.
- **Modified**: `src-tauri/tauri.conf.json` (version indirection + bundle metadata), `README.md`, `README.zh-TW.md`, `docs/verification.md`, `scripts/spec-coverage.config.json` (one waiver for the manual cross-platform install check).
- **Dependencies**: no new runtime or build dependency; the workflow adds `tauri-apps/tauri-action@v1` and `actions/attest-build-provenance@v3`.
- **Secrets**: none beyond the automatic `GITHUB_TOKEN`.
- **Not affected**: no application code, no IPC surface, no generated bindings, no localization keys.
