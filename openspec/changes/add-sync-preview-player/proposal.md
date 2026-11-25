# Proposal

## Why

With the preview backend and the offset step in place, the user still cannot hear or see whether an offset is right. This change adds the player to the offset step.

## What Changes

- The offset step plays the selected media with the shifted subtitle over it: picture where the WebView decodes it, otherwise sound decoded by the backend, otherwise no preview. Offset editing and Continue are never blocked by the preview.
- The offset is applied in the frontend per frame; changing it does not reload, seek or pause.
- Transport: play/pause, position and duration, seek, volume, "No sound?".
- Look of the stage and subtitle slip is **human-reviewed** in `visual-review.md`; audibility is a **manual** check. Neither is enforced by a test.

`OffsetPreview` stays until `add-sync-time-rule` replaces it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-workflow`: adds preview timing, cue text, media state, playback control and session-lifetime requirements.

## Impact

- New in `src/features/sync/`: `previewApi.ts`, `cueTiming.ts`, `cueText.ts`, `usePreviewSession.ts`, `SyncPlayer.tsx/.css`, with tests; `SyncOffsetStep.tsx/.css`, `SyncWizard.tsx`.
- Both `sync.json` locales, `hardCodedStrings.test.tsx`, `actionPlacement.test.tsx`, `scripts/preview/views.tsx`, `CHANGELOG.md`.
- No backend change.

## Evidence limits

Only Linux WebKitGTK was probed, muted. Audible output, Windows, macOS, Flatpak and AppImage are unverified until run; jsdom plays no media, so tests simulate media events.

## Batch:

depends-on: add-sync-media-server
depends-on: add-sync-audio-fallback
depends-on: guard-mp4-preview-audio
depends-on: rework-sync-detection-flow
Conflict notes: edits `SyncOffsetStep`, `SyncWizard.tsx`, `sync.json` and the preview harness, as does `add-sync-time-rule`, which follows it.
