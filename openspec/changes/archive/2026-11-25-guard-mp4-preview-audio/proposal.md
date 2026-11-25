# Proposal

## Why

Symphonia 0.5.5 ignores MP4 edit lists and fragment decode times, so the audio fallback would place such audio at the wrong time. The owner decided that a simple delay is reproduced exactly, and that what cannot be reproduced is refused, because a wrong preview is worse than none.

## What Changes

- Before decoding an MP4, the backend reads the edit list of the selected track (bounded parsing). Leading empty edits become silence, media before the edit's media time (AAC priming included) is trimmed, and media after the edit's end is dropped, so WAV time equals presentation time.
- Edit lists that are not leading empty edits plus one normal-rate edit, and a fragmented track whose first fragment does not start at 0, are refused with the new code `preview.audio_timing_unsupported` (`en`, `zh-TW`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-workflow`: adds the MP4 timing requirement.

## Impact

- New `src-tauri/src/mp4_timing.rs`; `audio_fallback.rs`, `commands/preview.rs`, `lib.rs`, two fixtures, `errors.json` in both locales. No new dependency, command or DTO.

## Batch:

depends-on: add-sync-audio-fallback
Conflict notes: edits `audio_fallback.rs` and `commands/preview.rs` after `add-sync-audio-fallback`; shares `errors.json` with `rework-sync-detection-flow`. Must land before `add-sync-preview-player`.
