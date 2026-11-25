# Proposal

## Why

Symphonia 0.5.5 ignores MP4 edit lists and fragment decode times, so the audio fallback would place such audio at the wrong time. The owner decided that a wrong preview is worse than none: refuse a delay the decoder would lose, but do not refuse ordinary AAC priming.

## What Changes

- Before decoding an MP4, the backend reads the edit list of the selected track (bounded parsing). Priming given by `media_time` is trimmed, so WAV time equals presentation time.
- A leading empty edit of more than 40 ms, any edit list that cannot be expressed as one shift, and a fragmented track whose first fragment does not start at 0 are refused with the new code `preview.audio_timing_unsupported` (`en`, `zh-TW`).

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
