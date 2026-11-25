# Design

## Context

Approved design: `docs/superpowers/specs/2026-11-25-sync-preview-design.md`, "Audio fallback". Read in `symphonia-format-isomp4` 0.5.5: `Track::id` is the zero-based index of the `trak` in `moov`; timestamps come from `stts` (time base 1/media timescale) and never use `elst`; a fragment's first timestamp is the end of the previous segment, and `tfdt` is not read; a file without `ftyp` is rejected. Measured on generated files: plain AAC has one edit with `media_time` 1024 (priming); a 2 s late start has an empty edit of 1976 movie ticks (timescale 1000) and then `media_time` 0; Symphonia starts both at `ts=0`.

## Goals / Non-Goals

**Goals:** WAV time equals presentation time, or refusal.

**Non-Goals:** reproducing a delay with silence (owner chose refusal), multi-edit playback, checking fragments after the first, the engine's detection (which ignores edits too).

## Decisions

### D1 `src-tauri/src/mp4_timing.rs`

```rust
pub const MAX_IGNORED_DELAY_MS: u64 = 40;
pub enum Mp4TimingError { Io(std::io::Error), Malformed(&'static str), Unsupported(&'static str) }
/// `None` when the file is not MP4 (no `ftyp` at byte 4). `Some(trim)` is in media-timescale ticks.
pub fn leading_trim<R: Read + Seek>(reader: &mut R, track_index: usize) -> Result<Option<u64>, Mp4TimingError>;
```

Rule, for the track at `track_index` among `moov/trak` in file order:

1. No `edts`, no `elst`, or zero entries: delay 0, trim 0.
2. Leading entries with `media_time == -1` are empty edits; `delay = sum(segment_duration) / movie timescale`. Compared in integers (`u128`): refuse if `sum * 1000 > 40 * timescale`.
3. Then exactly one entry with `media_time >= 0` and rate 1.0 (`1`, `0`): `trim = media_time`. Trailing empty entries are ignored. Anything else, including only empty edits and `media_time < -1` → `Unsupported`.
4. With `moov/mvex`: find the first `moof` whose `traf/tfhd` track id equals the track's `tkhd` id. A `tfdt` other than 0 → `Unsupported`; no `tfdt` is 0; no such `moof` is `Malformed`.

Priming is never a reason to refuse: it is `media_time`, and any `media_time` is trimmed exactly. AAC priming without an edit list is not trimmed: the container does not declare it as hidden, so it is part of the presentation. Accepted residual: up to 40 ms from step 2, below one 50 ms nudge and below the 45 ms detectability threshold of ITU-R BT.1359 for early sound.

Video edits are not consulted. An equal edit on both tracks is no desync between them, but the presentation still starts after the delay and a WAV at 0 would be early against the subtitle, so it is refused. A video-only edit does not move the audio.

### D2 Bounded parsing

Boxes are walked with `Seek`; payloads are never loaded whole. Sizes: 32-bit; `1` → 64-bit follows; `0` → to the end of file, top level only. A size below its header or beyond its parent → `Malformed`. At most 100 000 boxes per container and 4096 `trak`s, and 1024 `elst` entries, each limit exceeded → `Malformed`; entry count must fit the box. More than one `moov`, `edts`, `elst`, `mvhd`, `mdhd` or `tkhd` where one belongs, a missing `mvhd`, `mdhd` or `tkhd`, a zero timescale, an unknown version, or an out-of-range `track_index` → `Malformed`. The top-level walk always reaches the end of file for a non-fragmented file, because a second `moov` must be noticed; `mdat` is skipped by seeking. For a fragmented file it also stops at the first matching `moof` after `moov`. Versions 0 and 1 of `mvhd`, `mdhd`, `tkhd`, `elst`, `tfdt` are read.

### D3 Use

`decode_into` opens a second `File` and calls `leading_trim` after choosing the track and before creating the temporary file. `Malformed` → `AudioFallbackError::Unsupported`; `Io` → `Unreadable`, except `UnexpectedEof`, which is `Malformed`; `Unsupported` → new variant `AudioFallbackError::Timing(String)`, mapped to `preview.audio_timing_unsupported`. `preview.audio_unsupported` would wrongly say the format cannot be decoded.

`TimelineWriter::push` takes `start_frame: i64`. The start is `(ts - trim)` in media ticks (signed), then × rate ÷ timescale with `i128`, rounded down. A negative start drops exactly that many leading frames, regardless of the jitter tolerance, before the existing comparison. Other containers pass trim 0.

### D4 Fixtures

Same generation rules as `add-sync-audio-fallback` D5: `ffmpeg -i tone.wav -ar 44100 -c:a aac priming.mp4` and `ffmpeg -itsoffset 2 -i tone.wav -ar 44100 -c:a aac late.mp4`, about 5.5 KB each. All other cases are built in memory by a test helper that writes boxes.

## Risks / Trade-offs

- [Some valid files are refused] → sound-only preview is unavailable with a specific message; offset editing continues.
- [A fragmented file with a gap after its first fragment is not detected] → recorded; reported to the owner.
- [HE-AAC output rate may differ from the declared rate] → already refused by the rate check of `add-sync-audio-fallback`.
