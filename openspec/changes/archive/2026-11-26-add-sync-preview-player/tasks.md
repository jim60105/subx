# Tasks

Boundaries: edit only the files named below. No `src-tauri/` file, `OffsetField` or `OffsetPreview` change. Tests for this change's scenarios stay without `// @covers`; annotations are added at archive. jsdom plays no media: stub `HTMLMediaElement.prototype.play/pause`, define `paused`, `duration`, `currentTime`, `videoWidth` with `Object.defineProperty`, and dispatch events with `fireEvent`.

## 1. Pure modules

- [x] 1.1 Create `cueTiming.ts` and `cueText.ts` with tests per design D1: one test per timing scenario except "Applied times agree with the preview", and "Markup is removed" plus a 100000-character `{\` and `<` input that finishes in under one second. Verify: `npx vitest run src/features/sync/cueTiming.test.ts src/features/sync/cueText.test.ts`.
- [x] 1.2 In the test module of `src-tauri/src/commands/sync.rs` add one test, test code only, calling `shift_subtitle` with the offsets of "Applied times agree with the preview" on cues at 0, 500, 5000 and 7200000 ms and comparing with `max(0, t + offset)` within 1 ms. Verify: `cargo test --manifest-path src-tauri/Cargo.toml commands::sync`.

## 2. Session

- [x] 2.1 Create `previewApi.ts` (with a wrapper test modelled on `syncWizardApi.test.ts`) and `usePreviewSession.ts` per D2 and D3. `renderHook` tests with `previewApi` mocked: every transition of `PreviewMedia`, including audio error → return to video → video error → failed preparation giving `canReturn: false`; a `requestAudio` after that return prepares only once the pending release has settled; "Failed audio playback releases the audio"; "Leaving closes the session" at hook level; "Late open is closed" asserting the order close(first) before open(second); a StrictMode double mount ends with one open session; cues loading, failing and late. Verify: `npx vitest run src/features/sync/usePreviewSession.test.ts src/features/sync/previewApi.test.ts`.

## 3. Player

- [x] 3.1 Add locale keys under `preview` in `src/locales/{en,zh-TW}/sync.json`: `play, pause, seek, volume, noSound, backToVideo, none.title, none.description, opening, preparing.failed, preparing.requested, unavailable.title`. Verify: `npx vitest run src/i18n/localeParity.test.ts src/styles/fontCoverage.test.ts`.
- [x] 3.2 Create `SyncPlayer.tsx/.css` per D4 with tests for "Markup is never interpreted", "User switches a silent video to audio", "Failed switch can return to video", "Sound without a picture is not an error" and all four scenarios of "Preview playback controls" (spy on `requestAnimationFrame`/`cancelAnimationFrame`; for the offset scenario assert `src` unchanged, no `currentTime` write, no `pause`). Assert that a `keydown` of Space on `document.body` calls neither `play` nor `pause`. Verify: `npx vitest run src/features/sync/SyncPlayer.test.tsx src/styles`.
- [x] 3.3 Split `SyncOffsetStep` per D5 and pass the paths from `SyncWizard.tsx`. Mock the module with resolved defaults (`loadPreviewCues` → `[]`, `openPreview` → a session, `closePreview` and `releasePreviewAudio` → undefined, `preparePreviewAudio` → a URL) in `src/features/sync/SyncWizard.test.tsx` (`./previewApi`), `src/features/actionPlacement.test.tsx` (`./sync/previewApi`) and `src/i18n/hardCodedStrings.test.tsx` (`../features/sync/previewApi`). Wizard tests for "No media shows no player", "Media failure falls back to audio", "Unavailable preview does not block" (both causes), "Leaving closes the session" (back, continue, unmount) and "Subtitle failure keeps playback". Existing `@covers` lines stay. Verify: `npx vitest run src/features src/i18n`.
- [x] 3.4 Update the `sync-offset` harness view per D6. Verify: `npx tsc --noEmit`.

## 4. Integration

- [x] 4.1 Add an entry under `[Unreleased]` in `CHANGELOG.md`, creating `### Added` before the existing `### Changed`. Run `openspec validate add-sync-preview-player --strict` and `npm run verify`. Expected: both exit 0.
- [x] 4.2 With `agent-browser` fill rows 1 to 5 of `visual-review.md` at 1100×720 and 860×600, light and dark. For row 6 run `npm run dev:app` if a display is available and report what was observed; otherwise write "unverified". Write "unverified" in row 7 unless run. Verify: every row has an observation.

## Workflow follow-up

- At archive, after `openspec archive add-sync-preview-player --yes`, add `// @covers` lines with the ids from `npm run spec:trace -- --report`.
- Owner runs row 6 and fills "Verdict".
