# Proposal

## Why

In the sync wizard the user cannot tell whether an offset is right. The approved design (`docs/superpowers/specs/2026-11-25-sync-preview-design.md`) adds a preview that plays the selected media with the subtitle over it. The WebView needs a way to read a local media file with seeking, and the frontend needs the cue times. This change adds that backend; no screen uses it yet.

## What Changes

- A media server bound to `127.0.0.1` on an OS-chosen port, started on first use, that serves exactly the files the backend published, under unguessable tokens, with single byte ranges.
- Commands `load_preview_cues`, `open_preview` and `close_preview`, with at most one open preview session.
- Error codes `preview.media_unreadable` and `preview.server_unavailable`, localized in `en` and `zh-TW`; the code-parity scan learns the `preview` prefix.
- CSP gains only `media-src 'self' http://127.0.0.1:*`.
- Tauri's asset protocol is not enabled; `design.md` D1 states why, citing https://github.com/tauri-apps/tauri/issues/3725.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-workflow`: adds requirements for preview cue loading, the preview media server, the preview session lifetime and the media content policy.

## Impact

- Backend: new `media_server.rs`, `commands/preview.rs`; `state.rs`, `dto.rs`, `bindings.rs`, `ipc_tests.rs`, `lib.rs`, `commands/mod.rs`, `commands/sync.rs` (visibility of one helper), `Cargo.toml`, `Cargo.lock`, `tauri.conf.json`.
- Frontend: regenerated `src/types/bindings.ts`, re-exports in `src/types/ipc.ts`, `errors.json` in both locales, `backendCodeParity.test.ts`.
- New direct dependencies, all already resolved in `Cargo.lock`: `hyper`, `hyper-util`, `http-body-util`, `getrandom`.

## Evidence limits

Only Linux WebKitGTK was probed and playback was muted. Audible output, Windows, macOS, Flatpak and AppImage are unverified by this change.

## Batch:

Order: `add-sync-media-server`, `add-sync-audio-fallback`, `guard-mp4-preview-audio`, `rework-sync-detection-flow`, `add-sync-preview-player`, `add-sync-time-rule`, `package-sync-preview-media`.

depends-on: none
Conflict notes: shares `errors.json`, `bindings.ts`, `ipc_tests.rs` and `Cargo.toml` with `add-sync-audio-fallback`; shares `errors.json` with `rework-sync-detection-flow`; shares `tauri.conf.json` (different keys) with `package-sync-preview-media`. Apply serially.
