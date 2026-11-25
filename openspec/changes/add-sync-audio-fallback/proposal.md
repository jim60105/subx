# Proposal

## Why

When the WebView cannot play the selected media, the sync preview needs the sound alone. The engine's public loader ignores packet timestamps, holds every sample in memory and cannot be cancelled, so it cannot serve a preview.

## What Changes

- `prepare_preview_audio(session_id)` decodes the open session's audio track to an unnamed temporary mono 16-bit WAV on its container timeline and serves it through the preview media server.
- `release_preview_audio(session_id)` gives the WAV up without closing the session.
- The WAV is an anonymous temporary file: released as soon as it is unused, never by a later start, and nameless so that a crash leaves none.
- Error codes `preview.audio_unsupported` and `preview.cancelled` in both locales.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-workflow`: adds the audio fallback requirements.

## Impact

- Backend: new `audio_fallback.rs`; `media_server.rs` serves open files; two binary fixtures under `src-tauri/tests/fixtures/`; `state.rs`, `commands/preview.rs`, `dto.rs`, `bindings.rs`, `ipc_tests.rs`, `lib.rs`, `Cargo.toml`.
- Frontend: regenerated bindings, `ipc.ts` re-export, `errors.json` in both locales.
- `symphonia` 0.5 (already resolved through the engine) becomes a direct dependency, `tempfile` moves from dev to normal.

## Known limit

Symphonia 0.5.5 does not apply MP4 edit lists; `guard-mp4-preview-audio` applies simple edit lists and refuses the rest before any screen uses this command. No AC-3, DTS or Opus decoder exists.

## Batch:

depends-on: add-sync-media-server
Conflict notes: edits `media_server.rs`, `state.rs`, `commands/preview.rs`, `bindings.rs`, `ipc_tests.rs`, `errors.json` and `Cargo.toml` after `add-sync-media-server`; shares `errors.json` with `rework-sync-detection-flow`. Apply serially.
