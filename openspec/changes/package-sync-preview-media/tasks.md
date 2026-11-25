# Tasks

Boundaries: edit only the files named below. Do not push, dispatch a workflow, or publish anything. Tests stay without `// @covers`; annotations are added at archive.

## 1. Configuration

- [ ] 1.1 Apply design D1 to D3. In `scripts/release-config.test.ts` add one test per scenario (reuse `MANIFEST_RAW`; read `src-tauri/tauri.conf.json` with `JSON.parse`; scope the workflow assertion to the "Install Linux system dependencies" step). Verify: `npx vitest run scripts/release-config.test.ts scripts/version-consistency.test.ts` and `cargo check --manifest-path src-tauri/Cargo.toml` (parses the configuration).
- [ ] 1.2 Run the commands of D4 if `flatpak` and network access are available. Expected: both elements print details; record the result or "unverified" in the change report.

## 2. Documentation and integration

- [ ] 2.1 In `docs/verification.md` add "## Manual packaged-preview check" after "Manual Flatpak file-access check", stating that it is not a waiver: install the Flatpak (`flatpak info --show-permissions im.chenj.subx` lists `pulseaudio` under `sockets=`) and run the AppImage; in the sync wizard select a video with sound, skip detection, play it, confirm audible sound and seeking; repeat with a file the WebView cannot play to reach audio mode; on macOS and Windows do the same and record "unverified" when not run. Append to the existing `### Changed` under `[Unreleased]` in `CHANGELOG.md`. Verify: the heading exists.
- [ ] 2.2 Run `openspec validate package-sync-preview-media --strict` and `npm run verify`. Expected: both exit 0.

## Workflow follow-up

- At archive, after `openspec archive package-sync-preview-media --yes`, add `// @covers` lines with the ids from `npm run spec:trace -- --report`.
- Owner: run the manual packaged-preview check, including a release workflow dispatch, before publishing.
